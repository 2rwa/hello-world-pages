import {defaults,presets,createWorld,resizeWorld,stepWorld,stir,testPhysics} from './physics.js';
import {GlassRenderer} from './renderer.js';
const ci=new URLSearchParams(location.search).has('ci');
const id=s=>document.getElementById(s);
const saved=(()=>{try{return JSON.parse(localStorage.getItem('glass-smoke-dynamics')||'null')}catch{return null}})();
const cfg={...defaults,...(saved&&typeof saved==='object'?saved:{})};
let world=createWorld(cfg),running=true,frameBusy=false,frameCount=0;
const renderer=new GlassRenderer(id('scene'),{offscreen:ci});
const sections=[
 ['GRAVITY & DYNAMICS',[
  ['gravity','Gravity strength',-24,28,.1],['gx','Gravity X',-1,1,.05],['gy','Gravity Y',-1,1,.05],['gz','Gravity Z',-1,1,.05],
  ['buoyancy','Smoke buoyancy',-3,7,.1],['smokeDrag','Smoke damping',0,5,.05],['ballDrag','Ball damping',0,3,.05],
  ['restitution','Collision bounce',0,1,.01],['turbulence','Turbulence',0,5,.05],['vorticity','Vortex force',0,6,.05],
  ['windX','Wind X',-4,4,.1],['windY','Wind Y',-4,4,.1],['windZ','Wind Z',-4,4,.1],['timeScale','Time speed',.05,3,.05]
 ]],
 ['SMOKE / GLASS INTERACTION',[
  ['push','Exclusion strength',0,9,.1],['pushRadius','Exclusion radius',0,.8,.01],
  ['transfer','Momentum transfer',0,5,.05],['wake','Wake strength',0,6,.05],
  ['wakeLife','Wake persistence',.1,8,.1],['diffusion','Smoke diffusion',0,4,.05]
 ]],
 ['APPEARANCE & OPTICS',[
  ['radius','Container radius',1.2,3.5,.05],['smokeCount','Smoke particles',0,700,1],
  ['smokeDensity','Smoke density',0,5,.05],['smokeAlpha','Smoke opacity',0,2,.05],
  ['ballCount','Glass marbles',0,16,1],['ballRadius','Marble radius',.07,.43,.01],
  ['sizeJitter','Size variation',0,.8,.01],['ior','Glass IOR',1.001,2.3,.005],
  ['dispersion','Chromatic dispersion',0,.6,.005],['reflectivity','Reflection',0,2,.05],
  ['gloss','Gloss / highlights',0,1,.01],['shellOpacity','Outer shell opacity',0,1,.01],
  ['bloom','Bloom / glow',0,2,.05]
 ]]
];
const fieldMap=new Map();
let timer=0,canvasSize='',autoRatio=1,slowFrames=0;
const controls=id('controls');
for(const [heading,fields] of sections){
 const section=document.createElement('section');section.className='control-section';
 const title=document.createElement('h2');title.textContent=heading;section.append(title);
 for(const [key,label,min,max,step] of fields){
  const field=document.createElement('div');field.className='control-field';
  const line=document.createElement('div');line.className='control-label';
  const lab=document.createElement('label');lab.htmlFor='range-'+key;lab.textContent=label;
  const number=document.createElement('input');number.type='number';number.min=min;number.max=max;number.step=step;number.id='num-'+key;
  const range=document.createElement('input');range.type='range';range.min=min;range.max=max;range.step=step;range.id='range-'+key;
  range.value=number.value=String(cfg[key]);
  line.append(lab,number);field.append(line,range);section.append(field);fieldMap.set(key,{range,number,min,max});
  const update=source=>{let value=Number(source.value);if(!Number.isFinite(value))return;value=Math.max(min,Math.min(max,value));setField(key,value)};
  number.addEventListener('change',()=>update(number));range.addEventListener('input',()=>update(range));
 }
 controls.append(section);
}
const extras=document.createElement('section');extras.className='control-section';
extras.innerHTML='<h2>COLOR & QUALITY</h2><div class="control-field"><div class="control-label"><label for="smoke-color">Smoke color</label></div><input id="smoke-color" type="color"></div><div class="preset-row"><label for="quality">RENDER QUALITY</label><select id="quality"><option value="auto">Auto</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select></div>';
controls.append(extras);id('smoke-color').value=cfg.smokeColor;id('quality').value=cfg.quality;
id('smoke-color').addEventListener('input',e=>{cfg.smokeColor=e.target.value;markCustom()});
id('quality').addEventListener('change',e=>{cfg.quality=e.target.value;autoRatio=1;canvasSize='';markCustom()});
function markCustom(){id('preset').value='Default'}
function syncUI(){
 for(const [key,inputs] of fieldMap){inputs.range.value=inputs.number.value=String(cfg[key]);}
 id('quality').value=cfg.quality;id('smoke-color').value=cfg.smokeColor;
}
function setField(key,value){
 const inputs=fieldMap.get(key);
 cfg[key]=value;
 if(inputs)inputs.range.value=inputs.number.value=String(value);
 if(key==='ballCount'||key==='smokeCount')resizeWorld(world,cfg);
 if(key==='ballRadius'||key==='sizeJitter')world=createWorld(cfg);
 if(key==='quality')canvasSize='';
 markCustom();
}
function applyConfig(input,rebuild=true){
 for(const [key,value] of Object.entries(input)){
  if(!(key in defaults))continue;
  if(key==='smokeColor'&&/^#[0-9a-f]{6}$/i.test(value)){cfg[key]=value;continue}
  if(key==='quality'&&['auto','low','medium','high','ultra'].includes(value)){cfg[key]=value;continue}
  const limits=fieldMap.get(key);
  if(limits&&Number.isFinite(value))cfg[key]=Math.max(limits.min,Math.min(limits.max,Number(value)));
 }
 if(rebuild)world=createWorld(cfg);
 syncUI();canvasSize='';
}
id('preset').addEventListener('change',e=>{applyConfig({...defaults,...presets[e.target.value]});});
id('play').addEventListener('click',()=>{running=!running;id('play').textContent=running?'⏸ Pause':'▶ Resume'});
id('stir').addEventListener('click',()=>stir(world,1.7));
id('reset').addEventListener('click',()=>world=createWorld(cfg));
id('reset-config').addEventListener('click',()=>{applyConfig(defaults);id('preset').value='Default'});
id('camera-reset').addEventListener('click',()=>{renderer.yaw=.25;renderer.pitch=.16;renderer.distance=cfg.radius*3.17});
id('save-local').addEventListener('click',()=>{try{localStorage.setItem('glass-smoke-dynamics',JSON.stringify(cfg));id('status').textContent='SETTINGS SAVED'}catch(e){id('status').textContent=e.message}});
id('clear-local').addEventListener('click',()=>{localStorage.removeItem('glass-smoke-dynamics');id('status').textContent='SAVED SETTINGS CLEARED'});
id('export-json').addEventListener('click',()=>{
 const blob=new Blob([JSON.stringify(cfg,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='glass-smoke-dynamics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
id('import-json').addEventListener('click',()=>id('import-file').click());
id('import-file').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{applyConfig(JSON.parse(await file.text()));id('status').textContent='SETTINGS IMPORTED'}catch(err){id('status').textContent='IMPORT ERROR: '+err.message}
 e.target.value='';
});
const panel=id('settings');function panelSet(open){panel.classList.toggle('open',open);id('settings-toggle').setAttribute('aria-expanded',String(open))}
id('settings-toggle').addEventListener('click',()=>panelSet(!panel.classList.contains('open')));
id('close-panel').addEventListener('click',()=>panelSet(false));
const pointer=new Map();let lastX=0,lastY=0,lastPinch=0;
const canvas=id('scene');
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointer.set(e.pointerId,{x:e.clientX,y:e.clientY});lastX=e.clientX;lastY=e.clientY});
canvas.addEventListener('pointermove',e=>{
 if(!pointer.has(e.pointerId))return;
 const old=pointer.get(e.pointerId);pointer.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointer.size===2){
  const coords=Array.from(pointer.values()),dist=Math.hypot(coords[0].x-coords[1].x,coords[0].y-coords[1].y);
  if(lastPinch)renderer.distance=Math.max(cfg.radius*1.6,Math.min(cfg.radius*8,renderer.distance*lastPinch/dist));
  lastPinch=dist;return;
 }
 renderer.yaw+=(e.clientX-old.x)*.007;
 renderer.pitch=Math.max(-1.43,Math.min(1.43,renderer.pitch+(e.clientY-old.y)*.007));
});
const clearPointer=e=>{pointer.delete(e.pointerId);lastPinch=0};
canvas.addEventListener('pointerup',clearPointer);canvas.addEventListener('pointercancel',clearPointer);
canvas.addEventListener('wheel',e=>{e.preventDefault();renderer.distance=Math.max(cfg.radius*1.6,Math.min(cfg.radius*8,renderer.distance*Math.exp(e.deltaY*.0012)))},{passive:false});
function adjustSize(){
 const rect=canvas.getBoundingClientRect(),ratio=rect.width/Math.max(1,rect.height);
 const base={low:320,medium:480,high:740,ultra:1100,auto:window.innerWidth<=850?280:540}[cfg.quality]||480;
 const w=Math.max(160,Math.round(base*(cfg.quality==='auto'?autoRatio:1))),h=Math.max(90,Math.round(w/ratio));
 const size=w+'x'+h;if(size!==canvasSize){renderer.resize(w,h);canvasSize=size}
}
let lastTime=0,accumulator=0,fpsTime=0,frames=0;
async function tick(now){
 requestAnimationFrame(tick);
 if(ci||!renderer.ready)return;
 const dt=Math.min(.06,Math.max(0,(now-lastTime)/1000||0));lastTime=now;
 if(running){accumulator=Math.min(.16,accumulator+dt*cfg.timeScale);let iterations=0;while(accumulator>=1/60&&iterations<8){stepWorld(world,cfg,1/60);accumulator-=1/60;iterations++;}}
 if(frameBusy)return;
 frameBusy=true;
 try{
  adjustSize();const began=performance.now();await renderer.draw(world,cfg);
  const duration=performance.now()-began;frames++;
  if(cfg.quality==='auto'){slowFrames=duration>75?slowFrames+1:Math.max(0,slowFrames-1);if(slowFrames>8&&autoRatio>.64){autoRatio*=.8;slowFrames=0;canvasSize=''}}
  if(now-fpsTime>1000){id('stats').textContent=world.smoke.length+' smoke · '+world.balls.length+' glass · '+renderer.width+'×'+renderer.height+' · '+frames+' fps';fpsTime=now;frames=0}
 }catch(err){renderer.ready=false;id('status').textContent='GPU ERROR: '+err.message;console.error(err)}
 finally{frameBusy=false}
}
async function launch(){
 try{
  id('status').textContent='INITIALIZING WEBGPU…';await renderer.init();renderer.distance=cfg.radius*3.17;
  if(!ci){id('status').textContent='WEBGPU ACTIVE · REAL 3D';requestAnimationFrame(tick)}
  else{id('status').textContent='WEBGPU TEST READY';document.documentElement.dataset.gpuPhase='ready'}
 }catch(err){id('status').textContent='WEBGPU ERROR: '+err.message;document.documentElement.dataset.gpuPhase='error';window.__gpuError=err.message;console.error(err)}
}
window.__app={
 cfg,get world(){return world},renderer,
 physicsProbe:testPhysics,
 step:(count=1)=>{for(let i=0;i<count;i++)stepWorld(world,cfg,1/60)},
 setControl:setField,applyConfig,
 snapshot:async(mode=0)=>{if(!renderer.ready)throw Error(window.__gpuError||'not ready');adjustSize();return renderer.draw(world,cfg,{mode,readback:true})},
 get ready(){return renderer.ready}
};
launch();
