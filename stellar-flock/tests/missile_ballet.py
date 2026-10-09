"""End-to-end missile personality, trajectory, kill and retarget regression."""
def assert_missile_ballet(page, label):
    data=page.evaluate("""() => {
      const g=window.flockGame;
      const fields=['H','wave','mode','player','enemies','enemyShots','missiles',
        'particles','rings','textPop','nextWaveTimer','fireTimer','diveTimer','score',
        'lives','combo','comboTimer','time','jolt','hitFlash','missileSerial'];
      const saved={};
      for(const k of fields)saved[k]=g[k];
      function reset(){
        g.mode='playing';g.wave=1;g.player={x:240,tx:240,y:g.H-105,invul:999};
        g.enemies=[];g.enemyShots=[];g.missiles=[];g.particles=[];
        g.rings=[];g.textPop=[];g.nextWaveTimer=100;g.fireTimer=100;g.diveTimer=100;
        g.score=0;g.lives=3;g.combo=0;g.comboTimer=0;g.missileSerial=0;
      }
      function enemy(x=240,y=180,id=1){return {id,x,y,alive:true,hp:1,variant:0,
         state:'formation',vx:0,vy:0,phase:0,col:3,row:0,slotX:x,slotY:y};}
      function run(style){
        reset();const e=enemy();g.enemies=[e];g.spawnMissile(e,style,12,true);
        const m=g.missiles[0],name=m?.personality?.name??null;
        const samples=[[m?.x,m?.y]];let arclength=0,lastx=m?.x,lasty=m?.y;
        let maxAbsX=0,steps=0;
        for(let i=0;i<420&&e.alive;i++){
          g.stepMissiles(1/60);steps++;
          if(g.missiles.includes(m)){
            arclength+=Math.hypot(m.x-lastx,m.y-lasty);
            lastx=m.x;lasty=m.y;maxAbsX=Math.max(maxAbsX,Math.abs(m.x-240));
            if(i%12===0)samples.push([m.x,m.y]);
          }
        }
        return {style,name,hit:!e.alive,maxAbsX,steps,arclength,samples};
      }
      try {
        const cases=[0,1,2,3].map(run);
        reset();const target=enemy();g.enemies=[target];
        for(let i=0;i<12;i++)g.spawnMissile(target,i,12,true);
        const names=g.missiles.map(m=>m.personality?.name??null);
        for(let i=0;i<16;i++)g.stepMissiles(1/60);
        const spread=Math.max(...g.missiles.map(m=>m.x))-
                     Math.min(...g.missiles.map(m=>m.x));
        reset();const a=enemy(210,210,10),b=enemy(310,160,11);
        g.enemies=[a,b];g.spawnMissile(a,0,12,true);
        const missile=g.missiles[0];a.alive=false;
        g.stepMissiles(1/60);const reacquired=missile.target===b;
        for(let i=0;i<420&&b.alive;i++)g.stepMissiles(1/60);
        return {cases,names,spread,reacquired,retargetHit:!b.alive};
      }finally{for(const k of fields)g[k]=saved[k];g.syncHUD()}
    }""")
    assert len(set(data["names"])) >= 4, (label, "all four personalities in BURST", data["names"])
    assert all(x["hit"] for x in data["cases"]), (label, "missile failed to hit", data["cases"])
    assert all(x["name"] for x in data["cases"]), (label, "missing personality", data["cases"])
    assert data["spread"] > 65, (label, "BURST lacks dramatic opening fan", data["spread"])
    assert max(x["maxAbsX"] for x in data["cases"]) > 65, (label, "flight arcs too straight", data["cases"])
    assert data["reacquired"] and data["retargetHit"], (label, "target reacquisition", data)
    print("PASS:",label,"four missile personalities, individual arcs, burst fan, "
          "4/4 hits, automatic retarget",flush=True)
