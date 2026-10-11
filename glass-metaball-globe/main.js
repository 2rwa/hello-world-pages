import {defaults,normalize,presets,createControls} from './config.js';
import {MarblePhysics,clamp} from './physics.mjs';
import {GlassRenderer} from './render.mjs';
const root=document.documentElement,canvas=document.getElementById('view');
const ci=new URLSearchParams(location.search).has('ci'),KEY='glass-metaball-globe-controls-v1';
function saved(){
 if(ci)return {};
 try{const data=JSON.parse(localStorage.getItem(KEY)||'null');return normalize(data?.settings||data);}catch{return {};}
}
const state={...defaults,...saved()},world=new MarblePhysics(state),renderer=new GlassRenderer(canvas,state,ci);
let camera={yaw:.48,pitch:.20,distance:state.cameraDistance};
let paused=false,time=0,last=performance.now(),accumulator=0;
let fps=0,frames=0,elapsed=0,lastQuality=0,saveTimer=null;
const panel=document.getElementById('panel'),toggle=document.getElementById('toggle');
const status=document.getElementById('stats'),notice=document.getElementById('notice');
function message(text){notice.textContent=text;}
function settingsJSON(){return {format:'Glass Metaball Globe',version:1,settings:normalize(state)};}
function store(){if(ci)return;try{localStorage.setItem(KEY,JSON.stringify(settingsJSON()));message('設定を保存しました');}catch(e){message('保存できません: '+e.message);}}
function schedule(){if(ci)return;clearTimeout(saveTimer);saveTimer=setTimeout(store,300);}
function onChange(keys){
 if(keys.some(k=>['count','seed','radius','variance','spread'].includes(k)))world.reset();
 else if(keys.includes('wallGap'))world.contain();
 if(keys.includes('cameraDistance'))camera.distance=state.cameraDistance;
 if(keys.includes('resolution')||keys.includes('quality'))renderer.scale=state.resolution;
 schedule();
}
const ui=createControls(document.getElementById('controls'),state,onChange);
document.getElementById('controlCount').textContent=ui.count+' adjustable controls';
for(const [title,preset] of Object.entries(presets)){
 const btn=document.createElement('button');btn.dataset.preset=title;btn.textContent=title;
 btn.addEventListener('click',()=>{ui.setAll(preset);message(title+' プリセットを適用');});
 document.getElementById('presets').append(btn);
}
function filter(){
 const count=ui.search(document.getElementById('search').value);
 document.getElementById('resultCount').textContent=count+' / '+ui.count+' 項目';return count;
}
document.getElementById('search').addEventListener('input',filter);
document.getElementById('clearSearch').addEventListener('click',()=>{
 document.getElementById('search').value='';filter();
});
filter();
function showPanel(open){
 panel.classList.toggle('closed',!open);
 panel.setAttribute('aria-hidden',String(!open));
 toggle.setAttribute('aria-expanded',String(open));
 toggle.firstChild.textContent=open?'⚙ 設定を閉じる ':'⚙ 詳細設定 ';
 root.dataset.panel=open?'open':'closed';
}
toggle.addEventListener('click',()=>showPanel(panel.classList.contains('closed')));
document.getElementById('closePanel').addEventListener('click',()=>showPanel(false));
showPanel(!matchMedia('(max-width:700px)').matches);
document.addEventListener('keydown',e=>{if(e.key==='Escape')showPanel(false);});
document.getElementById('defaults').addEventListener('click',()=>{
 ui.setAll(defaults);world.reset();camera.yaw=.48;camera.pitch=.20;camera.distance=state.cameraDistance;
 store();message('初期値を復元しました');
});
document.getElementById('export').addEventListener('click',()=>{
 const blob=new Blob([JSON.stringify(settingsJSON(),null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='glass-metaball-settings.json';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);message('設定JSONを保存しました');
});
const importFile=document.getElementById('importFile');
document.getElementById('import').addEventListener('click',()=>importFile.click());
function importSettings(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('設定JSONの形式が不正です');
 const patch=normalize(data.settings||data);
 const changed=ui.setAll(patch);if(!changed)throw Error('有効な設定項目がありません');
 store();message(changed+'項目の設定を読み込みました');return changed;
}
importFile.addEventListener('change',async()=>{
 const file=importFile.files?.[0];if(!file)return;
 try{importSettings(JSON.parse(await file.text()));}catch(e){message('読み込み失敗: '+e.message);}
 finally{importFile.value='';}
});
document.getElementById('pause').addEventListener('click',e=>{
 paused=!paused;e.currentTarget.textContent=paused?'▶ RESUME':'Ⅱ PAUSE';
});
document.getElementById('stir').addEventListener('click',()=>world.stir());
document.getElementById('reset').addEventListener('click',()=>world.reset());
document.getElementById('resetCamera').addEventListener('click',()=>{
 camera.yaw=.48;camera.pitch=.20;ui.set('cameraDistance',3.25);
});
const touches=new Map();let pinch=0;
canvas.addEventListener('pointerdown',e=>{
 touches.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);pinch=0;
});
canvas.addEventListener('pointermove',e=>{
 const previous=touches.get(e.pointerId);if(!previous)return;
 touches.set(e.pointerId,[e.clientX,e.clientY]);
 if(touches.size===1){
  camera.yaw+=(e.clientX-previous[0])*.007;
  camera.pitch=clamp(camera.pitch+(e.clientY-previous[1])*.007,-1.36,1.36);
 }else if(touches.size===2){
  const pos=[...touches.values()];
  const dist=Math.hypot(pos[0][0]-pos[1][0],pos[0][1]-pos[1][1]);
  if(pinch>0)camera.distance=clamp(camera.distance*pinch/Math.max(1,dist),2.25,6);
  pinch=dist;
 }
});
function stop(e){touches.delete(e.pointerId);pinch=0;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
canvas.addEventListener('wheel',e=>{e.preventDefault();camera.distance=clamp(camera.distance*Math.exp(e.deltaY*.001),2.25,6);},{passive:false});
function cameraBasis(){
 const y=camera.yaw,p=camera.pitch,cy=Math.cos(y),sy=Math.sin(y),cp=Math.cos(p),sp=Math.sin(p);
 const forward=[sy*cp,sp,cy*cp],right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp];
 return {forward,right,up,position:forward.map(v=>-v*camera.distance)};
}
function advance(dt){
 if(paused)return;
 accumulator=Math.min(.12,accumulator+dt);
 let steps=0;
 while(accumulator>=1/120&&steps<14){
  world.step(1/120);time+=1/120;accumulator-=1/120;steps++;
 }
}
async function draw(readback=false){world.validate();return renderer.draw(world,cameraBasis(),time,readback);}
function updateStats(dt){
 frames++;elapsed+=dt;
 if(elapsed>.65){fps=frames/elapsed;frames=0;elapsed=0;}
 status.textContent=state.showStats==='on'
  ?fps.toFixed(1)+' FPS · '+renderer.width+'×'+renderer.height+
   '\n'+state.count+' CRYSTAL BLOBS · '+world.contacts+' CONTACTS'+
   '\nIOR '+state.ior+' · SMOOTH '+state.blend.toFixed(2)
  :'';
 document.getElementById('statusLabel').textContent='WEBGPU · '+renderer.width+'×'+renderer.height;
 if(state.quality==='auto'&&performance.now()-lastQuality>2600&&fps>0){
  lastQuality=performance.now();
  if(fps<state.targetFps*.80)renderer.scale=clamp(renderer.scale-.05,.25,state.resolution);
  else if(fps>state.targetFps*1.2)renderer.scale=clamp(renderer.scale+.025,.25,state.resolution);
 }
}
function fail(err){
 root.dataset.webgpuStatus='error';root.dataset.webgpuError=err?.stack||String(err);
 const message=document.getElementById('error');message.hidden=false;message.textContent=root.dataset.webgpuError;console.error(err);
}
async function frame(now){
 const dt=clamp((now-last)/1000,0,.045);last=now;
 try{advance(dt);await draw();updateStats(dt);}catch(err){fail(err);return;}
 requestAnimationFrame(frame);
}
async function start(){
 root.dataset.webgpuStatus='initializing';root.dataset.webgpuStage='script-start';
 try{
  if(ci){ui.setAll({quality:'low',count:10,trail:0,resolution:.75});renderer.scale=.75;}
  await renderer.initialize();
  window.__glass={state,world,renderer,camera,ui,draw,advance,showPanel,settingsJSON,importSettings,get paused(){return paused;}};
  if(ci){
   const pixels=await draw(true);root.dataset.gpuPixels=JSON.stringify(pixels);
   if(pixels.brightness<1000||pixels.brightPixels<50)throw Error('Blank GPU drawing '+JSON.stringify(pixels));
   root.dataset.webgpuStatus='ok';root.dataset.webgpuStage='done';
  }else{root.dataset.webgpuStatus='ok';requestAnimationFrame(frame);}
 }catch(err){fail(err);}
}
start();
