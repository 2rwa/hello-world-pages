'use strict';
FlightGame.prototype.update=function(dt){this.time+=dt;this.jolt=Math.max(0,this.jolt-dt*18);this.hitFlash=Math.max(0,this.hitFlash-dt);this.waveFlash=Math.max(0,this.waveFlash-dt);for(const s of this.stars)s.y=(s.y+dt*s.speed)%1;
  if(this.mode!=='playing')return;
  this.player.y=this.H-105;this.player.invul=Math.max(0,this.player.invul-dt);this.burstCD=Math.max(0,this.burstCD-dt);this.comboTimer=Math.max(0,this.comboTimer-dt);if(!this.comboTimer)this.combo=0;
  let d=0;if(this.keys.ArrowLeft||this.keys.KeyA)d--;if(this.keys.ArrowRight||this.keys.KeyD)d++;if(d){this.player.tx=clamp(this.player.tx+d*420*dt,30,450)}this.player.x+=(this.player.tx-this.player.x)*Math.min(1,dt*13);
  for(const e of this.enemies)if(e.alive){const px=e.x,py=e.y;this.enemyPos(e,dt);e.vx=(e.x-px)/Math.max(dt,.001);e.vy=(e.y-py)/Math.max(dt,.001)}
  this.diveTimer-=dt;const alive=this.enemies.filter(e=>e.alive);if(this.diveTimer<=0&&alive.length){const candidates=alive.filter(e=>e.state==='formation');if(candidates.length){this.beginDive(candidates[Math.floor(rnd(0,candidates.length))]);if(this.wave>2&&Math.random()<.3&&candidates.length>1)this.beginDive(candidates[Math.floor(rnd(0,candidates.length))])}this.diveTimer=clamp(rnd(.7,1.25)-this.wave*.055,.36,1.4)}
  this.fireTimer-=dt;if(this.fireTimer<=0&&alive.length){const targets=this.targets(),primary=targets[0];this.spawnMissile(primary,0,2);if(this.wave>1||Math.random()>.35)this.spawnMissile(targets[Math.min(1,targets.length-1)],1,2);this.fireTimer=.29;this.beep(410,.025,.006)}
  this.stepMissiles(dt);
  for(let i=this.enemyShots.length-1;i>=0;i--){const b=this.enemyShots[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;b.trail.push({x:b.x,y:b.y});if(b.trail.length>9)b.trail.shift();if(b.life<=0||b.y>this.H+30)this.enemyShots.splice(i,1);else if(dist2(b.x,b.y,this.player.x,this.player.y)<23**2){this.enemyShots.splice(i,1);this.hitPlayer()}}
  for(const e of alive)if(e.alive&&e.state==='dive'&&dist2(e.x,e.y,this.player.x,this.player.y)<32**2)this.hitPlayer();
  this.particles=this.particles.filter(p=>(p.life-=dt)>0);for(const p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.max(.1,1-dt*1.6);p.vy*=Math.max(.1,1-dt*1.6)}this.rings=this.rings.filter(r=>(r.life-=dt)>0);for(const r of this.rings)r.r+=270*dt;this.textPop=this.textPop.filter(p=>(p.t-=dt)>0);for(const p of this.textPop)p.y-=dt*33;
  if(!alive.some(e=>e.alive)){if(!this.nextWaveTimer)this.nextWaveTimer=1.65;this.nextWaveTimer-=dt;if(this.nextWaveTimer<=0){this.wave++;this.setupWave();this.beep(940,.25,.07)}}
  this.syncHUD()
 
};
FlightGame.prototype.loop=function(now){const dt=Math.min((now-this.last)/1000||.016,.034);this.last=now;this.update(dt);this.draw();requestAnimationFrame(this.loop.bind(this))};