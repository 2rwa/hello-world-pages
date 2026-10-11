import {createRenderer} from './renderer.js';

const $=id=>document.getElementById(id);
const isCI=new URLSearchParams(location.search).has('ci');
const mobile=matchMedia('(max-width: 700px)').matches;
const config={
  mode:0,count:9,diffusion:0.070,width:0.72,height:2.05,
  waveSpeed:0.62,rotation:0.36,contours:0.84,glow:1.45,
  palette:0,grid:0.26,particles:110,particleSize:0.036,particleLift:0.9,
  speed:1.0,resolution:mobile?0.76:1.0,autoOrbit:true
};
const camera={yaw:0.70,pitch:0.78,distance:13.5};
let renderer=null,elapsed=0,paused=false,lastFrame=0,fps=0,fpsCounter=0,fpsWindow=0;
const formulas=[
  ['HEAT EQUATION','∂ₜu = D∇²u','広がりながらピークが低くなる。Gaussianの厳密解の重ね合わせ。'],
  ['VORTEX TRANSPORT','∂ₜu + (ω × r)·∇u = D∇²u','回転する流速場でGaussianが移流しながら拡散。'],
  ['WAVE EQUATION','∂ₜₜu = c²∇²u','進行・後退するGaussian変調平面波の厳密解。']
];
function textValue(key,value){
  if(key==='count'||key==='particles') return String(Math.round(value));
  if(key==='palette') return ['CYAN','MAGENTA','LIME'][value];
  return Number(value).toFixed(2);
}
function updateFormula(){
  const [name,formula,description]=formulas[config.mode];
  $('formulaName').textContent=name;
  $('formula').textContent=formula;
  $('formulaDescription').textContent=description;
}
for(const input of document.querySelectorAll('[data-param]')){
  const key=input.dataset.param;
  input.value=config[key];
  const valueElement=document.querySelector('[data-val="'+key+'"]');
  const update=()=>{
    const n=Number(input.value);
    config[key]=n;
    if(valueElement) valueElement.textContent=textValue(key,n);
    if(key==='mode') {elapsed=0;updateFormula();}
  };
  input.addEventListener('input',update);
  update();
}
$('autoOrbit').checked=config.autoOrbit;
$('autoOrbit').addEventListener('change',e=>config.autoOrbit=e.target.checked);
$('pauseButton').addEventListener('click',()=>{
  paused=!paused;
  $('pauseButton').textContent=paused?'▶ Resume':'Ⅱ Pause';
});
$('resetButton').addEventListener('click',()=>{elapsed=0;camera.yaw=0.7;camera.pitch=0.78;camera.distance=13.5;});
$('panelToggle').addEventListener('click',()=>{
  const panel=$('controlPanel');
  const hidden=panel.classList.toggle('collapsed');
  $('panelToggle').setAttribute('aria-expanded',String(!hidden));
  $('panelToggle').textContent=hidden?'CONTROLS +':'CONTROLS −';
});
if(mobile){$('controlPanel').classList.add('collapsed');$('panelToggle').setAttribute('aria-expanded','false');$('panelToggle').textContent='CONTROLS +';}
updateFormula();
const canvas=$('viewport');
const pointerPositions=new Map();
let singleDrag=null,pinchStart=null;
canvas.addEventListener('pointerdown',e=>{
  canvas.setPointerCapture(e.pointerId);
  pointerPositions.set(e.pointerId,[e.clientX,e.clientY]);
  if(pointerPositions.size===1){singleDrag=[e.clientX,e.clientY];pinchStart=null;}
  if(pointerPositions.size===2){singleDrag=null;pinchStart=null;}
});
canvas.addEventListener('pointermove',e=>{
  if(!pointerPositions.has(e.pointerId))return;
  pointerPositions.set(e.pointerId,[e.clientX,e.clientY]);
  if(pointerPositions.size===2){
    const pts=[...pointerPositions.values()];
    const distance=Math.hypot(pts[1][0]-pts[0][0],pts[1][1]-pts[0][1]);
    if(pinchStart!==null)camera.distance=Math.max(7,Math.min(26,camera.distance*pinchStart/distance));
    pinchStart=distance;
    return;
  }
  if(singleDrag){
    camera.yaw+=(e.clientX-singleDrag[0])*0.006;
    camera.pitch=Math.min(1.42,Math.max(0.12,camera.pitch+(e.clientY-singleDrag[1])*0.005));
    singleDrag=[e.clientX,e.clientY];
  }
});
for(const ev of ['pointerup','pointercancel','lostpointercapture']){
  canvas.addEventListener(ev,e=>{
    pointerPositions.delete(e.pointerId);
    if(pointerPositions.size===0)singleDrag=null;
  });
}
canvas.addEventListener('wheel',e=>{
  e.preventDefault();camera.distance=Math.max(7,Math.min(26,camera.distance*Math.exp(e.deltaY*0.001)));
},{passive:false});
function resize(){
  if(!renderer||isCI)return;
  const bounds=canvas.getBoundingClientRect();
  const ratio=Math.min(devicePixelRatio||1,1.8)*config.resolution;
  const scale=Math.min(1,Math.sqrt(1850000/Math.max(1,bounds.width*bounds.height*ratio*ratio)));
  renderer.resize(bounds.width*ratio*scale,bounds.height*ratio*scale);
}
async function start(){
  try {
    $('status').textContent='INITIALIZING GPU';
    renderer=await createRenderer(canvas,isCI);
    if(isCI){
      const result=await renderer.testDraw(config,camera);
      $('status').textContent='CI OK · '+JSON.stringify(result);
      return;
    }
    resize();
    addEventListener('resize',resize,{passive:true});
    $('status').textContent='WEBGPU · LIVE';
    requestAnimationFrame(frame);
  }catch(error){
    console.error(error);
    document.documentElement.dataset.webgpuStatus='error';
    document.documentElement.dataset.webgpuError=String(error.stack||error);
    $('status').textContent='WEBGPU ERROR';
    $('errorText').textContent=String(error.message||error);
    $('errorText').hidden=false;
  }
}
function frame(now){
  const dt=lastFrame?Math.min((now-lastFrame)/1000,0.08):0;
  lastFrame=now;
  if(!paused){
    elapsed+=dt*config.speed;
    if(config.autoOrbit)camera.yaw+=dt*0.115;
  }
  resize();
  try{
    renderer.draw(config,camera,elapsed%14.0);
  }catch(error){
    $('errorText').textContent=String(error.stack||error);
    $('errorText').hidden=false;
    return;
  }
  fpsCounter++;
  fpsWindow+=dt;
  if(fpsWindow>0.7){
    fps=Math.round(fpsCounter/fpsWindow);
    fpsWindow=0;fpsCounter=0;
    $('stats').textContent=`${fps} FPS  ·  ${canvas.width}×${canvas.height}  ·  T=${(elapsed%14).toFixed(1)}`;
  }
  requestAnimationFrame(frame);
}
start();
