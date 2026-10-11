import {initial,clamp,makeSettings} from './config.js';
import {Simulation} from './physics.mjs';
import {GPUView} from './render.mjs';
const canvas=document.querySelector('#view'),root=document.documentElement;
const state={...initial};const ci=new URLSearchParams(location.search).has('ci');
const simulation=new Simulation(state);const camera={yaw:.47,pitch:.2,distance:state.cameraDistance};
const gpu=new GPUView(canvas,state,ci?{width:100,height:80}:null);
const readout=document.getElementById('readout'),err=document.getElementById('error'),menu=document.getElementById('panel'),menuButton=document.getElementById('menuButton');
let paused=false,clock=0,last=performance.now(),carry=0,frames=0,fps=0,span=0,lastQuality=0,drag=new Map(),lastTouch=0;
function showError(error){const message=error?.stack||String(error);root.dataset.webgpuStatus='error';root.dataset.webgpuError=message;err.textContent=message;err.hidden=false;console.error(error);}
function syncQuality(){document.getElementById('qualityLabel').textContent=`${state.quality.toUpperCase()} · ${gpu.width}×${gpu.height}`;}
const setValue=makeSettings(document.getElementById('settings'),state,id=>{if(id==='cameraDistance')camera.distance=state.cameraDistance;if(id==='resolution'||id==='quality')gpu.qualityScale=state.resolution;if(id==='count'&&state.count>100)state.count=100;syncQuality();});
function setExpanded(expanded){menu.classList.toggle('collapsed',!expanded);menuButton.setAttribute('aria-expanded',String(expanded));menu.setAttribute('aria-hidden',String(!expanded));}
menuButton.addEventListener('click',()=>setExpanded(true));document.getElementById('minimize').addEventListener('click',()=>setExpanded(false));
document.getElementById('pause').addEventListener('click',()=>{paused=!paused;document.getElementById('pause').textContent=paused?'▶ RESUME':'Ⅱ PAUSE';});
document.getElementById('burst').addEventListener('click',()=>simulation.burst());
document.getElementById('reset').addEventListener('click',()=>simulation.reset());
document.getElementById('cameraReset').addEventListener('click',()=>{camera.yaw=.47;camera.pitch=.2;camera.distance=3.35;setValue('cameraDistance',3.35);});
if(matchMedia('(max-width:700px)').matches)setExpanded(false);
canvas.addEventListener('pointerdown',e=>{drag.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
  const previous=drag.get(e.pointerId);if(!previous)return;
  if(drag.size===1){camera.yaw+=(e.clientX-previous[0])*.007;camera.pitch=clamp(camera.pitch+(e.clientY-previous[1])*.007,-1.45,1.45);}
  drag.set(e.pointerId,[e.clientX,e.clientY]);
  if(drag.size===2){const pts=[...drag.values()];const current=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);if(lastTouch>0)camera.distance=clamp(camera.distance*lastTouch/Math.max(5,current),2.1,6);lastTouch=current;}
});
function endPointer(e){drag.delete(e.pointerId);lastTouch=0;if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('wheel',e=>{e.preventDefault();camera.distance=clamp(camera.distance*Math.exp(e.deltaY*.001),2.1,6);},{passive:false});
function getCamera(){const yaw=camera.yaw,pitch=camera.pitch,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp],forward=[sy*cp,sp,cy*cp];
 return {right,up,forward,position:forward.map(n=>-n*camera.distance),distance:camera.distance};
}
function advance(dt){if(paused)return;const fixed=1/120;carry=Math.min(.1,carry+dt);
 let loops=0;while(carry>=fixed&&loops<12){simulation.step(fixed);carry-=fixed;clock+=fixed;loops++;}
 camera.yaw+=state.rotation*dt*.25;
}
function updateFps(dt){frames++;span+=dt;if(span>=.65){fps=frames/span;frames=0;span=0;}
 const detail=state.showStats==='on'?`FPS ${fps.toFixed(1)} · ${gpu.width}×${gpu.height} · ${state.count}/100 PARTICLES\n${state.mode.toUpperCase()} · ${state.quality.toUpperCase()} · GRID ${state.spatial.toUpperCase()} · CANDIDATES ${simulation.candidatePairs||0}`:'';
 readout.textContent=detail;syncQuality();
 if(state.quality==='auto'&&clock-lastQuality>2.5&&fps>0){
   lastQuality=clock;const target=state.targetFps;
   if(fps<target*.83)gpu.qualityScale=clamp(gpu.qualityScale-.075,.30,state.resolution);
   else if(fps>target*1.15)gpu.qualityScale=clamp(gpu.qualityScale+.04,.30,state.resolution);
 }
}
async function drawOnce(readback=false){const result=await gpu.draw(simulation,getCamera(),clock,readback);simulation.validateBounds();return result;}
async function animate(now){const dt=clamp((now-last)/1000,0,.05);last=now;
 try{advance(dt);await drawOnce();updateFps(dt);}catch(error){showError(error);return;}
 requestAnimationFrame(animate);
}
async function initialize(){try{
 root.dataset.webgpuStatus='initializing';root.dataset.webgpuStage='script-start';
 if(ci){state.resolution=.42;state.maxDpr=1;state.quality='low';state.marchSteps=32;state.count=24;state.bloom=.5;gpu.qualityScale=.42;}
 await gpu.initialize();syncQuality();
 window.__gbs={state,simulation,gpu,camera,setValue,setExpanded,drawOnce,advance,getCamera,get paused(){return paused;}};
 root.dataset.webgpuStage='submitted-work-wait';
 if(ci){const report=await drawOnce(true);if(report.nonblack<8||report.brightness<1000)throw Error('Offscreen pixels are black: '+JSON.stringify(report));root.dataset.webgpuPixels=JSON.stringify(report);root.dataset.webgpuStatus='ok';root.dataset.webgpuStage='done';readout.textContent='CI OK · '+JSON.stringify(report);}
 else{root.dataset.webgpuStatus='ok';requestAnimationFrame(animate);}
 }catch(error){showError(error);}}
initialize();
