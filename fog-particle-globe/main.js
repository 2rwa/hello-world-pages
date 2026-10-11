import {stateDefault,buildControls,normalizeSettings} from './settings.js';
import {FogSimulation,clamp} from './physics.mjs';
import {FogGPU} from './render.mjs';
const canvas=document.getElementById('view'),root=document.documentElement;
const ci=new URLSearchParams(location.search).has('ci');
const STORAGE_KEY='fog-particle-globe-controls-v2';
function readSettings(){
 if(ci)return {};
 try{
  const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
  return normalizeSettings(saved?.settings||saved);
 }catch(e){console.warn('Saved settings unavailable',e);return {};}
}
const state={...stateDefault,...readSettings()};
const sim=new FogSimulation(state),view=new FogGPU(canvas,state,ci);
const panel=document.getElementById('panel'),openPanel=document.getElementById('openPanel');
const readout=document.getElementById('readout'),errorEl=document.getElementById('error');
let camera={yaw:.5,pitch:.15,distance:3.4};
let paused=false,clock=0,last=performance.now(),accum=0,frames=0,frameTime=0,fps=0,lastAdjustment=0,started=false;
const touches=new Map();let pinch=0;
function cameraVectors(){
 const yaw=camera.yaw,pitch=camera.pitch,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp],forward=[sy*cp,sp,cy*cp];
 return {right,up,forward,position:forward.map(v=>-v*camera.distance)};
}
function setExpanded(expanded){
 panel.classList.toggle('collapsed',!expanded);
 panel.setAttribute('aria-hidden',String(!expanded));
 openPanel.classList.toggle('visible',!expanded);
 openPanel.setAttribute('aria-expanded',String(expanded));
}
openPanel.addEventListener('click',()=>setExpanded(true));
document.getElementById('closePanel').addEventListener('click',()=>setExpanded(false));
if(matchMedia('(max-width:700px)').matches)setExpanded(false);
const settingsMessage=document.getElementById('settingsMessage');
let saveTimer=0;
function setMessage(message){settingsMessage.textContent=message;}
function exportObject(){return {format:'Fog Particle Globe',version:2,settings:normalizeSettings(state)};}
function persistNow(){
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(exportObject()));return true;}
 catch(e){console.warn('Settings could not be saved',e);setMessage('このブラウザでは自動保存できません');return false;}
}
function scheduleSave(){
 if(ci)return;
 clearTimeout(saveTimer);saveTimer=setTimeout(()=>{
  if(persistNow())setMessage('設定をこのブラウザに保存しました');
 },260);
}
const setValue=buildControls(document.getElementById('controls'),state,id=>{
 if(['seed','shape','spread','sizeVariance','batch'].includes(id))sim.reset();
 if(id==='resolution'||id==='quality'||id==='batch')view.qualityScale=state.resolution;
 if(id!=='preset')scheduleSave();
});
function applyImport(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('設定JSONの形式が正しくありません');
 const input=data.settings&&typeof data.settings==='object'?data.settings:data;
 const normalized=normalizeSettings(input);
 const count=setValue.setAll(normalized);
 if(count===0)throw Error('有効なパラメータがありません');
 if(!ci)persistNow();
 setMessage(count+'項目の設定を読み込みました');
 return count;
}
const searchInput=document.getElementById('controlSearch');
const resultCount=document.getElementById('resultCount');
function filterSettings(){
 const matches=setValue.filter(searchInput.value);
 resultCount.textContent=matches+' / '+setValue.count+' 項目';
 return matches;
}
searchInput.addEventListener('input',filterSettings);
document.getElementById('clearSearch').addEventListener('click',()=>{
 searchInput.value='';filterSettings();searchInput.focus();
});
filterSettings();
document.getElementById('compactCount').textContent=setValue.count+'項目';
document.getElementById('restoreDefaults').addEventListener('click',()=>{
 setValue.setAll(stateDefault);sim.reset();camera={yaw:.5,pitch:.15,distance:3.4};
 if(!ci)persistNow();setMessage('初期設定に戻しました');
});
document.getElementById('downloadConfig').addEventListener('click',()=>{
 const raw=JSON.stringify(exportObject(),null,2);
 const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='fog-particle-settings.json';
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 setMessage('設定JSONをダウンロードしました');
});
const uploadInput=document.getElementById('uploadConfig');
document.getElementById('uploadConfigButton').addEventListener('click',()=>uploadInput.click());
uploadInput.addEventListener('change',async()=>{
 const file=uploadInput.files?.[0];if(!file)return;
 try{const data=JSON.parse(await file.text());applyImport(data);}
 catch(e){setMessage('読み込み失敗: '+e.message);console.error(e);}
 finally{uploadInput.value='';}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.classList.contains('collapsed'))setExpanded(false);});
window.__fogSettings={exportObject,importObject:applyImport,persistNow,filterSettings,resetDefaults:()=>document.getElementById('restoreDefaults').click()};
document.getElementById('pause').addEventListener('click',()=>{paused=!paused;document.getElementById('pause').textContent=paused?'▶ RESUME':'Ⅱ PAUSE';});
document.getElementById('reset').addEventListener('click',()=>sim.reset());
document.getElementById('burst').addEventListener('click',()=>sim.stir());
document.getElementById('viewReset').addEventListener('click',()=>{camera.yaw=.5;camera.pitch=.15;camera.distance=3.4;});
canvas.addEventListener('pointerdown',e=>{touches.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);pinch=0;});
canvas.addEventListener('pointermove',e=>{
 const former=touches.get(e.pointerId);if(!former)return;
 touches.set(e.pointerId,[e.clientX,e.clientY]);
 if(touches.size===1){camera.yaw+=(e.clientX-former[0])*.007;camera.pitch=clamp(camera.pitch+(e.clientY-former[1])*.007,-1.35,1.35);}
 if(touches.size===2){const a=[...touches.values()],distance=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);if(pinch>0)camera.distance=clamp(camera.distance*pinch/Math.max(1,distance),2.15,7);pinch=distance;}
});
function endPointer(e){touches.delete(e.pointerId);pinch=0;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('wheel',e=>{e.preventDefault();camera.distance=clamp(camera.distance*Math.exp(e.deltaY*.001),2.15,7);},{passive:false});
function advance(delta){
 if(paused)return;
 accum=Math.min(.12,accum+delta);
 let loops=0;while(accum>=1/120&&loops<14){sim.step(1/120);clock+=1/120;accum-=1/120;loops++;}
}
function errorOut(e){
 root.dataset.webgpuStatus='error';root.dataset.webgpuError=e?.stack||String(e);
 errorEl.textContent=root.dataset.webgpuError;errorEl.hidden=false;console.error(e);
}
function status(dt){
 frames++;frameTime+=dt;
 if(frameTime>=.7){fps=frames/frameTime;frames=0;frameTime=0;}
 if(state.showStats==='on')readout.textContent='FPS '+fps.toFixed(1)+' · '+view.width+'×'+view.height+'\n'+state.count+' / 2400 FOG PARTICLES · '+state.quality.toUpperCase();
 else readout.textContent='';
 document.getElementById('qualityLabel').textContent=state.quality.toUpperCase()+' · '+view.width+'×'+view.height;
 if(state.quality==='auto'&&performance.now()-lastAdjustment>2600&&fps>0){
  lastAdjustment=performance.now();
  const target=state.targetFps;
  if(fps<target*.82)view.qualityScale=clamp(view.qualityScale-.055,.3,state.resolution);
  else if(fps>target*1.16)view.qualityScale=clamp(view.qualityScale+.03,.3,state.resolution);
 }
}
async function draw(readback=false){sim.validate();return view.draw(sim,cameraVectors(),clock,readback);}
async function frame(now){
 const dt=clamp((now-last)/1000,0,.05);last=now;
 try{advance(dt);await draw();status(dt);}catch(e){errorOut(e);return;}
 requestAnimationFrame(frame);
}
async function initialize(){
 root.dataset.webgpuStatus='initializing';root.dataset.webgpuStage='script-start';
 try{
  if(ci){setValue.setAll({count:150,quality:'low',resolution:.55,trail:0});view.qualityScale=.55;}
  await view.initialize();started=true;
  window.__fog={state,sim,view,camera,setValue,setExpanded,advance,draw,cameraVectors,get paused(){return paused;}};
  if(ci){
   const pixels=await draw(true);
   if(pixels.brightness<1000||pixels.nonblack<50)throw Error('Render is blank: '+JSON.stringify(pixels));
   root.dataset.webgpuPixels=JSON.stringify(pixels);root.dataset.webgpuStatus='ok';root.dataset.webgpuStage='done';
  }else{root.dataset.webgpuStatus='ok';requestAnimationFrame(frame);}
 }catch(e){errorOut(e);}
}
initialize();
