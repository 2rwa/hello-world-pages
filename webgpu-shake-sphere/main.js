import {wgsl} from './shader.js';
import {MAX_BALLS,SHELL_RADIUS,radiusForCount,makeBalls,overlapStats,
 step,shake,compress,kineticEnergy} from './physics.js';
import {makeMotionSensor} from './sensor.js';
import {runGpuCheck} from './gpu-check.js';
const $=id=>document.getElementById(id);
const canvas=$('scene'),status=$('status'),fps=$('fps');
const countInput=$('count'),gainInput=$('gain'),iterationsInput=$('iterations');
const isCI=new URLSearchParams(location.search).has('ci');
const app={phase:'script-start',activeCount:30,renderedFrames:0};
window.__sphereApp=app;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
let balls=makeBalls(30),radius=radiusForCount(30);
let statistics=overlapStats(balls,radius);
let guiWidth=1,guiHeight=1,halfW=4.45,halfH=4.45,shiftY=0;
let gpuDevice,gpuContext,gpuPipeline,gpuFormat,gpuUniform,gpuGroup;
let renderW=0,renderH=0,paused=false,prevTime=0,frameIndex=0;
let fpsTime=0,fpsFrames=0,dragging=null,manualForce=[0,0,0],dragEnergy=0;
let statusTimer=0;
const sensor=makeMotionSensor(message=>{status.textContent=message;});
function state(stage,extra={}){Object.assign(app,{phase:stage,...extra});}
function fail(err){
 let detail=String(err?.message||err);
 console.error(err);state('error',{error:detail});
 status.textContent='ERROR: '+detail;document.documentElement.dataset.test='error';
}
function cameraAngles(){
 return {yaw:Number($('yaw').value)*Math.PI/180,pitch:0.25};
}
function viewPosition(b){
 const {yaw,pitch}=cameraAngles();
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const x=b.x*cy+b.z*sy;
 const z=b.z*cy-b.x*sy;
 return [x,b.y*cp-z*sp,b.y*sp+z*cp];
}
function projectedMarkers(){
 const view=balls.map(b=>viewPosition(b));
 const flags=new Float32Array(balls.length);
 let pairs=0;
 for(let i=0;i<view.length;i++)for(let j=i+1;j<view.length;j++){
  const x=view[i][0]-view[j][0],y=view[i][1]-view[j][1];
  if(x*x+y*y<4*radius*radius){
   pairs++;flags[i]++;flags[j]++;
  }
 }
 return {view,flags,pairs};
}
function updateMetrics(){
 statistics=overlapStats(balls,radius);
 const markers=projectedMarkers();
 $('projected').textContent=String(markers.pairs);
 $('penetrations').textContent=String(statistics.penetrationPairs);
 $('maxDepth').textContent=statistics.maxPenetration.toFixed(3);
 $('energy').textContent=kineticEnergy(balls).toFixed(1);
 app.activeCount=balls.length;
 app.penetrationPairs=statistics.penetrationPairs;
 app.maxPenetration=statistics.maxPenetration;
 app.projectedPairs=markers.pairs;
 app.radius=radius;
 return markers;
}
function reset(){
 balls=makeBalls(Number(countInput.value));
 radius=radiusForCount(balls.length);
 countInput.value=String(balls.length);
 $('countOut').textContent=String(balls.length);
 manualForce=[0,0,0];dragEnergy=0;
 updateMetrics();status.textContent='初期化しました';
}
countInput.addEventListener('input',reset);
for(const id of ['gain','iterations','yaw']){
 const ctrl=$(id);
 ctrl.addEventListener('input',()=>{
  $(id+'Out').textContent=ctrl.value+(id==='yaw'?'°':'');
  updateMetrics();
 });
}
for(const id of ['xray','overlap','gravity'])$(id).addEventListener('change',updateMetrics);
$('enable').addEventListener('click',async()=>{
 try{await sensor.activate();$('enable').textContent='センサー有効・再接続';}
 catch(e){status.textContent=String(e.message||e);}
});
$('shake').addEventListener('click',()=>{
 shake(balls,Number(gainInput.value));dragEnergy=23;
 status.textContent='シェイク中';app.shakes=(app.shakes||0)+1;updateMetrics();
});
$('compress').addEventListener('click',()=>{
 iterationsInput.value='0';$('iterationsOut').textContent='0';
 compress(balls,0.54);
 updateMetrics();status.textContent='重なり実験：実際のめり込みを作りました';
 app.compressions=(app.compressions||0)+1;
});
$('reset').addEventListener('click',reset);
$('pause').addEventListener('click',()=>{
 paused=!paused;$('pause').textContent=paused?'再開':'一時停止';
});
canvas.addEventListener('pointerdown',e=>{
 dragging={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now()};
 canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
 if(!dragging||e.pointerId!==dragging.id)return;
 const now=performance.now(),ms=Math.max(8,now-dragging.time);
 const dx=e.clientX-dragging.x,dy=e.clientY-dragging.y;
 const intensity=Number(gainInput.value);
 const factor=0.15*intensity*Math.min(2,16/ms);
 manualForce[0]=clamp(manualForce[0]-dx*factor,-42,42);
 manualForce[1]=clamp(manualForce[1]+dy*factor,-42,42);
 manualForce[2]=clamp(manualForce[2]+Math.hypot(dx,dy)*0.035,-30,30);
 dragEnergy=Math.max(dragEnergy,Math.hypot(dx,dy)*.7);
 dragging={id:e.pointerId,x:e.clientX,y:e.clientY,time:now};
});
function release(e){if(!dragging||e.pointerId!==dragging.id)return;dragging=null;}
canvas.addEventListener('pointerup',release);
canvas.addEventListener('pointercancel',release);
canvas.addEventListener('lostpointercapture',()=>{dragging=null;});
const keys=new Set();
document.addEventListener('keydown',e=>{
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)){
  if(e.target instanceof HTMLInputElement)return;
  e.preventDefault();keys.add(e.key);
  if(e.key===' '&&!e.repeat)$('shake').click();
 }
});
document.addEventListener('keyup',e=>keys.delete(e.key));
function dimensions(cssW,cssH){
 guiWidth=Math.max(1,cssW);guiHeight=Math.max(1,cssH);
 if(cssW<cssH){halfW=4.45;halfH=4.45*cssH/cssW;}
 else{halfH=4.45;halfW=4.45*cssW/cssH;}
 // Lift the sphere visually above the input controls, without moving the physics.
 shiftY=Math.min(2.0,$('controls').clientHeight*halfH/guiHeight*0.7);
}
function applyPhysics(dt){
 const motion=sensor.sample(dt),gain=Number(gainInput.value);
 const xArrow=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
 const yArrow=Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown'));
 const force=[
  clamp(motion[0]*gain+manualForce[0]-xArrow*14,-47,47),
  clamp(motion[1]*gain+manualForce[1]+yArrow*14,-47,47),
  clamp(motion[2]*gain+manualForce[2],-47,47)
 ];
 if(!paused){
  const iterations=Number(iterationsInput.value);
  for(let k=0;k<2;k++)step(balls,radius,dt*0.5,force,iterations,0.88,$('gravity').checked);
 }
 const damping=Math.exp(-7.5*dt);
 for(let k=0;k<3;k++)manualForce[k]*=damping;
 dragEnergy*=damping;updateMetrics();
 app.sensorReceived=sensor.received;app.energy=kineticEnergy(balls);
}
function uniformData(w,h){
 const data=new Float32Array(412);
 const markers=projectedMarkers();
 data.set([w,h,halfW,halfH],0);
 data.set([SHELL_RADIUS,balls.length,shiftY,0],4);
 data.set([Number($('xray').checked),Number($('overlap').checked),performance.now()*.001,0],8);
 for(let i=0;i<MAX_BALLS;i++){
  const off=12+i*4,foff=12+MAX_BALLS*4+i*4;
  const b=balls[i];
  if(b){
   const p=markers.view[i];
   data.set([p[0],p[1],p[2],radius],off);
   data.set([statistics.perBall[i],Math.min(markers.flags[i],1),0,0],foff);
  }else{
   data.set([0,0,0,0],off);
   data.set([0,0,0,0],foff);
  }
 }
 gpuDevice.queue.writeBuffer(gpuUniform,0,data);
}
async function initWebGPU(){
 if(!navigator.gpu)throw Error('WebGPU非対応です。HTTPSと対応ブラウザを確認してください');
 state('request-adapter');
 const adapter=await navigator.gpu.requestAdapter();
 if(!adapter)throw Error('GPU adapterが見つかりません');
 state('request-device');
 gpuDevice=await adapter.requestDevice();
 gpuDevice.lost.then(reason=>fail(Error('GPU device lost '+reason.message)));
 gpuDevice.addEventListener('uncapturederror',event=>fail(event.error));
 gpuFormat=isCI?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
 if(!isCI){
  gpuContext=canvas.getContext('webgpu');
  gpuContext.configure({device:gpuDevice,format:gpuFormat,alphaMode:'opaque'});
 }
 state('shader-compilation-info');
 const mod=gpuDevice.createShaderModule({label:'3D sphere shell and transparent overlapping marbles',code:wgsl});
 const compilation=await mod.getCompilationInfo();
 const errors=compilation.messages.filter(m=>m.type==='error');
 if(errors.length)throw Error('WGSL '+errors.map(m=>m.lineNum+':'+m.linePos+' '+m.message).join(' | '));
 state('create-pipeline');
 gpuDevice.pushErrorScope('validation');
 gpuPipeline=await gpuDevice.createRenderPipelineAsync({layout:'auto',
  vertex:{module:mod,entryPoint:'vertexMain'},
  fragment:{module:mod,entryPoint:'fragmentMain',targets:[{format:gpuFormat}]},
  primitive:{topology:'triangle-list'}});
 gpuUniform=gpuDevice.createBuffer({size:412*4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 gpuGroup=gpuDevice.createBindGroup({layout:gpuPipeline.getBindGroupLayout(0),
  entries:[{binding:0,resource:{buffer:gpuUniform}}]});
 const invalid=await gpuDevice.popErrorScope();
 if(invalid)throw Error('GPU validation '+invalid.message);
 state('gpu-ready');
}
function render(w,h,output){
 uniformData(w,h);
 const encoder=gpuDevice.createCommandEncoder();
 const pass=encoder.beginRenderPass({colorAttachments:[{
  view:output,loadOp:'clear',clearValue:{r:0,g:0,b:0,a:1},storeOp:'store'
 }]});
 pass.setPipeline(gpuPipeline);pass.setBindGroup(0,gpuGroup);pass.draw(3);pass.end();
 return encoder;
}
function resizeCanvas(){
 const cw=Math.max(1,canvas.clientWidth),ch=Math.max(1,canvas.clientHeight);
 dimensions(cw,ch);
 const budget=balls.length>25?380000:520000;
 const scale=Math.min(window.devicePixelRatio||1,1.25,Math.sqrt(budget/(cw*ch)));
 const w=Math.max(1,Math.floor(cw*scale)),h=Math.max(1,Math.floor(ch*scale));
 if(renderW!==w||renderH!==h){canvas.width=w;canvas.height=h;renderW=w;renderH=h;}
}
function frame(time){
 if(app.phase==='error')return;
 const dt=prevTime?Math.min(.033,(time-prevTime)/1000):.016;prevTime=time;
 applyPhysics(dt);resizeCanvas();
 gpuDevice.queue.submit([render(renderW,renderH,gpuContext.getCurrentTexture().createView()).finish()]);
 fpsFrames++;frameIndex++;
 if(time-fpsTime>700){
  fps.textContent=Math.round(1000*fpsFrames/Math.max(1,time-fpsTime))+' FPS · '+balls.length+' balls';
  $('sensorState').textContent=sensor.received?'モーション受信中':sensor.listening?'センサー待機中':'ドラッグで振れます';
  state('rendering',{renderedFrames:frameIndex});
  fpsTime=time;fpsFrames=0;
 }
 requestAnimationFrame(frame);
}
try{
 await initWebGPU();
 if(isCI){
  await runGpuCheck({device:gpuDevice,format:gpuFormat,render,dimensions,applyPhysics,
   getBalls:()=>balls,getRadius:()=>radius,getMetrics:()=>statistics,reset,
   setCount:n=>{countInput.value=String(n);reset();},
   compressNow:()=>{$('compress').click();},getApp:()=>app,
   state,status,makeSensor:()=>sensor});
 }else{
  status.textContent='準備完了。シェイクするか容器をドラッグ';
  requestAnimationFrame(frame);
 }
}catch(error){fail(error);}
