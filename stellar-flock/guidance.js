'use strict';
// Four missile temperaments. Every rocket keeps its own state and inertia.
const MISSILE_PERSONALITIES=[
 {name:'STRIKER',delay:.09,launchSpeed:125,cruise:235,top:550,accel:340,turn:8.4,spread:65,lift:25,weave:7,freq:10,lead:.075,trail:36,hue:188},
 {name:'DANCER',delay:.31,launchSpeed:235,cruise:215,top:500,accel:300,turn:6.4,spread:135,lift:65,weave:36,freq:11,lead:.11,trail:52,hue:320},
 {name:'FLANKER',delay:.47,launchSpeed:275,cruise:235,top:530,accel:310,turn:6.8,spread:195,lift:80,weave:16,freq:7,lead:.10,trail:52,hue:43},
 {name:'HUNTER',delay:.21,launchSpeed:170,cruise:220,top:585,accel:365,turn:8,spread:95,lift:50,weave:19,freq:6,lead:.16,trail:48,hue:155}
];
FlightGame.prototype.makeMissilePersonality=function(index,total,isBurst){
 const serial=this.missileSerial++;
 const base=MISSILE_PERSONALITIES[(isBurst?index:serial)%MISSILE_PERSONALITIES.length];
 const side=(isBurst?index:serial)%2?1:-1;
 const lane=isBurst?(.83+(Math.floor(index/2)%6)*.085):.65;
 return {...base,side,phase:rnd(0,TWO),delay:base.delay+rnd(-.025,.025),
   spread:base.spread*lane,weave:base.weave*(isBurst?1:.75),
   launchSpeed:base.launchSpeed*(isBurst?1:.7)};
};
FlightGame.prototype.stepMissiles=function(dt){
 for(let i=this.missiles.length-1;i>=0;i--){
  const m=this.missiles[i],p=m.personality;
  m.age+=dt;m.life-=dt;
  const startX=m.x,startY=m.y;
  if(!m.target||!m.target.alive){
   let nearest=null,best=Infinity;
   for(const e of this.enemies)if(e.alive){
    const d=dist2(m.x,m.y,e.x,e.y);
    if(d<best){nearest=e;best=d}
   }
   m.target=nearest;
  }
  if(m.target){
   const t=m.target;
   const tx=t.x+clamp(t.vx||0,-280,280)*p.lead;
   const ty=t.y+clamp(t.vy||0,-280,280)*p.lead;
   const distance=Math.hypot(tx-m.x,ty-m.y);
   if(m.age<p.delay){
    // Launch phase: climb and fan outward before guidance takes over.
    const k=Math.min(1,dt*2.8);
    m.vx+=(p.side*p.launchSpeed-m.vx)*k;
    m.vy+=(-p.cruise-m.vy)*k;
   }else{
    const focus=clamp((m.age-p.delay)/.83,0,1);
    const staging=(1-focus)*(1-focus);
    const wave=Math.sin(m.age*p.freq+p.phase)*p.weave*
      clamp((distance-48)/175,0,1);
    const ux=(tx-m.x)/(distance||1),uy=(ty-m.y)/(distance||1);
    const aimX=tx+p.side*p.spread*staging-uy*wave;
    const aimY=ty-p.lift*staging+ux*wave;
    const angle=Math.atan2(aimY-m.y,aimX-m.x);
    const speed=Math.min(p.top,p.cruise+(m.age-p.delay)*p.accel);
    const gain=Math.min(1,dt*(p.turn+(distance<160?5:0)));
    m.vx+=(Math.cos(angle)*speed-m.vx)*gain;
    m.vy+=(Math.sin(angle)*speed-m.vy)*gain;
   }
  }else{
   m.vy-=30*dt; // Rocket keeps its momentum when the last target disappears.
  }
  m.x+=m.vx*dt;m.y+=m.vy*dt;
  m.trail.push({x:m.x,y:m.y});
  if(m.trail.length>p.trail)m.trail.shift();
  if(m.target&&m.target.alive){
   const t=m.target,dx=m.x-startX,dy=m.y-startY;
   // Swept hit check: fast rockets cannot tunnel through a target.
   const fraction=clamp(((t.x-startX)*dx+(t.y-startY)*dy)/(dx*dx+dy*dy||1),0,1);
   const hitRadius=t.variant===2?21:18;
   if(dist2(startX+dx*fraction,startY+dy*fraction,t.x,t.y)<=hitRadius*hitRadius){
    this.hitEnemy(t);this.missiles.splice(i,1);continue;
   }
  }
  if(m.life<=0||m.y< -260||m.y>this.H+180||m.x< -240||m.x>720)
   this.missiles.splice(i,1);
 }
};
