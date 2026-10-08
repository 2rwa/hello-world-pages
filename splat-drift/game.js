import {GaussianRenderer} from './renderer.js';
import {CloudWorld} from './world.js';
const $=id=>document.getElementById(id);
const ui={canvas:$('gl'),arena:$('arena'),system:$('system'),score:$('score'),distance:$('distance'),health:$('health'),combo:$('combo'),pulseLabel:$('pulseLabel'),pulseFill:$('pulseFill'),pulseTime:$('pulseTime'),pulse:$('pulse'),pause:$('pause'),restart:$('restart'),resolution:$('resolution'),perf:$('perf'),toast:$('toast'),overlay:$('overlay'),eyebrow:$('eyebrow'),title:$('title'),intro:$('intro'),start:$('start')};
let renderer;
try {renderer=new GaussianRenderer(ui.canvas);ui.system.textContent='WEBGL2 · ONLINE';}
catch(e){ui.system.textContent='WEBGL2 · UNAVAILABLE';ui.title.textContent='UNAVAILABLE';ui.intro.textContent=String(e.message);ui.start.disabled=true;throw e;}
let world=new CloudWorld(),state='menu',score=0,health=3,combo=1,distance=0,time=0,cooldown=0,flash=0,toastAge=0;
let ship={x:0,y:0},target={x:0,y:0},mode='keys';
let keys=new Set(),previous=performance.now(),frames=0,frameTime=0,fps=0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const settings={speed:21};
function resize(){
 let width=ui.resolution.value==='auto'?Math.round(ui.arena.getBoundingClientRect().width*(window.devicePixelRatio||1)):Number(ui.resolution.value);
 if(!Number.isFinite(width))width=480;
 renderer.resize(clamp(width,480,1280));
}
ui.resolution.addEventListener('change',resize);window.addEventListener('resize',resize);resize();
function showToast(s){ui.toast.textContent=s;toastAge=1.05;ui.toast.classList.add('show')}
function hideOverlay(){ui.overlay.hidden=true}
function setOverlay(tag,title,text,button){
 ui.eyebrow.textContent=tag;ui.title.innerHTML=title;ui.intro.textContent=text;ui.start.textContent=button;ui.overlay.hidden=false;
}
function start(){
 world=new CloudWorld((Date.now()^0x6a4e2d)>>>0);
 state='running';score=0;health=3;combo=1;distance=0;time=0;cooldown=0;flash=0;ship={x:0,y:0};target={x:0,y:0};mode='keys';keys.clear();
 hideOverlay();updateHud();
}
function pause(){
 if(state==='running'){state='paused';setOverlay('FLIGHT SUSPENDED','PAUSED','時間を止めました。続けると同じ場所から再開します。','RESUME →')}
 else if(state==='paused'){state='running';hideOverlay()}
 updateHud();
}
function over(){
 state='over';setOverlay('CLOUDS CLAIMED YOUR SHIP','GAME OVER','獲得スコア '+score.toLocaleString('ja-JP')+' · 飛行距離 '+Math.round(distance)+' m。もう一度飛んでみよう。','TRY AGAIN →');
 updateHud();
}
function reward(n=1){score+=100*combo*n;combo=Math.min(combo+n,9);showToast('+'+(100*(combo-n)*n)+' LIGHT')}
function hit(){health--;combo=1;flash=.8;showToast('HULL DAMAGED');if(health<=0)over()}
function usePulse(){
 if(state!=='running'||cooldown>0)return;
 cooldown=6.5;flash=1;
 const affected=world.pulse(ship.x,ship.y);
 let orb=0,shattered=0;
 for(const type of affected){if(type==='orb')orb++;else shattered++}
 if(orb)reward(orb);
 showToast(shattered||orb?'PULSE · '+(shattered+orb)+' CLEARED':'PULSE WAVE');
 updateHud();
}
function updateHud(){
 ui.score.textContent=String(score).padStart(6,'0');ui.distance.textContent=Math.floor(distance)+'m';
 ui.health.innerHTML=Array.from({length:3},(_,i)=>i<health?'◆':'<span style="opacity:.2">◆</span>').join(' ');
 ui.combo.textContent='×'+combo+' COMBO';
 const ratio=1-cooldown/6.5;
 ui.pulseFill.style.width=(clamp(ratio,0,1)*100)+'%';
 ui.pulseLabel.textContent=cooldown<=0?'PULSE READY':'PULSE RECHARGE';
 ui.pulseTime.textContent=cooldown<=0?'READY':cooldown.toFixed(1)+'s';
 ui.pulse.disabled=state!=='running'||cooldown>0;
 ui.pause.textContent=state==='paused'?'▶ RESUME':'⏸ PAUSE';
 ui.pause.disabled=state==='menu'||state==='over';
}
ui.start.addEventListener('click',()=>state==='paused'?pause():start());
ui.pulse.addEventListener('click',usePulse);
ui.pause.addEventListener('click',pause);
ui.restart.addEventListener('click',start);
const movement=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS']);
window.addEventListener('keydown',e=>{
 if(movement.has(e.code)){keys.add(e.code);mode='keys';e.preventDefault()}
 if(e.code==='Space'){e.preventDefault();if(!e.repeat)usePulse()}
 if(e.code==='KeyP'&&!e.repeat)pause();
 if(e.code==='KeyR'&&!e.repeat)start();
 if(e.code==='Enter'&&!e.repeat){if(state==='paused')pause();else if(state!=='running')start()}
});
window.addEventListener('keyup',e=>{keys.delete(e.code)});
window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='running')pause()});
function pointerMove(e){
 if(state!=='running')return;
 if(e.pointerType==='touch'&&e.type==='pointermove'&&e.buttons===0)return;
 const r=ui.arena.getBoundingClientRect();
 target.x=clamp((e.clientX-r.left)/r.width*2-1,-1,1)*6.7;
 target.y=clamp(1-(e.clientY-r.top)/r.height*2,-1,1)*4.3;
 mode='pointer';
}
ui.arena.addEventListener('pointerdown',e=>{if(state==='running'){ui.arena.setPointerCapture(e.pointerId);pointerMove(e)}});
ui.arena.addEventListener('pointermove',pointerMove);
ui.arena.addEventListener('pointerup',e=>{if(ui.arena.hasPointerCapture(e.pointerId))ui.arena.releasePointerCapture(e.pointerId)});
function steer(dt){
 const x=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
 const y=(keys.has('ArrowUp')||keys.has('KeyW')?1:0)-(keys.has('ArrowDown')||keys.has('KeyS')?1:0);
 if(mode==='keys'){
  const d=dt*10.5;ship.x=clamp(ship.x+x*d,-7.1,7.1);ship.y=clamp(ship.y+y*d,-4.7,4.7);
 }else{
  const a=1-Math.exp(-dt*8);ship.x+=(target.x-ship.x)*a;ship.y+=(target.y-ship.y)*a;
 }
}
function addWave(data){
 if(flash<=0)return data;
 const out=Array.from(data),r=(1-flash)*9.5+1.3,cyan=flash>.9;
 for(let i=0;i<56;i++){
  const a=i/56*Math.PI*2;
  out.push(ship.x+Math.cos(a)*r,ship.y+Math.sin(a)*r,10,.36,.65,a,cyan?.34:1,cyan?.95:.24,cyan?1:.48,flash*.24);
 }
 return Float32Array.from(out);
}
function loop(now){
 const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;
 if(state==='running'){
  time+=dt;steer(dt);
  settings.speed=21+Math.min(14,time*.19);
  const events=world.advance(dt,settings.speed,ship.x,ship.y);
  distance+=dt*settings.speed;
  for(const type of events){if(type==='orb')reward();else hit()}
  cooldown=Math.max(0,cooldown-dt);flash=Math.max(0,flash-dt*1.75);
 }else if(state==='menu')time+=dt*.22;
 if(toastAge>0){toastAge-=dt;if(toastAge<=0)ui.toast.classList.remove('show')}
 const data=addWave(world.splats(time));
 renderer.draw(data,ship.x,ship.y);
 frames++;frameTime+=dt;if(frameTime>.7){fps=Math.round(frames/frameTime);ui.perf.textContent=fps+' FPS · '+renderer.lastCount+' SPLATS';frameTime=0;frames=0;}
 updateHud();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// Dev/smoke-test hooks: verify actual gameplay state, input and GPU output.
window.__SPLAT_DEBUG__={
 getState:()=>({state,score,health,combo,distance,ship:{...ship},cooldown,splats:renderer.lastCount,resolution:[ui.canvas.width,ui.canvas.height],fps}),
 start,moveTo:(x,y)=>{mode='pointer';target={x,y}},pulse:usePulse,pause
};
document.documentElement.dataset.ready='true';
if(new URLSearchParams(location.search).has('smoke'))start();
