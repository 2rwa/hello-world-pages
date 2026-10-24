/* ORBIT SHAKE: mobile sensor-driven game. No camera or touch steering. */
(()=>{"use strict";
const $=s=>document.getElementById(s),cv=$("view");
let render;
try{render=makeMarbleRenderer(cv);}catch(e){
 $("status").textContent="WebGL2 ERROR: "+e.message;
 $("splashTitle").textContent="WebGL2 が必要です";$("splashText").textContent=e.message;return;
}
const game=new TiltArena(),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,k)=>a.map(x=>x*k);
const norm=a=>{const d=Math.hypot(...a)||1;return mul(a,1/d)};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
let tilt=[0,0],zero=null,orientation=null,motionCount=0,lastMotion=0,shakeTime=-1e9;
let lowPass=null,rawTilt=[0,0],permissions="未許可",frameTotal=0,lastFrame=performance.now(),accum=0;
let frames=0,fps=0,lastFps=performance.now(),lastHud=0,clock=0,noticeTimer=0,ended=false;
function notice(s){
 $("notice").textContent=s;$("notice").classList.add("on");
 clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$("notice").classList.remove("on"),1000);
}
function cam(t){
 // Orbit deliberately independent of player input. One revolution in ~40s.
 const phase=.3+t*.157,pitch=.24+.19*Math.sin(t*.105),distance=innerWidth<innerHeight*.88?4.9:4.12;
 const eye=[distance*Math.sin(phase)*Math.cos(pitch),distance*Math.sin(pitch),distance*Math.cos(phase)*Math.cos(pitch)];
 const forward=norm(mul(eye,-1)),right=norm(cross(forward,[0,1,0])),up=norm(cross(right,forward));
 return {eye,forward,right,up};
}
function onOrientation(e){
 if(!Number.isFinite(e.gamma)||!Number.isFinite(e.beta))return false;
 orientation={gamma:e.gamma,beta:e.beta};
 if(!zero)zero={...orientation};
 const dx=clamp((orientation.gamma-zero.gamma)/27,-1.5,1.5);
 const dy=clamp((orientation.beta-zero.beta)/30,-1.5,1.5);
 const deg=screen.orientation?.angle??window.orientation??0;
 const a=deg*Math.PI/180;
 rawTilt=[clamp(dx*Math.cos(a)+dy*Math.sin(a),-1,1),
          clamp(-dy*Math.cos(a)+dx*Math.sin(a),-1,1)];
 rawTilt=rawTilt.map(v=>Math.abs(v)<.065?0:v);
 permissions="センサー有効";
 return true;
}
function onMotion(e){
 const now=performance.now();
 let acceleration=e.acceleration;
 let magnitude=0;
 if(acceleration&&[acceleration.x,acceleration.y,acceleration.z].some(Number.isFinite)){
  magnitude=Math.hypot(acceleration.x||0,acceleration.y||0,acceleration.z||0);
 }else{
  const incl=e.accelerationIncludingGravity;
  if(!incl||![incl.x,incl.y,incl.z].every(Number.isFinite))return false;
  const v=[incl.x,incl.y,incl.z];
  if(!lowPass){lowPass=v.slice();return false;}
  const high=v.map((n,i)=>n-lowPass[i]);
  lowPass=lowPass.map((n,i)=>n*.86+v[i]*.14);
  magnitude=Math.hypot(...high);
 }
 motionCount++;
 if(magnitude>12&&now-shakeTime>650){
  shakeTime=now;
  if(game.shake()){notice("SHAKE! 捕食チャンス");navigator.vibrate?.(70);return true;}
 }
 lastMotion=now;
 return false;
}
function recenter(){
 if(orientation){zero={...orientation};rawTilt=[0,0];tilt=[0,0];notice("傾きの中心を再設定");}
 else notice("センサーの値がまだ届いていません");
}
function permissionRequests(){
 const promises=[];
 if(typeof DeviceOrientationEvent!=="undefined"&&typeof DeviceOrientationEvent.requestPermission==="function")
  promises.push(DeviceOrientationEvent.requestPermission());
 if(typeof DeviceMotionEvent!=="undefined"&&typeof DeviceMotionEvent.requestPermission==="function")
  promises.push(DeviceMotionEvent.requestPermission());
 return Promise.all(promises);
}
let listeners=false;
function attach(){
 if(listeners)return;
 window.addEventListener("deviceorientation",onOrientation,{passive:true});
 window.addEventListener("devicemotion",onMotion,{passive:true});
 listeners=true;
}
function start(){
 game.reset();game.start();ended=false;rawTilt=[0,0];tilt=[0,0];zero=null;lowPass=null;
 $("splash").classList.add("hidden");
 $("begin").textContent="もう一度遊ぶ →";
 notice("傾けて移動 / 振って巨大化");
 // Both iOS permission prompts must be requested directly within this tap.
 let permission;
 try{permission=permissionRequests();}catch(e){
  permissions="権限エラー";notice(e.message);return;
 }
 permission.then(all=>{
  if(all.some(x=>x!=="granted")){permissions="権限が拒否されました";notice("設定からモーションを許可してください");}
  else{attach();permissions="センサー待機中";}
 }).catch(e=>{permissions="権限エラー";notice("センサー権限: "+e.message)});
}
function end(){
 if(ended)return;ended=true;
 const win=game.mode==="win";
 $("splashTitle").innerHTML=win?"捕食成功！":"<em>"+(game.mode==="lose"?"押し潰された！":"TIME UP")+"</em>";
 $("splashText").textContent=win?
  "8体を捕食しました！ あなたの振るタイミングが勝負を決めました。SCORE "+game.score:
  "捕食 "+game.caught+"体 / SCORE "+game.score+"。傾きで赤い敵から逃げ、緑が近づいたらスマホを振って巨大化しましょう。";
 $("splash").classList.remove("hidden");
}
$("begin").addEventListener("click",start);
$("retry").addEventListener("click",start);
$("recenter").addEventListener("click",recenter);
$("quality").addEventListener("change",e=>render.setQuality(e.target.value));
$("pause").addEventListener("click",()=>{
 if(game.mode==="running")game.mode="paused";
 else if(game.mode==="paused")game.mode="running";
 $("pause").textContent=game.mode==="paused"?"再開":"一時停止";
});
document.addEventListener("visibilitychange",()=>{
 if(document.hidden&&game.mode==="running"){
  game.mode="paused";$("pause").textContent="再開";
 }
});
function hud(){
 $("caught").textContent=game.caught+"/8";
 $("life").textContent="♥".repeat(game.health)+"♡".repeat(3-game.health);
 $("remaining").textContent=game.remaining.toFixed(1);
 $("score").textContent=String(game.score).padStart(3,"0");
 $("status").textContent="WebGL2 · "+fps+"fps · "+permissions;
 $("motionState").textContent=orientation?"検出中":"センサー待機";
 $("angle").textContent=Math.round(tilt[0]*100)+" / "+Math.round(tilt[1]*100)+" %";
 $("tiltDot").style.transform="translate("+Math.round(tilt[0]*31)+"px,"+Math.round(-tilt[1]*31)+"px)";
 const active=game.burst>.04;
 $("shakeOrb").classList.toggle("active",active);
 $("recharge").textContent=active?"巨大化中 "+game.burst.toFixed(1)+"s":game.cooldown>0?"充電 "+game.cooldown.toFixed(1)+"s":"READY";
}
function frame(now){
 requestAnimationFrame(frame);
 const dt=Math.min((now-lastFrame)*.001,.065);lastFrame=now;clock=now*.001;
 tilt=tilt.map((v,i)=>v+(rawTilt[i]-v)*Math.min(1,dt*9));
 const camera=cam(clock);
 if(game.mode==="running"){
  accum=Math.min(accum+dt,.09);
  while(accum>=.01){
   game.tick(.01,tilt,camera);
   for(const e of game.events){
    if(e.type==="catch")notice("CAPTURE! "+e.count+"/8");
    if(e.type==="hurt"){notice("CRUSH! LIFE -1");navigator.vibrate?.(120);}
    if(["win","lose","time"].includes(e.type))end();
   }
   accum-=.01;
   if(game.mode!=="running"){accum=0;break;}
  }
 }else accum=0;
 render.draw(game.active,[0,0,100],camera,clock,game.flash);
 frames++;
 if(now-lastFps>1200){fps=Math.round(frames*1000/(now-lastFps));frames=0;lastFps=now;}
 if(now-lastHud>120){hud();lastHud=now;}
}
window.__orbitShakeTest=location.search.includes("test=1")?
 {game,cam,onOrientation,onMotion,recenter,start,getTilt:()=>tilt,getRawTilt:()=>rawTilt,
  getSensor:()=>({zero,orientation,permissions,motionCount})}:undefined;
hud();requestAnimationFrame(frame);
})();