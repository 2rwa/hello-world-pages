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
