(function(root){
'use strict';
const TAU=Math.PI*2, C={x:400,y:300}, ARENA=242;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const unit=(x,y)=>{const l=Math.hypot(x,y)||1;return{x:x/l,y:y/l};};
function stageShape(level){
 if(level<12)return 'circle';
 if(level>=15)return 'morph';
 return level%2===0?'star':'square';
}
const cross=(a,b,c,d)=>a*d-b*c;
const STAR_VERTICES=Array.from({length:10},(_,i)=>{
 const a=-Math.PI/2+i*Math.PI/5,r=i%2===0?251:230;
 return{x:Math.cos(a)*r,y:Math.sin(a)*r};
});
function starRadius(angle){
 const dx=Math.cos(angle),dy=Math.sin(angle),v=STAR_VERTICES;
 let nearest=Infinity;
 for(let i=0;i<10;i++){
  const p=v[i],q=v[(i+1)%10],ex=q.x-p.x,ey=q.y-p.y;
  const den=cross(dx,dy,ex,ey);
  if(Math.abs(den)<1e-8)continue;
  const t=cross(p.x,p.y,ex,ey)/den;
  const s=cross(p.x,p.y,dx,dy)/den;
  if(t>0&&s>=-1e-7&&s<=1+1e-7)nearest=Math.min(nearest,t);
 }
 return Number.isFinite(nearest)?nearest:ARENA;
}
function outerRadius(level,elapsed,angle,scale=1){
 const mode=stageShape(level);
 if(mode==='circle')return ARENA*scale;
 if(mode==='square')return scale*238/Math.max(Math.abs(Math.cos(angle)),Math.abs(Math.sin(angle)),1e-6);
 const star=starRadius(angle);
 if(mode==='star')return star*scale;
 const mix=.5-.5*Math.cos(elapsed*TAU/10);
 return (ARENA+(star-ARENA)*mix)*scale;
}
function traceBoundary(ctx,level,elapsed,scale=1){
 ctx.beginPath();
 const points=240;
 for(let i=0;i<=points;i++){
  const a=i*TAU/points,r=outerRadius(level,elapsed,a,scale);
  const x=C.x+Math.cos(a)*r,y=C.y+Math.sin(a)*r;
  if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
 }
 ctx.closePath();
}
function wallContact(g,normalizeBall,emit,reflect){
 const b=g.ball,dx=b.x-C.x,dy=b.y-C.y,d=Math.hypot(dx,dy)||1;
 const a=Math.atan2(dy,dx),rad=outerRadius(g.level,g.elapsed,a,g.arenaScale);
 const delta=.002,dr=(outerRadius(g.level,g.elapsed,a+delta,g.arenaScale)-outerRadius(g.level,g.elapsed,a-delta,g.arenaScale))/(2*delta);
 const n=unit(Math.cos(a)+dr/d*Math.sin(a),Math.sin(a)-dr/d*Math.cos(a));
 const alignment=Math.max(.32,n.x*Math.cos(a)+n.y*Math.sin(a));
 const limit=rad-b.r/alignment;
 if(d<=limit)return false;
 b.x=C.x+Math.cos(a)*(limit-.35);b.y=C.y+Math.sin(a)*(limit-.35);
 if(b.vx*n.x+b.vy*n.y>0){
  const v=reflect(b.vx,b.vy,n.x,n.y);b.vx=v.x;b.vy=v.y;
  normalizeBall();g.wallHits++;emit('wall-hit',{x:b.x,y:b.y});
 }
 return true;
}
function prepareTargets(targets,level){
 if(level<6)return targets;
 for(let i=0;i<targets.length;i++){
  const t=targets[i];
  if(i%7===2){
   t.kind='circle';t.variant='inflate';t.hp=3;t.maxHp=3;
  }else if(level>=9&&i%8===5){
   t.kind='circle';t.variant='split';t.hp=1;t.splitDepth=0;
  }
 }
 return targets;
}
function updateArena(g,dt){
 const n=g.targets.length;
 if(n>0&&n<10)g.shrinkGoal=Math.min(g.shrinkGoal,Math.max(.73,1-.03*(10-n)));
 const old=g.arenaScale,next=old+(g.shrinkGoal-old)*Math.min(1,dt*2.4);
 if(Math.abs(next-old)<1e-8)return;
 const ratio=next/old;
 const move=p=>{p.x=C.x+(p.x-C.x)*ratio;p.y=C.y+(p.y-C.y)*ratio;};
 move(g.ball);
 for(const t of g.targets)move(t);
 for(const p of g.trail)move(p);
 g.arenaScale=next;
}
function targetLimit(g,t,angle){
 const scale=g.arenaScale;
 return scale>.999?210-1:Math.min(210*scale-1,outerRadius(g.level,g.elapsed,angle,scale)-t.r-3);
}
function reset(g){g.arenaScale=1;g.shrinkGoal=1;g.combo=0;g.bestCombo=0;g.lastComboAt=-Infinity;g.bonusClaimed=false;g.maxStage=1;}
function newStage(g){g.arenaScale=1;g.shrinkGoal=1;g.combo=0;g.lastComboAt=-Infinity;g.bonusClaimed=false;g.maxStage=Math.max(g.maxStage||1,g.level);}
function poweredHit(g,t,i,hit,emit){
 const current=g.elapsed;
 g.combo=current-g.lastComboAt<=4?g.combo+1:1;
 g.bestCombo=Math.max(g.bestCombo,g.combo);
 g.lastComboAt=current;
 t.hp--;
 const killed=t.hp<=0;
 const multiplier=Math.min(4,1+(g.combo-1)*.5);
 const base=(killed?20:8)*g.level;
 const gained=Math.round(base*multiplier);
 g.score+=gained;
 emit('hit',{x:hit.px,y:hit.py,kind:t.kind,variant:t.variant,killed,combo:g.combo,points:gained});
 if(t.variant==='inflate'&&!killed){
  t.r=Math.min(29,Math.round(t.r*1.23*10)/10);
  emit('inflate',{x:t.x,y:t.y,r:t.r});
 }
 if(killed){
  g.targets.splice(i,1);g.destroyed++;
  if(t.variant==='inflate')emit('explode',{x:t.x,y:t.y});
  if(t.variant==='split'&&!t.splitDepth){
   const separation=t.r*.88,dir=unit(-hit.ny,hit.nx);
   const size=Math.max(7,Math.round(t.r*.64));
   for(const side of [-1,1]){
    g.targets.push({id:g.nextTargetId++,kind:'circle',variant:'split-child',splitDepth:1,
     x:t.x+dir.x*side*separation,y:t.y+dir.y*side*separation,r:size,
     vx:t.vx+dir.x*side*23,vy:t.vy+dir.y*side*23,
     rotation:t.rotation,spin:t.spin*1.4,hp:1});
   }
   emit('split',{x:t.x,y:t.y});
  }
 }
 if(g.level>=4&&!g.bonusClaimed&&g.combo>=4){
  g.bonusClaimed=true;
  if(g.lives<6){g.lives++;emit('life-bonus',{lives:g.lives});}
 }
}
root.OrbitV6Extras=Object.freeze({stageShape,outerRadius,traceBoundary,wallContact,prepareTargets,reset,newStage,poweredHit,updateArena,targetLimit});
})(globalThis);
