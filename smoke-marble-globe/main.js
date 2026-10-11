import {initial,normalized,presets,createControls} from './config.js';
import {SmokeWorld,clamp} from './physics.mjs';
import {SmokeGPU} from './render.mjs';
const root=document.documentElement,canvas=document.getElementById('view');
const ci=new URLSearchParams(location.search).has('ci'),storageKey='smoke-marble-globe-v1';
function loadSaved(){
 if(ci)return {};
 try{const parsed=JSON.parse(localStorage.getItem(storageKey)||'null');return normalized(parsed?.settings||parsed);}
 catch(e){console.warn('Settings unavailable',e);return {};}
}
const settings={...initial,...loadSaved()};
const world=new SmokeWorld(settings),gpu=new SmokeGPU(canvas,settings,ci);
let camera={yaw:.5,pitch:.18,distance:settings.cameraDistance};
let paused=false,clock=0,last=performance.now(),carry=0,fps=0,frames=0,elapsed=0,lastAdjustment=0,saveTimer=null;
const panel=document.getElementById('panel'),toggle=document.getElementById('toggle');
const notice=document.getElementById('notice'),stat=document.getElementById('stats');
function report(message){notice.textContent=message;}
function exportObject(){return {format:'Smoke Marble Globe',version:1,settings:normalized(settings)};}
function saveNow(){
 if(ci)return;
 try{localStorage.setItem(storageKey,JSON.stringify(exportObject()));report('設定をブラウザに保存しました');}
 catch(e){report('ブラウザへの設定保存に失敗しました');}
}
function scheduleSave(){if(ci)return;clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,350);}
function settingsChanged(id,changed=[]){
 const keys=id==='batch'?changed:[id];
 if(keys.some(k=>['seed','count','radius','radiusVariance','phaseRatio','initialSpread'].includes(k)))world.reset();
 if(keys.includes('cameraDistance'))camera.distance=settings.cameraDistance;
 if(keys.some(k=>['resolution','quality'].includes(k)))gpu.qualityScale=settings.resolution;
 scheduleSave();
}
const controls=createControls(document.getElementById('controls'),settings,settingsChanged);
document.getElementById('controlCount').textContent=controls.count+'項目';
const presetHolder=document.getElementById('presets');
for(const [name,values] of Object.entries(presets)){
 const b=document.createElement('button');b.dataset.preset=name;b.textContent=name;
 b.addEventListener('click',()=>{controls.setAll(values);report(name+' プリセットを適用しました');});
 presetHolder.append(b);
}
function updateSearch(){
 const matches=controls.search(document.getElementById('paramSearch').value);
 document.getElementById('resultCount').textContent=matches+' / '+controls.count+' 項目';return matches;
}
document.getElementById('paramSearch').addEventListener('input',updateSearch);
document.getElementById('clearSearch').addEventListener('click',()=>{
 document.getElementById('paramSearch').value='';updateSearch();
});
updateSearch();
function showPanel(show){
 panel.classList.toggle('closed',!show);
 panel.setAttribute('aria-hidden',String(!show));
 toggle.setAttribute('aria-expanded',String(show));
 toggle.firstChild.textContent=show?'⚙ 設定を閉じる ':'⚙ 詳細設定 ';
 root.dataset.panelStatus=show?'open':'closed';
}
toggle.addEventListener('click',()=>showPanel(panel.classList.contains('closed')));
document.getElementById('closePanel').addEventListener('click',()=>showPanel(false));
showPanel(!matchMedia('(max-width:700px)').matches);
document.addEventListener('keydown',e=>{if(e.key==='Escape')showPanel(false);});
document.getElementById('restore').addEventListener('click',()=>{
 controls.setAll(initial);world.reset();camera.yaw=.5;camera.pitch=.18;camera.distance=settings.cameraDistance;
 saveNow();report('初期設定を復元しました');
});
document.getElementById('export').addEventListener('click',()=>{
 const blob=new Blob([JSON.stringify(exportObject(),null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='smoke-marble-settings.json';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1200);report('設定JSONを保存しました');
});
const importFile=document.getElementById('importFile');
document.getElementById('import').addEventListener('click',()=>importFile.click());
function applyImport(json){
 if(!json||typeof json!=='object'||Array.isArray(json))throw Error('JSON object required');
 const safe=normalized(json.settings||json);
 if(Object.keys(safe).length===0)throw Error('有効な設定値がありません');
 controls.setAll(safe);saveNow();report(Object.keys(safe).length+'項目の設定を読み込みました');
}
importFile.addEventListener('change',async()=>{
 const file=importFile.files?.[0];if(!file)return;
 try{applyImport(JSON.parse(await file.text()));}catch(e){report('読込失敗: '+e.message);}
 finally{importFile.value='';}
});
document.getElementById('pause').addEventListener('click',e=>{
 paused=!paused;e.currentTarget.textContent=paused?'▶ RESUME':'Ⅱ PAUSE';
});
document.getElementById('stir').addEventListener('click',()=>world.stir());
document.getElementById('reset').addEventListener('click',()=>world.reset());
document.getElementById('cameraReset').addEventListener('click',()=>{
 camera.yaw=.5;camera.pitch=.18;camera.distance=3.15;controls.setValue('cameraDistance',3.15);
});
const pointers=new Map();let pinch=0;
canvas.addEventListener('pointerdown',e=>{
 pointers.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);pinch=0;
});
canvas.addEventListener('pointermove',e=>{
 const previous=pointers.get(e.pointerId);if(!previous)return;
 pointers.set(e.pointerId,[e.clientX,e.clientY]);
 if(pointers.size===1){
  camera.yaw+=(e.clientX-previous[0])*.007;
  camera.pitch=clamp(camera.pitch+(e.clientY-previous[1])*.007,-1.35,1.35);
 }else if(pointers.size===2){
  const p=[...pointers.values()];
  const distance=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);
  if(pinch>0)camera.distance=clamp(camera.distance*pinch/Math.max(1,distance),2.2,5.5);
  pinch=distance;
 }
});
function pointerEnd(e){pointers.delete(e.pointerId);pinch=0;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);
canvas.addEventListener('wheel',e=>{e.preventDefault();camera.distance=clamp(camera.distance*Math.exp(e.deltaY*.001),2.2,5.5);},{passive:false});
function viewVectors(){
 const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
 const right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp],forward=[sy*cp,sp,cy*cp];
 return {right,up,forward,position:forward.map(v=>-v*camera.distance)};
}
function advance(dt){
 if(paused)return;carry=Math.min(.11,carry+dt);
 let steps=0;
 while(carry>=1/120&&steps<13){world.step(1/120);clock+=1/120;carry-=1/120;steps++;}
}
function diagnostics(dt){
 frames++;elapsed+=dt;
 if(elapsed>.65){fps=frames/elapsed;frames=0;elapsed=0;}
 stat.textContent=settings.showStats==='on'
  ?'FPS '+fps.toFixed(1)+' · '+gpu.width+'×'+gpu.height+'\n'+settings.count+' SOFT SPHERES · WALL HITS '+world.impacts+'\nA/B SEPARATION · '+settings.quality.toUpperCase()
  :'';
 document.getElementById('deviceLabel').textContent='LIVE · '+gpu.width+'×'+gpu.height;
 if(settings.quality==='auto'&&performance.now()-lastAdjustment>2600&&fps>0){
  lastAdjustment=performance.now();
  if(fps<settings.targetFps*.82)gpu.qualityScale=clamp(gpu.qualityScale-.06,.3,settings.resolution);
  else if(fps>settings.targetFps*1.18)gpu.qualityScale=clamp(gpu.qualityScale+.03,.3,settings.resolution);
 }
}
async function draw(readback=false){world.validate();return gpu.draw(world,viewVectors(),clock,readback);}
function showError(e){root.dataset.webgpuStatus='error';root.dataset.webgpuError=e?.stack||String(e);
 const element=document.getElementById('error');element.hidden=false;element.textContent=root.dataset.webgpuError;console.error(e);}
async function animate(now){
 const dt=clamp((now-last)/1000,0,.05);last=now;
 try{advance(dt);await draw();diagnostics(dt);}catch(e){showError(e);return;}
 requestAnimationFrame(animate);
}
async function initialize(){
 root.dataset.webgpuStatus='initializing';root.dataset.webgpuStage='script-start';
 try{
  if(ci){controls.setAll({quality:'low',count:72,trail:0,resolution:.7});gpu.qualityScale=.7;}
  await gpu.initialize();
  window.__smoke={settings,world,gpu,camera,viewVectors,controls,draw,advance,showPanel,
    importObject:applyImport,exportObject,get paused(){return paused;}};
  if(ci){
   const report=await draw(true);root.dataset.webgpuPixels=JSON.stringify(report);
   if(report.brightness<1000||report.nonblack<80)throw Error('GPU pixels not visible: '+JSON.stringify(report));
   root.dataset.webgpuStatus='ok';root.dataset.webgpuStage='done';
  }else{root.dataset.webgpuStatus='ok';requestAnimationFrame(animate);}
 }catch(e){showError(e);}
}
initialize();
