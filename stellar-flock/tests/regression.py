#!/usr/bin/env python3
"""Canvas2D game end-to-end regression; do not inline external JS."""
import argparse, contextlib, hashlib, http.server, re, threading, time, urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parents[1]
REPO=HERE.parent
BASE="https://2rwa.github.io/hello-world-pages/stellar-flock/"
NAMES=("index.html","engine.js","logic.js","render.js")
OUT=HERE/"test-artifacts"

def guard():
    s=(REPO/".github/workflows/pages.yml").read_text()
    assert re.search(r"(?m)^concurrency:\s*$",s), "Pages concurrency guard missing: parallel deploys lose the latest version"
    assert re.search(r"(?m)^\s*cancel-in-progress:\s*false\s*$",s), "Do not cancel an active Pages upload"
    print("PASS Pages concurrency policy",flush=True)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(HERE),**kw)
    def log_message(self,*a): pass

@contextlib.contextmanager
def serve():
    s=http.server.ThreadingHTTPServer(("127.0.0.1",0),Handler)
    thread=threading.Thread(target=s.serve_forever,daemon=True); thread.start()
    try: yield "http://127.0.0.1:%d/"%s.server_address[1]
    finally: s.shutdown();s.server_close()

def remote_ready():
    deadline=time.monotonic()+240
    while time.monotonic()<deadline:
        try:
            bad=[]
            for name in NAMES:
                req=urllib.request.Request(BASE+name,headers={"User-Agent":"StellarFlockRegression/1"})
                with urllib.request.urlopen(req,timeout=15) as r:
                    assert r.status==200,(name,r.status)
                    data=r.read()
                if hashlib.sha256(data).digest()!=hashlib.sha256((HERE/name).read_bytes()).digest():bad.append(name)
            if not bad:
                print("PASS Pages HTTP 200: all four assets match checked-out commit",flush=True); return
            print("WAIT stale Pages assets:",bad,flush=True)
        except Exception as e:print("WAIT public fetch:",repr(e),flush=True)
        time.sleep(12)
    raise AssertionError("Published Pages content was not updated to this commit")

def assert_enemy_fire_dodgeable(page, label):
    """Use the real production enemyPos/shootEnemy logic across viewports and waves."""
    result = page.evaluate("""() => {
      const g=window.flockGame;
      const original={H:g.H,wave:g.wave,y:g.player.y,x:g.player.x,
          tx:g.player.tx,shots:g.enemyShots,time:g.time};
      const cases=[], forbidden=[], safe=[];
      try {
        for(const H of [680,1040]) for(const wave of [1,12,30])
          for(const slotY of [159,261,363]) {
            g.H=H;g.wave=wave;g.player.x=240;g.player.tx=240;
            g.player.y=H-105;g.enemyShots=[];
            const low={x:240,y:g.player.y-65,alive:true};
            g.shootEnemy(low);
            if(g.enemyShots.length) forbidden.push({H,wave,slotY,type:'low-shot',bullet:g.enemyShots[0]});
            g.enemyShots=[];
            const e={x:240,y:slotY,slotX:240,slotY,col:3,row:0,
                phase:0,variant:0,state:'formation',shot:false,alive:true};
            g.beginDive(e);e.diveLen=3.2;
            for(let i=0;i<220;i++){
              const was=g.enemyShots.length;
              g.enemyPos(e,1/60);
              if(g.enemyShots.length>was){
                const b=g.enemyShots[g.enemyShots.length-1];
                const speed=Math.hypot(b.vx,b.vy);
                const seconds=(Math.hypot(g.player.x-b.x,g.player.y-b.y)-23)/speed;
                const verticalGap=g.player.y-b.y;
                cases.push({H,wave,slotY,seconds,verticalGap,speed});
                if(seconds<.95 || verticalGap<220)
                    forbidden.push({H,wave,slotY,type:'too-late',seconds,verticalGap,speed});
              }
            }
          }
      }finally {
        g.H=original.H;g.wave=original.wave;g.player.y=original.y;
        g.player.x=original.x;g.player.tx=original.tx;
        g.enemyShots=original.shots;g.time=original.time;
      }
      return {cases,forbidden};
    }""")
    assert result["cases"], (label, "no enemy fire sampled")
    assert not result["forbidden"], (label, "unavoidable enemy projectiles", result["forbidden"][:8])
    print("PASS:",label,"enemy-shot reaction time / distance for",
          len(result["cases"]),"diving shots, low-altitude blocked",flush=True)

def assert_reaction_dodge(page, label):
    """Confirm actual hit/miss physics after a 350 ms human reaction delay."""
    result=page.evaluate("""() => {
      const g=window.flockGame, fields=['H','wave','mode','player','enemies','enemyShots',
        'missiles','particles','rings','textPop','nextWaveTimer','fireTimer',
        'diveTimer','lives','combo','comboTimer','time','hitFlash','jolt'];
      const saved={};for(const k of fields)saved[k]=g[k];
      function run(dodge){
        g.H=880;g.wave=1;g.mode='playing';g.lives=3;
        g.player={x:240,tx:240,y:775,invul:0};
        g.enemies=[];g.enemyShots=[];g.missiles=[];g.particles=[];
        g.rings=[];g.textPop=[];g.nextWaveTimer=100;
        g.fireTimer=100;g.diveTimer=100;g.combo=0;g.comboTimer=0;
        const fired=g.shootEnemy({x:240,y:475});
        for(let i=0;i<105;i++){
          if(dodge&&i===21)g.player.tx=380;
          g.update(1/60);
        }
        return {fired,lives:g.lives,position:g.player.x};
      }
      try{return {stationary:run(false),dodged:run(true)}}
      finally{for(const k of fields)g[k]=saved[k];g.syncHUD()}
    }""")
    assert result["stationary"]["fired"] and result["dodged"]["fired"],result
    assert result["stationary"]["lives"]==2,("stationary must be hit",label,result)
    assert result["dodged"]["lives"]==3,("350 ms reaction should be sufficient",label,result)
    assert result["dodged"]["position"]>335,("player did not move",label,result)
    print("PASS:",label,"actual projectile collision; still=hit, reaction350ms=dodged",flush=True)

def play(url):
    from playwright.sync_api import sync_playwright
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=["--no-sandbox"])
        for mobile,viewport in ((False,{"width":1280,"height":800}),(True,{"width":390,"height":844})):
            ctx=browser.new_context(viewport=viewport,is_mobile=mobile,has_touch=mobile)
            p=ctx.new_page(); errors=[];failed=[];http=[];requests=[]
            p.on("pageerror",lambda e: errors.append(str(e)))
            p.on("requestfailed",lambda r: failed.append(r.url))
            p.on("request",lambda r: requests.append(r.url))
            p.on("response",lambda r: http.append("%s %s"%(r.status,r.url)) if r.status>=400 and "favicon" not in r.url else None)
            response=p.goto(url,wait_until="networkidle",timeout=30000)
            assert response.status==200,(url,response.status)
            for name in NAMES[1:]:assert any(name in u for u in requests),("script not requested",name,requests)
            p.wait_for_function("() => window.flockGame && flockGame.mode==='title'",timeout=12000)
            canvas=p.evaluate("() => [flockGame.canvas.width,flockGame.canvas.height,flockGame.ctx.getImageData(10,10,1,1).data[3]]")
            assert canvas[0]>200 and canvas[1]>300 and canvas[2]==255,("canvas",canvas)
            p.locator("#start").click()
            p.wait_for_function("() => flockGame.mode==='playing' && flockGame.missiles.length>0",timeout=8000)
            assert not p.locator("#overlay").is_visible()
            before=p.evaluate("flockGame.player.tx")
            r=p.locator("#screen").bounding_box()
            x=r["x"]+r["width"]*.8;y=r["y"]+r["height"]*.8
            if mobile:p.touchscreen.tap(x,y)
            else:p.mouse.move(x,y)
            p.wait_for_function("old => Math.abs(flockGame.player.tx-old)>20",arg=before,timeout=4000)
            p.locator("#barrage").click()
            assert p.evaluate("flockGame.burstCD")>0
            assert p.locator("#barrage").is_disabled()
            p.locator("#pause").click()
            assert p.evaluate("flockGame.mode")=="paused" and p.locator("#overlay").is_visible()
            p.locator("#start").click()
            assert p.evaluate("flockGame.mode")=="playing"
            p.evaluate("""() => {for(const e of flockGame.enemies)e.alive=false;
                for(const m of flockGame.missiles)m.target=null;flockGame.nextWaveTimer=.03}""")
            p.wait_for_function("() => flockGame.wave>=2",timeout=6000)
            assert_enemy_fire_dodgeable(p, 'mobile' if mobile else 'desktop')
            assert_reaction_dodge(p, 'mobile' if mobile else 'desktop')
            assert not (errors or failed or http),("browser errors",errors,failed,http)
            p.screenshot(path=str(OUT/("mobile.png" if mobile else "desktop.png")))
            print("PASS",("mobile" if mobile else "desktop"),"loaded JS/canvas/start/autofire/touch/burst/pause/retarget/wave",flush=True)
            ctx.close()
        browser.close()

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--mode",choices=["guard","local","deployed"],required=True)
    mode=p.parse_args().mode
    if mode=="guard":guard()
    elif mode=="local":
        with serve() as url:play(url)
    else:remote_ready();play(BASE)
