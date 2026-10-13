export const W=960,H=600;
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist2=(a,b)=> (a.x-b.x)**2+(a.y-b.y)**2;
export class Game{
 constructor(){this.keys=new Set();this.pointer=null;this.best=0;try{this.best=Number(localStorage.getItem('liquid-strike-best')||0)}catch{}this.status='title';this.time=0;this.events=[];this.reset();}
 reset(){
  this.time=0;this.score=0;this.wave=0;this.combo=0;this.comboTime=0;this.bombs=2;this.player={x:480,y:515,hp:5,power:1,inv:0,fire:0};this.enemies=[];this.shots=[];this.hostiles=[];this.particles=[];this.pickups=[];this.shock=0;this.waveDelay=0;this.spawnLeft=0;this.spawnClock=0;this.kills=0;this.events=[];this.spawnWave();
 }
 start(){this.reset();this.status='running';this.events.push({type:'start'})}
 pause(){if(this.status==='running')this.status='paused';else if(this.status==='paused')this.status='running'}
 event(type,x=480,y=280){this.events.push({type,x,y})}
 spawnWave(){
  this.wave++;this.spawnLeft=this.wave%4===0?1:Math.min(12,4+this.wave*2);
  this.spawnClock=.15;this.waveDelay=0;this.event('wave');
 }
 enemy(x,y,type=0,small=false){
  const boss=type===3;const rad=boss?65:small?15:type===2?33:26;
  const hp=boss?28+this.wave*5:small?1:type===2?8:3+Math.floor(this.wave/4);
  const e={x,y,type,small,rad,hp,maxhp:hp,age:rnd(0,6),seed:rnd(0,100),vy:boss?27:rnd(38,66)+this.wave*2,vx:rnd(-22,22),fire:rnd(1.1,3),lobes:boss?5:small?2:type===2?4:3,dead:false};
  this.enemies.push(e);return e;
 }
 damageEnemy(e,amount){
  if(e.dead)return;e.hp-=amount;this.spark(e.x,e.y,3,e.type===1?'#d9b2ff':'#a0ffff');
  if(e.hp>0)return;
  e.dead=true;this.kills++;this.combo=Math.min(18,this.combo+1);this.comboTime=3.4;
  const bonus=(e.type===3?2000:e.small?45:e.type===2?260:100)*Math.min(5,1+this.combo*.2);
  this.score+=Math.floor(bonus);this.event('kill',e.x,e.y);this.spark(e.x,e.y,e.type===3?50:19,e.type===1?'#ad83ff':'#6bfff3');
  if((e.type===3||e.type===2)&&!e.small){
   const count=e.type===3?5:2;
   for(let i=0;i<count;i++){const a=i*6.283/count;const c=this.enemy(e.x+Math.cos(a)*22,e.y+Math.sin(a)*18,0,true);c.vx=Math.cos(a)*90;c.vy=55+Math.sin(a)*50;}
  }
  if(e.type===3||Math.random()<.13){this.pickups.push({x:e.x,y:e.y,kind:e.type===3?'power':Math.random()<.7?'power':'heal',age:0})}
 }
 spark(x,y,count,color){for(let i=0;i<count;i++){const a=rnd(0,Math.PI*2),s=rnd(25,230);this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,age:0,life:rnd(.25,.8),color,size:rnd(1.5,5)})}if(this.particles.length>270)this.particles.splice(0,this.particles.length-270)}
 useBomb(){
  if(this.status!=='running'||this.bombs<1)return false;
  this.bombs--;this.shock=.58;this.hostiles=[];this.event('bomb',this.player.x,this.player.y);
  for(const e of [...this.enemies])this.damageEnemy(e,12);return true;
 }
 damagePlayer(){
  const p=this.player;if(p.inv>0||this.status!=='running')return;
  p.hp--;p.inv=1.5;this.combo=0;this.event('hurt',p.x,p.y);this.spark(p.x,p.y,24,'#ff9377');
  if(p.hp<=0){this.status='over';this.event('over');if(this.score>this.best){this.best=this.score;try{localStorage.setItem('liquid-strike-best',String(this.best))}catch{}}}
 }
 fire(){
  const p=this.player;const n=p.power===1?1:p.power===2?2:3;
  for(let i=0;i<n;i++){const d=i-(n-1)/2;this.shots.push({x:p.x+d*17,y:p.y-25,vx:d*48,vy:-710,damage:1,age:0})}
  this.event('shoot',p.x,p.y);p.fire=Math.max(.092,.17-(p.power-1)*.025);
 }
 update(dt){
  if(this.status!=='running')return;dt=clamp(dt,0,.05);this.time+=dt;
  const p=this.player;p.inv=Math.max(0,p.inv-dt);
  const dx=(this.keys.has('ArrowRight')||this.keys.has('KeyD')?1:0)-(this.keys.has('ArrowLeft')||this.keys.has('KeyA')?1:0);
  const dy=(this.keys.has('ArrowDown')||this.keys.has('KeyS')?1:0)-(this.keys.has('ArrowUp')||this.keys.has('KeyW')?1:0);
  const m=Math.hypot(dx,dy)||1;p.x+=dx/m*420*dt;p.y+=dy/m*340*dt;
  if(this.pointer){const k=1-Math.exp(-13*dt);p.x+=(this.pointer.x-p.x)*k;p.y+=(this.pointer.y-p.y)*k}
  p.x=clamp(p.x,46,914);p.y=clamp(p.y,300,555);
  p.fire-=dt;if(p.fire<=0)this.fire();
  if(this.spawnLeft>0){this.spawnClock-=dt;if(this.spawnClock<=0&&this.enemies.length<18){
   let type=this.wave%4===0?3:Math.random()<.16?2:Math.random()<.3?1:0;
   this.enemy(rnd(105,855),type===3?-85:-40,type);this.spawnLeft--;this.spawnClock=type===3?1.4:Math.max(.28,.85-this.wave*.035);
  }}
  for(const e of this.enemies){
   e.age+=dt;e.y+=e.vy*dt;
   e.x+=e.vx*dt+Math.sin(e.age*2.3+e.seed)*16*dt;
   if(e.x<65||e.x>895)e.vx*=-1;e.x=clamp(e.x,60,900);
   e.fire-=dt;
   if(e.fire<=0&&e.y>40&&e.y<420&&!e.small){
    const aim=Math.atan2(p.y-e.y,p.x-e.x);const count=e.type===3?5:e.type===2?3:1;
    for(let k=0;k<count;k++){const a=aim+(k-(count-1)/2)*.24;this.hostiles.push({x:e.x,y:e.y,vx:Math.cos(a)*rnd(95,135),vy:Math.sin(a)*rnd(95,135),age:0})}
    e.fire=e.type===3?1.5:rnd(2.2,4.3);this.event('enemyfire',e.x,e.y);
   }
   if(e.y>610){e.dead=true;if(!e.small)this.damagePlayer()}
   if(dist2(e,p)<(e.rad*.72+17)**2){e.dead=true;this.damagePlayer();this.spark(e.x,e.y,12,'#ff9b92')}
  }
  for(const b of this.shots){b.x+=b.vx*dt;b.y+=b.vy*dt;b.age+=dt;
   for(const e of this.enemies){if(e.dead)continue;if(dist2(b,e)<(e.rad*.9+7)**2){b.age=99;this.damageEnemy(e,b.damage);break}}
  }
  this.shots=this.shots.filter(b=>b.age<2&&b.y>-20);
  for(const b of this.hostiles){b.x+=b.vx*dt;b.y+=b.vy*dt;b.age+=dt;if(dist2(b,p)<(p.inv>0?0:18)**2){b.age=99;this.damagePlayer()}}
  this.hostiles=this.hostiles.filter(b=>b.age<7&&b.y<625&&b.x>-30&&b.x<990);
  this.enemies=this.enemies.filter(e=>!e.dead);
  for(const item of this.pickups){item.y+=66*dt;item.age+=dt;if(dist2(item,p)<32**2){item.age=99;if(item.kind==='heal')p.hp=Math.min(5,p.hp+1);else p.power=Math.min(3,p.power+1);this.event('pickup',item.x,item.y)}}
  this.pickups=this.pickups.filter(i=>i.age<9&&i.y<620);
  for(const v of this.particles){v.x+=v.vx*dt;v.y+=v.vy*dt;v.vx*=1-1.8*dt;v.vy*=1-1.8*dt;v.age+=dt}
  this.particles=this.particles.filter(v=>v.age<v.life);
  this.shock=Math.max(0,this.shock-dt);this.comboTime-=dt;if(this.comboTime<=0)this.combo=0;
  if(this.spawnLeft===0&&this.enemies.length===0){this.waveDelay+=dt;if(this.waveDelay>1.55)this.spawnWave()}
 }
 get multiplier(){return Math.min(5,1+this.combo*.2).toFixed(1)}
 get debug(){return {status:this.status,wave:this.wave,score:this.score,hp:this.player.hp,enemies:this.enemies.length,shots:this.shots.length,playerX:this.player.x,bombs:this.bombs,time:this.time}}
}