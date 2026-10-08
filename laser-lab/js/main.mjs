import {W,H,defaults,createState,spawnWave,step} from './flight.mjs';
import {drawScene} from './scene.mjs';
import {LaserRenderer} from './gpu.mjs';
const $=id=>document.getElementById(id),scene=$('scene'),laser=$('laser');
const ctx=scene.getContext('2d',{alpha:false}),renderer=new LaserRenderer(laser),opts={...defaults};
const keys=new Set();let state=createState(),releasing=false,touchShoot=false,touchLocking=false,drag=null,last=0,accum=0,frames=0,fps=0,fpsTime=0;
function seedScene(s){spawnWave(s);s.spawnTimer=3.6;for(const [i,e] of s.enemies.entries()){e.y=120+(i%3)*95;e.t=i*.23;}}
seedScene(state);
function start(demo=false){state=createState();state.demo=demo;seedScene(state);releasing=false;touchLocking=false;drag=null;updateHud();}
function values(){
for(const [key,unit] of [['speed',' px/s'],['turn',' °/s'],['life',' s'],['width',' px'],['stagger',' ms']]){
const node=$(key),number=Number(node.value);opts[key]=number;$(key+'Out').value=number+unit;}
opts.mode=$('mode').value;opts.autoShot=$('autoShot').checked;opts.allLayers=$('allLayers').checked;
}
function resize(){
const resolution=Number($('resolution').value),laserRes=$('fullLaser').checked?Math.min(1080,Math.max(resolution,720)):resolution;
scene.width=resolution;scene.height=Math.round(resolution*H/W);ctx.setTransform(resolution/W,0,0,scene.height/H,0,0);
renderer.resize(laserRes,Math.round(laserRes*H/W));
}
for(const key of ['mode','speed','turn','life','width','stagger','autoShot','allLayers'])$(key).addEventListener('input',values);
for(const id of ['resolution','fullLaser'])$(id).addEventListener('change',resize);
$('resetParams').addEventListener('click',()=>{for(const [key,value] of Object.entries(defaults)){const node=$(key);if(!node)continue;if(node.type==='checkbox')node.checked=value;else node.value=value;}values();});
$('start').addEventListener('click',()=>{start(false);$('start').blur();});
function lockTouch(){if(state.demo)start(false);if(touchLocking){touchLocking=false;releasing=true;}else{touchLocking=true;}}
$('touchLock').addEventListener('click',lockTouch);
$('touchShot').addEventListener('pointerdown',e=>{e.preventDefault();touchShoot=true;$('touchShot').setPointerCapture(e.pointerId);});
$('touchShot').addEventListener('pointerup',()=>{touchShoot=false;});
$('touchShot').addEventListener('pointercancel',()=>{touchShoot=false;});
const gameCodes=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyX','KeyZ','KeyW','KeyA','KeyS','KeyD','KeyP']);
window.addEventListener('keydown',e=>{
if(e.target.matches('input,select,textarea'))return;
if(gameCodes.has(e.code))e.preventDefault();
if(!e.repeat){if(e.code==='Space')start(false);if(e.code==='KeyD')start(!state.demo);
if(e.code==='KeyP')state.paused=!state.paused;}
keys.add(e.code);
});
window.addEventListener('keyup',e=>{if(e.code==='KeyX'&&keys.has('KeyX'))releasing=true;keys.delete(e.code);});
window.addEventListener('blur',()=>{if(keys.has('KeyX'))releasing=true;keys.clear();drag=null;touchShoot=false;});
function pointerPosition(e){const r=scene.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H};}
scene.addEventListener('pointerdown',e=>{e.preventDefault();if(state.demo)start(false);scene.setPointerCapture(e.pointerId);drag=pointerPosition(e);});
scene.addEventListener('pointermove',e=>{if(drag)drag=pointerPosition(e);});
scene.addEventListener('pointerup',()=>{drag=null;});
scene.addEventListener('pointercancel',()=>{drag=null;});
function input(){
const dx=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
const dy=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
const lock=keys.has('KeyX')||touchLocking;state.lockHeld=lock;
return {dx,dy,fire:opts.autoShot||keys.has('KeyZ')||touchShoot,lock,release:releasing,...(drag?{moveX:drag.x,moveY:drag.y}:{})};
}
function updateHud(){
$('score').textContent=String(state.score).padStart(8,'0');
$('lockCount').textContent='LOCK '+state.locks.length+' / 8';
$('wave').textContent='WAVE '+String(state.wave).padStart(2,'0')+' ×'+String(2**state.combo);
$('health').textContent='SHIELD '+'●'.repeat(Math.max(0,state.player.hp))+'○'.repeat(5-Math.max(0,state.player.hp));
$('notice').style.display=state.demo||state.paused?'block':'none';
$('notice').innerHTML=state.paused?'PAUSED':state.demo?'DEMO MODE<small>SPACE: PLAY · X: LOCK AND RELEASE</small>':'';
$('touchLock').textContent=touchLocking?'FIRE!':'LOCK';
}
function loop(now){
if(!last)last=now;const dt=Math.min(.05,(now-last)/1000);last=now;accum=Math.min(.08,accum+dt);
while(accum>=1/120){const current=input();step(state,1/120,current,opts);accum-=1/120;releasing=false;}
drawScene(ctx,state);renderer.draw(state,opts);
frames++;fpsTime+=dt;if(fpsTime>=.5){fps=Math.round(frames/fpsTime);frames=0;fpsTime=0;updateHud();$('readout').textContent='FPS '+fps+' · '+state.lasers.length+' LASERS';
$('engine').textContent=renderer.gpu?'WEBGPU':'CANVAS FALLBACK';$('debug').textContent=(renderer.gpu?'WebGPU laser ribbons':'Canvas2D laser ribbons')+(renderer.error?'\n'+renderer.error:'')+'\nTRAILS '+state.lasers.reduce((n,l)=>n+l.trail.length,0); }
requestAnimationFrame(loop);
}
values();
resize();
renderer.init().then(usable=>{resize();$('engine').textContent=usable?'WEBGPU':'CANVAS FALLBACK';document.documentElement.dataset.ready='true';if(location.search.includes('smoke=1'))window.__laserLab={state,options:opts,renderer};});
window.addEventListener('error',e=>{document.documentElement.dataset.error=e.message;});
requestAnimationFrame(loop);