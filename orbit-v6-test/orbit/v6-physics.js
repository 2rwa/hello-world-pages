(function(root,factory){
const api=factory();
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.OrbitPhysicsV6=api;
})(globalThis,function(){
'use strict';
const V=globalThis.OrbitV6Extras;
if(!V)throw Error('OrbitV6Extras must load first');
const TAU=Math.PI*2;
const C={x:400,y:300};
const ARENA=242,PADDLE_R=210,PADDLE_THICK=19,PADDLE_HALF=.275,BALL_R=7;
const ENERGY_MAX=100,ENERGY_COST=34,HIT_GRACE=1.1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=(x,y)=>{const l=Math.hypot(x,y)||1;return{x:x/l,y:y/l};};
const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const reflect=(vx,vy,nx,ny)=>{const dot=vx*nx+vy*ny;return{x:vx-2*dot*nx,y:vy-2*dot*ny};};
const randGen=(seed)=>{let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};};
const speedAt=(level)=>level<=3?Math.min(335+Math.max(0,level-1)*17,445):Math.min(360+(level-4)*4,394);
const paddleHalfAt=(level)=>level<=3?PADDLE_HALF:.36;
function targetVertices(t){
if(t.kind==='circle')return[];
const corners=t.kind==='triangle'?3:4;
const phase=t.rotation+(t.kind==='triangle'?-Math.PI/2:Math.PI/4);
return Array.from({length:corners},(_,i)=>({x:t.x+Math.cos(phase+i*TAU/corners)*t.r,y:t.y+Math.sin(phase+i*TAU/corners)*t.r}));
}
function closestSegment(x,y,ax,ay,bx,by){
const dx=bx-ax,dy=by-ay;
const t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);
return{x:ax+dx*t,y:ay+dy*t};
}
function circleTargetContact(ball,t){
const dx=ball.x-t.x,dy=ball.y-t.y;
const d=Math.hypot(dx,dy),r=ball.r+t.r;
if(d>r)return null;
const n=d>1e-6?{x:dx/d,y:dy/d}:norm(ball.vx-t.vx,ball.vy-t.vy);
return{nx:n.x,ny:n.y,depth:r-d+0.15,px:t.x+n.x*t.r,py:t.y+n.y*t.r};
}
function polygonContact(ball,t){
const v=targetVertices(t);
let best=null,orient=0;
for(let i=0;i<v.length;i++){
const a=v[i],b=v[(i+1)%v.length];
orient+=(b.x-a.x)*(b.y+a.y);
const cp=closestSegment(ball.x,ball.y,a.x,a.y,b.x,b.y);
const dist=Math.hypot(ball.x-cp.x,ball.y-cp.y);
if(!best||dist<best.dist)best={dist,cp,a,b};
}
if(!best)return null;
let inside=true;
for(let i=0;i<v.length;i++){
const a=v[i],b=v[(i+1)%v.length];
const cross=(b.x-a.x)*(ball.y-a.y)-(b.y-a.y)*(ball.x-a.x);
if(orient<0?cross< -1e-6:cross>1e-6){inside=false;break;}
}
if(!inside&&best.dist>ball.r)return null;
let n;
if(best.dist>1e-7&&!inside)n=norm(ball.x-best.cp.x,ball.y-best.cp.y);
else {
const dx=best.b.x-best.a.x,dy=best.b.y-best.a.y;
n=norm(orient<0?dy:-dy,orient<0?-dx:dx);
}
if(n.x*(best.cp.x-t.x)+n.y*(best.cp.y-t.y)<0)n={x:-n.x,y:-n.y};
return{nx:n.x,ny:n.y,depth:(inside?ball.r+best.dist:ball.r-best.dist)+.15,px:best.cp.x,py:best.cp.y};
}
const targetContact=(ball,t)=>t.kind==='circle'?circleTargetContact(ball,t):polygonContact(ball,t);
function spawnTargets(level,seed){
const rand=randGen((seed+level*2654435761)>>>0);
const count=level<=3?Math.min(13+level*3,27):Math.min(18+Math.floor((level-4)*.6),23),out=[],kinds=['circle','triangle','square'];
for(let i=0;i<count;i++){
let x=0,y=0,r=11+Math.floor(rand()*8);
for(let attempt=0;attempt<90;attempt++){
const a=TAU*rand(),d=32+146*Math.sqrt(rand());
x=C.x+Math.cos(a)*d;y=C.y+Math.sin(a)*d;
if(out.every(t=>Math.hypot(t.x-x,t.y-y)>t.r+r+12))break;
}
const a=TAU*rand(),v=level<=3?24+rand()*20:12+rand()*14;
out.push({id:i,kind:kinds[i%3],x,y,r,vx:Math.cos(a)*v,vy:Math.sin(a)*v,
rotation:TAU*rand(),spin:(rand()-.5)*1.5,hp:level>=3&&i%6===0?2:1});
}
return V.prepareTargets(out,level);
}
function createGame(seed=1205){
const g={
seed,level:1,score:0,lives:3,state:'ready',elapsed:0,wallHits:0,frontHits:0,rearHits:0,
energy:ENERGY_MAX,damageCooldown:0,paddleObjectHits:0,chargedHits:0,
destroyed:0,paddleAngle:Math.PI/2,paddleOmega:0,events:[],targets:[],trail:[],
ball:{x:400,y:458,vx:0,vy:0,r:BALL_R}
};
const emit=(type,data={})=>{g.events.push({type,...data});if(g.events.length>16)g.events.shift();};
const currentSpeed=()=>speedAt(g.level);
function placeBall(){
const a=g.paddleAngle,rad=PADDLE_R-42;
g.ball.x=C.x+Math.cos(a)*rad;g.ball.y=C.y+Math.sin(a)*rad;
g.energy=ENERGY_MAX;g.damageCooldown=0;
const theta=a+.23;
g.ball.vx=Math.cos(theta)*currentSpeed();g.ball.vy=Math.sin(theta)*currentSpeed();
g.trail=[];
}
function newLevel(){
g.targets=spawnTargets(g.level,g.seed);
g.nextTargetId=10000+g.level*1000;V.newStage(g);
placeBall();
emit('level',{level:g.level});
}
function reset(){
g.level=1;g.score=0;g.lives=3;g.state='ready';g.elapsed=0;
g.wallHits=0;g.frontHits=0;g.rearHits=0;g.destroyed=0;
g.paddleObjectHits=0;g.chargedHits=0;
g.paddleAngle=Math.PI/2;g.paddleOmega=0;g.events=[];V.reset(g);newLevel();
return g;
}
function start(){
if(g.state==='gameover')reset();
if(g.state==='levelclear'){g.level++;newLevel();}
if(g.state==='ready'||g.state==='paused'||g.state==='levelclear')g.state='playing';
return g.state;
}
function pause(){if(g.state==='playing')g.state='paused';else if(g.state==='paused')g.state='playing';}
function setPaddleAngle(angle,dt=0){
const change=angleDiff(angle,g.paddleAngle);
g.paddleOmega=dt>0?clamp(change/dt,-8,8):0;
g.paddleAngle+=change;
if(g.state==='ready')placeBall();
}
function loseLife(){
if(g.state!=='playing'||g.damageCooldown>0)return false;
g.lives--;g.paddleObjectHits++;g.damageCooldown=g.level<=3?HIT_GRACE:2.0;
emit('paddle-object-hit',{lives:g.lives});
if(g.lives<=0){g.state='gameover';emit('gameover',{score:g.score});}
return true;
}
function normalizeBall(){
const n=norm(g.ball.vx,g.ball.vy),s=currentSpeed();
g.ball.vx=n.x*s;g.ball.vy=n.y*s;
}
function updateTargets(dt){
for(const t of g.targets){
t.x+=t.vx*dt;t.y+=t.vy*dt;t.rotation+=t.spin*dt;
const dx=t.x-C.x,dy=t.y-C.y,d=Math.hypot(dx,dy);
const max=PADDLE_R-1;
if(d>max){
const n=norm(dx,dy);t.x=C.x+n.x*(max-.2);t.y=C.y+n.y*(max-.2);
if(t.vx*n.x+t.vy*n.y>0){const v=reflect(t.vx,t.vy,n.x,n.y);t.vx=v.x;t.vy=v.y;}
}
}
}

function targetPaddleContact(t){
const angle=Math.atan2(t.y-C.y,t.x-C.x);
const offset=angleDiff(angle,g.paddleAngle);
const a=g.paddleAngle+clamp(offset,-paddleHalfAt(g.level),paddleHalfAt(g.level));
const px=C.x+Math.cos(a)*PADDLE_R,py=C.y+Math.sin(a)*PADDLE_R;
const dx=t.x-px,dy=t.y-py,dist=Math.hypot(dx,dy);
const limit=t.r+PADDLE_THICK/2;
if(dist>=limit){
t.paddleTouching=false;
return false;
}
const n=dist>1e-7?{x:dx/dist,y:dy/dist}:norm(t.x-C.x,t.y-C.y);
t.x+=n.x*(limit-dist+.65);
t.y+=n.y*(limit-dist+.65);
const dot=t.vx*n.x+t.vy*n.y;
if(dot<0){
const v=reflect(t.vx,t.vy,n.x,n.y);
t.vx=v.x;t.vy=v.y;
}
if(t.paddleTouching)return false;
t.paddleTouching=true;
if(g.state==='playing'){
const hurt=loseLife();
emit('target-paddle-contact',{x:px,y:py,kind:t.kind,hurt});
}
return true;
}
function paddleContact(px,py){
const b=g.ball,dx=b.x-C.x,dy=b.y-C.y,dist=Math.hypot(dx,dy)||1;
const n={x:dx/dist,y:dy/dist};
const a=Math.atan2(dy,dx),delta=Math.abs(angleDiff(a,g.paddleAngle));
const angularMargin=Math.asin(clamp(b.r/Math.max(PADDLE_R,dist),0,.2));
if(delta>paddleHalfAt(g.level)+angularMargin)return false;
const inner=PADDLE_R-PADDLE_THICK/2-b.r;
const outer=PADDLE_R+PADDLE_THICK/2+b.r;
const prevR=Math.hypot(px-C.x,py-C.y);
const radialVelocity=b.vx*n.x+b.vy*n.y;
if(radialVelocity>0&&prevR<inner+.8&&dist>=inner){
const v=reflect(b.vx,b.vy,n.x,n.y);
b.vx=v.x;b.vy=v.y;
const tangent={x:-n.y,y:n.x};
const steer=clamp(g.paddleOmega*PADDLE_R*.08,-45,45);
b.vx+=tangent.x*steer;b.vy+=tangent.y*steer;
normalizeBall();
b.x=C.x+n.x*(inner-.45);b.y=C.y+n.y*(inner-.45);
g.energy=ENERGY_MAX;g.frontHits++;emit('charge',{x:b.x,y:b.y,side:'front'});
return true;
}
if(radialVelocity<0&&prevR>outer-.8&&dist<=outer){
const v=reflect(b.vx,b.vy,n.x,n.y);b.vx=v.x;b.vy=v.y;
normalizeBall();
b.x=C.x+n.x*(outer+.45);b.y=C.y+n.y*(outer+.45);
g.energy=ENERGY_MAX;g.rearHits++;
emit('charge',{x:b.x,y:b.y,side:'rear'});
return true;
}
return false;
}
function wallContact(){
if(g.level>=12)return V.wallContact(g,normalizeBall,emit,reflect);
const b=g.ball,dx=b.x-C.x,dy=b.y-C.y,d=Math.hypot(dx,dy);
const limit=ARENA-b.r;
if(d<=limit)return false;
const n=norm(dx,dy);
b.x=C.x+n.x*(limit-.2);b.y=C.y+n.y*(limit-.2);
if(b.vx*n.x+b.vy*n.y>0){
const v=reflect(b.vx,b.vy,n.x,n.y);b.vx=v.x;b.vy=v.y;normalizeBall();
g.wallHits++;emit('wall-hit',{x:b.x,y:b.y});
}
return true;
}
function destroyContact(){
const b=g.ball;
for(let i=g.targets.length-1;i>=0;i--){
const t=g.targets[i],hit=targetContact(b,t);
if(!hit)continue;
const rvx=b.vx-t.vx,rvy=b.vy-t.vy;
if(rvx*hit.nx+rvy*hit.ny>=0)continue;
const v=reflect(rvx,rvy,hit.nx,hit.ny);
b.vx=v.x+t.vx;b.vy=v.y+t.vy;normalizeBall();
b.x+=hit.nx*hit.depth;b.y+=hit.ny*hit.depth;
if(g.energy===0){
emit('empty-bounce',{x:hit.px,y:hit.py,kind:t.kind});
}else{
g.energy=Math.max(0,g.energy-ENERGY_COST);g.chargedHits++;
V.poweredHit(g,t,i,hit,emit);
if(g.targets.length===0){
g.score+=100*g.level;g.state='levelclear';emit('clear',{level:g.level});
}
}
return true;
}
return false;
}
function tick(dt){
if(g.state!=='playing')return;
const total=clamp(dt,0,.05),steps=Math.max(1,Math.ceil(total/(1/240)));
const step=total/steps;
for(let i=0;i<steps&&g.state==='playing';i++){
g.elapsed+=step;g.damageCooldown=Math.max(0,g.damageCooldown-step);
updateTargets(step);
for(const t of g.targets)targetPaddleContact(t);
if(g.state!=='playing')break;
const b=g.ball,px=b.x,py=b.y;
b.x+=b.vx*step;b.y+=b.vy*step;
if(paddleContact(px,py))continue;
wallContact();
destroyContact();
}
if(g.state==='playing'){
if(g.combo>0&&g.elapsed-g.lastComboAt>4)g.combo=0;
g.trail.push({x:g.ball.x,y:g.ball.y});
if(g.trail.length>15)g.trail.shift();
}
}
reset();
return{world:g,tick,start,pause,reset,setPaddleAngle,loseLife,newLevel,placeBall,
injectBall:(x,y,vx,vy)=>{Object.assign(g.ball,{x,y,vx,vy});normalizeBall();},
clearTargets:()=>{g.targets=[];g.state='levelclear';emit('clear');},
speed:currentSpeed};
}
return Object.freeze({C,ARENA,PADDLE_R,PADDLE_THICK,PADDLE_HALF,BALL_R,TAU,
clamp,norm,angleDiff,reflect,randGen,speedAt,paddleHalfAt,targetVertices,targetContact,spawnTargets,createGame,
ENERGY_MAX,ENERGY_COST,HIT_GRACE});
});
