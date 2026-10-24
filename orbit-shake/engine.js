/* Inner-sphere game rules: the camera never affects world physics. */
(()=>{"use strict";
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=a=>Math.hypot(a[0],a[1],a[2]);
const unit=a=>mul(a,1/(len(a)||1));
const clamp=(a,l,h)=>Math.max(l,Math.min(h,a));
const rand=()=>unit([Math.random()-.5,Math.random()-.5,Math.random()-.5]);
const tangent=(v,n)=>sub(v,mul(n,dot(v,n)));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function verdict(player,enemy){
 if(player>=enemy*1.15)return "prey";
 if(enemy>=player*1.13)return "danger";
 return "neutral";
}
class TiltArena{
 constructor(){this.reset();}
 reset(){
  this.time=0;this.remaining=90;this.health=3;this.score=0;this.caught=0;
  this.mode="ready";this.events=[];this.cooldown=0;this.burst=0;this.invincible=1.7;this.flash=0;
  this.player={p:[0,-.28,1.43],v:[0,0,0],r:.195,c:[1,.71,.17],id:-1,alive:true};
  this.player.p=mul(unit(this.player.p),1.51-this.player.r);
  this.enemies=[];
  for(let i=0;i<7;i++)this.enemies.push(this.makeEnemy(i));
  this.balls=[this.player,...this.enemies];
 }
 makeEnemy(i){
  const e={id:i,p:[0,0,0],v:[0,0,0],r:.2,c:[1,.25,.32],alive:true,
   min:.118+(i%3)*.012,max:.28+(i%4)*.036,
   period:3.35+(i%4)*.78,phase:i*1.24+.4,
   g:rand(),target:rand(),change:.8+Math.random()*2,respawn:0};
  e.r=this.radius(e);
  for(let trial=0;trial<140;trial++){
   e.p=mul(rand(),1.51-e.r);
   if(len(sub(e.p,this.player.p))<.75)continue;
   if(this.enemies.every(q=>!q.alive||len(sub(e.p,q.p))>e.r+q.r+.16))return e;
  }
  return e;
 }
 radius(e){
  const w=.5+.5*Math.sin(this.time*6.283185307/e.period+e.phase);
  const soft=w*w*(3-2*w);
  return e.min+(e.max-e.min)*soft;
 }
 start(){this.mode="running";}
 get active(){return [this.player,...this.enemies.filter(e=>e.alive)];}
 get prey(){return this.enemies.filter(e=>e.alive&&verdict(this.player.r,e.r)==="prey").length;}
 get danger(){return this.enemies.filter(e=>e.alive&&verdict(this.player.r,e.r)==="danger").length;}
 shake(){
  if(this.mode!=="running"||this.cooldown>0)return false;
  this.burst=1.15;this.cooldown=2.25;this.flash=1;
  this.invincible=Math.max(this.invincible,.14);
  this.events.push({type:"shake"});
  return true;
 }
 move(b,force,dt,accelerate,maxSpeed){
  const n=unit(b.p);
  const acc=tangent(force,n);
  b.v=mul(add(b.v,mul(acc,dt*accelerate)),Math.exp(-dt*1.28));
  b.v=tangent(b.v,n);
  const speed=len(b.v);
  if(speed>maxSpeed)b.v=mul(b.v,maxSpeed/speed);
  b.p=mul(unit(add(b.p,mul(b.v,dt))),1.51-b.r);
  b.v=tangent(b.v,unit(b.p));
 }
 separate(a,b){
  const d=sub(b.p,a.p),dist=len(d),desired=a.r+b.r;
  if(dist>=desired)return;
  const n=dist<1e-6?[1,0,0]:mul(d,1/dist);
  const gap=Math.min((desired-dist)*.50,.13);
  a.p=mul(unit(sub(a.p,mul(n,gap))),1.51-a.r);
  b.p=mul(unit(add(b.p,mul(n,gap))),1.51-b.r);
  const rel=dot(sub(b.v,a.v),n);
  if(rel<0){
   a.v=sub(a.v,mul(n,-rel*.68));
   b.v=add(b.v,mul(n,-rel*.68));
  }
  a.v=tangent(a.v,unit(a.p));
  b.v=tangent(b.v,unit(b.p));
 }
 collide(){
  const p=this.player;
  for(let i=0;i<this.enemies.length;i++){
   const e=this.enemies[i];
   if(!e.alive)continue;
   for(let j=i+1;j<this.enemies.length;j++){
    const other=this.enemies[j];
    if(other.alive)this.separate(e,other);
   }
   if(len(sub(e.p,p.p))>=e.r+p.r)continue;
   const state=verdict(p.r,e.r);
   if(state==="prey"){
    e.alive=false;e.respawn=1.25+Math.random()*.85;
    this.score+=120;this.caught++;
    this.cooldown=Math.max(0,this.cooldown-.18);
    this.flash=Math.max(this.flash,.55);
    this.events.push({type:"catch",count:this.caught});
    continue;
   }
   if(state==="danger"&&this.invincible<=0){
    this.health--;this.invincible=1.5;this.flash=1.4;
    this.events.push({type:"hurt",health:this.health});
   }
   this.separate(p,e);
  }
 }
 tick(dt,tilt,eyeBasis){
  if(this.mode!=="running")return;
  dt=clamp(dt,0,.025);
  this.events=[];
  this.time+=dt;this.remaining=Math.max(0,this.remaining-dt);
  this.cooldown=Math.max(0,this.cooldown-dt);
  this.burst=Math.max(0,this.burst-dt);
  this.invincible=Math.max(0,this.invincible-dt);
  this.flash=Math.max(0,this.flash-dt*2);
  const wanted=this.burst>.05?.354:.195;
  this.player.r+=(wanted-this.player.r)*Math.min(1,dt*(this.burst>.05?13:4.6));
  this.player.p=mul(unit(this.player.p),1.51-this.player.r);
  const screenSteer=add(mul(eyeBasis.right,tilt[0]),mul(eyeBasis.up,tilt[1]));
  const mag=len(screenSteer);
  const force=mag<.04?[0,0,0]:mul(screenSteer,1/Math.max(1,mag));
  this.move(this.player,force,dt,5.5,this.burst>.05?2.1:2.65);
  for(let i=0;i<this.enemies.length;i++){
   let e=this.enemies[i];
   if(!e.alive){
    e.respawn-=dt;
    if(e.respawn<=0)this.enemies[i]=this.makeEnemy(i);
    continue;
   }
   const before=e.r;e.r=this.radius(e);
   if(Math.abs(e.r-before)>.0001)e.p=mul(unit(e.p),1.51-e.r);
   e.change-=dt;
   if(e.change<=0){e.change=1.1+Math.random()*1.65;e.target=rand();}
   e.g=unit(add(mul(e.g,1-Math.min(1,dt*2.2)),mul(e.target,Math.min(1,dt*2.2))));
   const toPlayer=unit(sub(this.player.p,e.p));
   const force=unit(add(e.g,mul(toPlayer,e.r>this.player.r*1.2?.28:-.12)));
   this.move(e,force,dt,3.1,1.35);
  }
  this.collide();
  for(const e of this.enemies){
   if(!e.alive)continue;
   const v=verdict(this.player.r,e.r);
   e.c=v==="prey"?[.09,1.,.65]:v==="danger"?[1.,.13,.21]:[.70,.48,.89];
  }
  this.player.c=this.invincible>0&&Math.floor(this.time*10)%2?[1.,.97,.66]:this.burst>.05?[1.,.95,.26]:[1.,.69,.16];
  if(this.health<=0){this.mode="lose";this.events.push({type:"lose"});}
  else if(this.caught>=8){this.mode="win";this.events.push({type:"win"});}
  else if(this.remaining<=0){this.mode="time";this.events.push({type:"time"});}
 }
}
window.TiltArena=TiltArena;
window.TiltRules={verdict,cross};
})();