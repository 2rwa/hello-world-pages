(()=>{"use strict";
const $=id=>document.getElementById(id),canvas=$("view"),splash=$("splash"),stats=$("status");
let renderer;
try{renderer=makeMarbleRenderer(canvas);}catch(err){
 stats.textContent="描画エラー: "+err.message;
 $("splashTitle").textContent="WebGL2 起動エラー";$("splashText").textContent=err.message;return;
}
const R=1.535,N=11,colors=[[1.,.65,.20],[.18,.8,.94],[.75,.39,1.],[.22,.93,.76],[1.,.4,.63],[.26,.52,1.],[1.,.7,.3],[.5,.88,.98],[.7,.4,.92],[.3,.85,.68],[1.,.5,.37]];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=a=>Math.hypot(...a),norm=a=>{let l=len(a)||1;return a.map(v=>v/l)};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scale=(v,s)=>v.map(x=>x*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
let balls=[],target=[.5,.7,0],mode="ready",score=0,combo=1,elapsed=0,remaining=75,flash=0,boostCD=0,collisions=0;
let best=0;try{best=Number(localStorage.getItem("marble-orbit-best")||0)}catch(e){}
let yaw=.38,pitch=.21,gesture=null,orient=null,base=null,hasSensor=false,lastShake=0;
const keys=new Set(),gravity=[0,-1,0];let noticeTimer=null;
function notice(t){
 $("toast").textContent=t;$("toast").classList.add("show");
 clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$("toast").classList.remove("show"),950);
}
function randomPoint(limit){
 for(let k=0;k<200;k++){
  const p=[(Math.random()*2-1)*limit,(Math.random()*2-1)*limit,(Math.random()*2-1)*limit];
  if(len(p)<limit)return p;
 }
 return [0,0,0];
}
function placeTarget(){
 for(let j=0;j<180;j++){
  const p=randomPoint(1.30);
  if(balls.every(b=>len(sub(p,b.p))>.33)){target=p;return;}
 }
 target=[0,.8,0];
}
function makeBalls(){
 balls=[];
 for(let i=0;i<N;i++){
  const r=i===0?.165:(.115+(i%3)*.012),b={p:[0,0,0],v:[0,0,0],r,c:colors[i]};
  for(let k=0;k<100;k++){
   const p=randomPoint(1.24);
   if(balls.every(other=>len(sub(p,other.p))>r+other.r+.1)){b.p=p;break;}
  }
  balls.push(b);
 }
 placeTarget();
}
function updateHud(){
 $("score").textContent=String(score).padStart(4,"0");
 $("timer").textContent=remaining.toFixed(1);
 $("combo").textContent="×"+combo;
 $("best").textContent=String(best).padStart(4,"0");
 $("pulse").disabled=mode!=="running"||boostCD>0;
 $("pulse").textContent=boostCD>0?"✦ "+boostCD.toFixed(1)+"s":"✦ ブースト";
 $("pause").textContent=mode==="paused"?"再開":"一時停止";
}
function begin(){
 makeBalls();score=0;combo=1;remaining=75;elapsed=0;flash=0;boostCD=0;collisions=0;
 mode="running";splash.classList.add("hidden");updateHud();
}
function finish(){
 mode="over";best=Math.max(best,score);
 try{localStorage.setItem("marble-orbit-best",String(best))}catch(e){}
 $("splashTitle").textContent="SCORE "+score;
 $("splashText").textContent="おつかれさま！ 球を転がして集めた得点です。ベスト: "+best+"。もう一度チャレンジ！";
 $("start").textContent="もう一度遊ぶ →";splash.classList.remove("hidden");updateHud();
}
function shake(v){
 for(let i=0;i<balls.length;i++){
  const b=balls[i],rand=norm([Math.random()-.5,Math.random()-.5,Math.random()-.5]);
  for(let k=0;k<3;k++)b.v[k]+=rand[k]*v*(i===0?.65:1.);
 }
 flash=1;
}
function boost(){
 if(mode!=="running"||boostCD>0)return;
 const dir=norm(sub(target,balls[0].p));
 for(let k=0;k<3;k++)balls[0].v[k]+=dir[k]*4.5;
 for(let i=1;i<balls.length;i++){
  const d=norm(sub(balls[i].p,balls[0].p));
  for(let k=0;k<3;k++)balls[i].v[k]+=d[k]*2.4;
 }
 boostCD=2.3;flash=1;notice("BOOST →");updateHud();
}
function step(dt){
 const accel=4.8,damping=Math.exp(-.49*dt);
 for(const b of balls){
  for(let k=0;k<3;k++){b.v[k]=(b.v[k]+gravity[k]*accel*dt)*damping;b.p[k]+=b.v[k]*dt;}
  let dist=len(b.p),limit=R-b.r-.016;
  if(dist>limit){
   const n=scale(b.p,1/(dist||1));b.p=scale(n,limit);
   const approach=dot(b.v,n);
   if(approach>0){b.v=scale(sub(b.v,scale(n,1.70*approach)),.96);collisions++;}
  }
 }
 for(let iter=0;iter<2;iter++){
  for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
   const a=balls[i],b=balls[j],delta=sub(b.p,a.p),dist=len(delta),over=a.r+b.r-dist;
   if(over<=0)continue;
   const n=dist>.00001?scale(delta,1/dist):[1,0,0];
   const shift=scale(n,over*.502);a.p=sub(a.p,shift);b.p=add(b.p,shift);
   const rel=dot(sub(b.v,a.v),n);
   if(rel<0){
    const force=-(1+.79)*rel*.5;
    a.v=sub(a.v,scale(n,force));b.v=add(b.v,scale(n,force));collisions++;
   }
  }
 }
 if(len(sub(balls[0].p,target))<balls[0].r+.112){
  const points=100*combo;score+=points;combo=Math.min(8,combo+1);
  remaining=Math.min(90,remaining+1.5);notice("+"+points+" COMBO ×"+combo);
  flash=.9;placeTarget();
  if(score>best){best=score;try{localStorage.setItem("marble-orbit-best",String(best))}catch(e){}}
 }
}
function camera(){
 const eye=[Math.sin(yaw)*Math.cos(pitch)*4.55,Math.sin(pitch)*4.55,Math.cos(yaw)*Math.cos(pitch)*4.55];
 const forward=norm(scale(eye,-1)),right=norm(cross(forward,[0,1,0])),up=norm(cross(right,forward));
 return {eye,forward,right,up};
}
function calcGravity(dt){
 let x=0,z=0;
 if(keys.has("a")||keys.has("arrowleft"))x-=1;
 if(keys.has("d")||keys.has("arrowright"))x+=1;
 if(keys.has("w")||keys.has("arrowup"))z-=1;
 if(keys.has("s")||keys.has("arrowdown"))z+=1;
 if(hasSensor&&orient&&base){
  const dg=clamp((orient.gamma-base.gamma)/35,-1.8,1.8);
  const db=clamp((orient.beta-base.beta)/37,-1.8,1.8);
  const angle=(screen.orientation&&screen.orientation.angle)||window.orientation||0;
  const a=angle*Math.PI/180;
  x+=dg*Math.cos(a)+db*Math.sin(a);
  z+=db*Math.cos(a)-dg*Math.sin(a);
 }
 const desired=norm([x,-.58,z]),a=1-Math.exp(-dt*7);
 for(let k=0;k<3;k++)gravity[k]+=(desired[k]-gravity[k])*a;
}
function screenFlick(x,y){
 if(mode!=="running")return;
 const c=camera(),s=Math.min(innerWidth,innerHeight);
 const uvx=(x-innerWidth*.5)/s,uvy=(innerHeight*.5-y)/s;
 const direction=norm(add(add(scale(c.right,uvx*1.8),scale(c.up,uvy*1.8)),scale(c.forward,.14)));
 for(let k=0;k<3;k++)balls[0].v[k]+=direction[k]*2.35;
 flash=.8;notice("FLICK !");
}
canvas.addEventListener("pointerdown",e=>{
 gesture={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};
 canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove",e=>{
 if(!gesture||gesture.id!==e.pointerId)return;
 const dx=e.clientX-gesture.lastX,dy=e.clientY-gesture.lastY;
 if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>9)gesture.moved=true;
 if(gesture.moved){yaw-=dx*.0065;pitch=clamp(pitch+dy*.005,-1.35,1.35);}
 gesture.lastX=e.clientX;gesture.lastY=e.clientY;
});
canvas.addEventListener("pointerup",e=>{
 if(!gesture||gesture.id!==e.pointerId)return;
 if(!gesture.moved)screenFlick(e.clientX,e.clientY);
 gesture=null;
});
canvas.addEventListener("pointercancel",()=>gesture=null);
window.addEventListener("keydown",e=>{
 const key=e.key.toLowerCase();
 if(["arrowleft","arrowright","arrowup","arrowdown"," "].includes(key))e.preventDefault();
 keys.add(key);
 if(key===" "&&!e.repeat)boost();
 if(key==="p"&&!e.repeat)togglePause();
});
window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
function togglePause(){
 if(mode==="running"){mode="paused";notice("PAUSED");}
 else if(mode==="paused"){mode="running";notice("RESUME");}
 updateHud();
}
function onOrientation(e){
 if(e.beta===null||e.gamma===null)return;
 orient={beta:e.beta,gamma:e.gamma};
 if(!base)base={...orient};
 hasSensor=true;$("motion").textContent="◎ センサー ON";
}
function onMotion(e){
 const a=e.acceleration;
 if(!a||a.x===null)return;
 const mag=Math.hypot(a.x||0,a.y||0,a.z||0),now=performance.now();
 if(mag>18&&now-lastShake>850&&mode==="running"){
  lastShake=now;shake(clamp(mag/4.8,3.5,7.0));notice("SHAKE !");
 }
}
async function enableSensor(){
 try{
  if(typeof DeviceOrientationEvent==="undefined")throw new Error("この端末には傾きセンサーがありません");
  if(typeof DeviceOrientationEvent.requestPermission==="function"){
   const permission=await DeviceOrientationEvent.requestPermission();
   if(permission!=="granted")throw new Error("センサーの許可が必要です");
  }
  if(typeof DeviceMotionEvent!=="undefined"&&typeof DeviceMotionEvent.requestPermission==="function"){
   try{await DeviceMotionEvent.requestPermission()}catch(e){}
  }
  base=null;window.addEventListener("deviceorientation",onOrientation,{passive:true});
  window.addEventListener("devicemotion",onMotion,{passive:true});
  $("motion").textContent="◎ 検知待ち…";notice("スマホを傾けてください");
 }catch(e){notice(e.message);stats.textContent=e.message;}
}
$("motion").addEventListener("click",enableSensor);
$("center").addEventListener("click",()=>{if(orient){base={...orient};notice("この傾きを基準に設定");}else notice("まずセンサーを有効に");});
$("pulse").addEventListener("click",boost);
$("pause").addEventListener("click",togglePause);
$("restart").addEventListener("click",begin);
$("start").addEventListener("click",begin);
$("quality").addEventListener("change",e=>renderer.setQuality(e.target.value));
document.addEventListener("visibilitychange",()=>{if(document.hidden&&mode==="running"){mode="paused";updateHud();}});
makeBalls();updateHud();
let last=performance.now(),accum=0,fps=0,fpsFrames=0,fpsStamp=last,uiStamp=0;
function animate(now){
 requestAnimationFrame(animate);
 const delta=Math.min((now-last)/1000,.05);last=now;calcGravity(delta);
 if(mode==="running"){
  accum=Math.min(accum+delta,.08);
  while(accum>=1/120){
   step(1/120);remaining-=1/120;elapsed+=1/120;boostCD=Math.max(0,boostCD-1/120);accum-=1/120;
   if(remaining<=0){remaining=0;finish();accum=0;break;}
  }
 }else accum=0;
 flash=Math.max(0,flash-delta*1.65);
 renderer.draw(balls,target,camera(),now*.001,flash);
 fpsFrames++;
 if(now-fpsStamp>950){fps=Math.round(fpsFrames*1000/(now-fpsStamp));fpsFrames=0;fpsStamp=now;}
 if(now-uiStamp>130){
  updateHud();stats.textContent="WebGL2 · "+fps+" fps · "+(hasSensor?"傾き ON":"PC / タッチ")+" · "+collisions+" 衝突";
  uiStamp=now;
 }
}
requestAnimationFrame(animate);
})();