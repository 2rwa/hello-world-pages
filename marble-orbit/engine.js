/* Shared, deterministic game rules + spherical arena physics (no DOM). */
(()=>{
"use strict";
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=a=>Math.hypot(a[0],a[1],a[2]);
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const unit=a=>mul(a,1/(len(a)||1));
const mix=(a,b,t)=>a+(b-a)*t;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rand=()=>unit([Math.random()-.5,Math.random()-.5,Math.random()-.5]);
const colors=[[1.,.74,.18],[1.,.31,.48],[.8,.35,1.],[.16,.79,1.],[1.,.52,.2],[.6,.44,1.],[1.,.24,.36],[.22,.77,.9]];
const verdict=(playerRadius,enemyRadius)=>playerRadius>=enemyRadius*1.14?"eat":enemyRadius>=playerRadius*1.13?"hurt":"bounce";
const enemyRadius=(e,t)=>{
  const wave=.5+.5*Math.sin(t*2*Math.PI/e.period+e.phase);
  const eased=wave*wave*(3-2*wave);
  return mix(e.min,e.max,eased);
};
class MarbleEngine{
 constructor(){this.reset();}
 reset(){
  this.time=0;this.left=90;this.score=0;this.eaten=0;this.health=3;
  this.charge=1;this.invincible=2;this.mode="ready";this.events=[];this.combo=0;
  this.player={p:[0,-.40,.40],v:[0,0,0],r:.205,c:colors[0],cool:0,alive:true};
  this.enemies=[];
  for(let i=0;i<7;i++)this.enemies.push(this.spawn(i,true));
  this.balls=[this.player,...this.enemies];
  this.control=[0,-.35,0];this.lastEnemyFlip=0;
 }
 spawn(i,initial){
  const e={
   p:[0,0,0],v:[0,0,0],r:.17,c:colors[(i+1)%colors.length],
   min:.11+(i%3)*.01,max:.29+(i%4)*.042,
   period:3.6+(i%4)*.7,phase:i*1.93+.7,cool:0,
   g:rand(),gTarget:rand(),gClock:1.0+i*.25,
   respawn:0,alive:true,id:i
  };
  e.r=enemyRadius(e,this.time);
  for(let j=0;j<120;j++){
    const p=rand().map(v=>v*(.48+Math.random()*.65));
    if(len(sub(p,this.player.p))>e.r+this.player.r+.30 &&
       this.enemies.every(other=>!other.alive||len(sub(p,other.p))>e.r+other.r+.1)){
       e.p=p;return e;
    }
  }
  e.p=[Math.cos(i*2.4)*.9,Math.sin(i*2.1)*.8,Math.sin(i*3.3)*.6];
  return e;
 }
 start(){this.mode="running";}
 get visible(){return [this.player,...this.enemies.filter(e=>e.alive)];}
 get prey(){return this.enemies.filter(e=>e.alive&&verdict(this.player.r,e.r)==="eat").length;}
 get threats(){return this.enemies.filter(e=>e.alive&&verdict(this.player.r,e.r)==="hurt").length;}
 boost(){
  if(this.mode!=="running"||this.charge<.2)return false;
  this.charge-=.2;
  this.player.v=add(this.player.v,mul(unit(this.control),1.65));
  this.invincible=Math.max(this.invincible,.22);
  this.events.push({kind:"boost"});
  return true;
 }
 tick(dt,steer,sizeMode){
  if(this.mode!=="running")return;
  dt=Math.min(dt,.025);this.events=[];
  this.time+=dt;this.left-=dt;
  this.invincible=Math.max(0,this.invincible-dt);
  const wantingGrow=sizeMode==="grow"&&this.charge>.01;
  this.charge=clamp(this.charge+(wantingGrow?-0.31:.22)*dt,0,1);
  const sizeTarget=wantingGrow?.335:sizeMode==="shrink"?.132:.205;
  this.player.r=mix(this.player.r,sizeTarget,Math.min(1,dt*4.5));
  const grav=len(steer)>.15?unit(steer):[0,-1,0];
  this.control=unit(add(mul(this.control,Math.exp(-dt*9)),mul(grav,1-Math.exp(-dt*9))));
  this.move(this.player,this.control,dt,8.6*(.205/this.player.r)**.55,this.player.r<.17?3.25:this.player.r>.27?1.68:2.35);
  for(let i=0;i<this.enemies.length;i++){
   const e=this.enemies[i];
   if(!e.alive){
    e.respawn-=dt;
    if(e.respawn<=0){this.enemies[i]=this.spawn(i,false);this.events.push({kind:"spawn"});}
    continue;
   }
   e.r=enemyRadius(e,this.time);
   e.gClock-=dt;
   if(e.gClock<=0){
    e.gClock=1.1+Math.random()*2;
    e.gTarget=rand();this.lastEnemyFlip=this.time;
   }
   e.g=unit(add(mul(e.g,1-Math.min(1,dt*2.4)),mul(e.gTarget,Math.min(1,dt*2.4))));
   const towards=unit(sub(this.player.p,e.p));
   const hunting=e.r>this.player.r*1.14;
   const force=unit(add(mul(e.g,1),mul(towards,hunting?.38:-.10)));
   this.move(e,force,dt,hunting?3.9:3.1,hunting?1.65:1.9);
   e.cool=Math.max(0,e.cool-dt);
  }
  this.collideEnemies();
  this.collidePlayer();
  if(this.health<=0){this.mode="lose";this.events.push({kind:"lose"});}
  else if(this.eaten>=10){this.mode="win";this.events.push({kind:"win"});}
  else if(this.left<=0){this.left=0;this.mode="timeout";this.events.push({kind:"timeout"});}
  this.tint();
 }
 move(b,g,dt,power,limitSpeed){
  b.v=mul(add(b.v,mul(g,power*dt)),Math.exp(-dt*.52));
  const speed=len(b.v);if(speed>limitSpeed)b.v=mul(b.v,limitSpeed/speed);
  b.p=add(b.p,mul(b.v,dt));
  this.wall(b);
 }
 wall(b){
  const d=len(b.p),limit=1.52-b.r;
  if(d>limit){
   const n=unit(b.p),normalSpeed=dot(b.v,n);
   b.p=mul(n,limit);
   if(normalSpeed>0)b.v=mul(sub(b.v,mul(n,normalSpeed*1.65)),.985);
  }
 }
 separate(a,b){
  const delta=sub(b.p,a.p),distance=len(delta),min=a.r+b.r;
  if(distance>=min)return false;
  const n=distance<.00001?[1,0,0]:mul(delta,1/distance);
  const push=Math.min((min-distance)*.50,.12);
  a.p=sub(a.p,mul(n,push));b.p=add(b.p,mul(n,push));
  const along=dot(sub(b.v,a.v),n);
  if(along<0){
   const impulse=mul(n,-along*.79);
   a.v=sub(a.v,impulse);b.v=add(b.v,impulse);
  }
  this.wall(a);this.wall(b);return true;
 }
 collideEnemies(){
  for(let i=0;i<this.enemies.length;i++)for(let j=i+1;j<this.enemies.length;j++){
   const a=this.enemies[i],b=this.enemies[j];
   if(a.alive&&b.alive)this.separate(a,b);
  }
 }
 collidePlayer(){
  const p=this.player;
  for(const e of this.enemies){
   if(!e.alive||len(sub(p.p,e.p))>=p.r+e.r)continue;
   const outcome=verdict(p.r,e.r);
   if(outcome==="eat"){
    const points=100+Math.round(e.max*120);
    e.alive=false;e.respawn=1.8+Math.random()*1.1;
    this.score+=points;this.eaten++;this.combo++;
    this.charge=clamp(this.charge+.15,0,1);
    this.events.push({kind:"eat",points,enemy:e.id});
    p.v=add(p.v,mul(unit(sub(p.p,e.p)),.65));continue;
   }
   if(outcome==="hurt"&&this.invincible<=0){
    this.health--;this.combo=0;this.invincible=1.45;
    this.events.push({kind:"hurt",health:this.health});
    p.v=add(p.v,mul(unit(sub(p.p,e.p)),2.1));
   }
   this.separate(p,e);
  }
 }
 tint(){
  for(const e of this.enemies){
   if(!e.alive)continue;
   const v=verdict(this.player.r,e.r);
   e.c=v==="eat"?[.14,.98,.72]:v==="hurt"?[1.,.21,.30]:[.88,.52,.83];
  }
  this.player.c=this.invincible>0&&Math.floor(this.time*9)%2?[1.,.95,.48]:[1.,.74,.18];
 }
}
window.MarbleEngine=MarbleEngine;
window.MarbleRules={verdict,enemyRadius};
})();