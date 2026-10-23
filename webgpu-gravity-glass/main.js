import {wgsl} from './shader.js';
import {MAX_BALLS,choosePacking,integrateMarbles} from './marbles.js';
import {createTiltSensor} from './tilt.js';
import {runGpuRegression} from './ci-run.js';

const $ = id => document.getElementById(id);
const canvas=$('view'), status=$('status'), meter=$('meter'), tiltReadout=$('tiltReadout');
const sensorButton=$('sensorButton'), countPicker=$('count'), frictionPicker=$('friction');
const isCI=new URLSearchParams(location.search).has('ci');
const maximumBalls=MAX_BALLS,initialCount=3;
let ballRadius=0.65;
let halfW=3,halfH=5, gpuDevice, gpuContext, gpuPipeline, gpuGroup, gpuUniform, gpuFormat;
let running=true, renderWidth=0,renderHeight=0, lastTick=0,frameCounter=0,lastMeterTime=0;
let touchG=[0,0],screenG=[0,0];
let pointerId=null,pointerOrigin=null, pointerCurrent=null;
let activeCount=initialCount;
const balls=[];
window.__gravityGlass={phase:'script-start',source:'touch'};
function setPhase(phase, extra={}) {Object.assign(window.__gravityGlass,{phase,...extra});}
function say(message){status.textContent=message;}
function bounded(value,lo,hi){return Math.max(lo,Math.min(hi,value));}
const sensor=createTiltSensor($,sensorButton,say);
function resetBalls(){
 const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
 halfH=5;halfW=halfH*width/height;
 const packing=choosePacking(activeCount,halfW,halfH);
 ballRadius=packing.radius;
 balls.length=0;
 for(let i=0;i<maximumBalls;i++){
  const [x,y]=packing.positions[i]??[0,0];
  balls.push({x,y,vx:0,vy:0,q:[0,0,0,1]});
 }
 screenG=[0,0];touchG=[0,0];
 window.__gravityGlass.activeCount=activeCount;
 window.__gravityGlass.radius=ballRadius;
}
function layoutBounds(cssW,cssH){
 const previousW=halfW,nextW=halfH*cssW/Math.max(1,cssH);
 if(Math.abs(previousW-nextW)>0.02){
  halfW=nextW;
  const nextPacking=choosePacking(activeCount,halfW,halfH);
  const oldRadius=ballRadius;
  ballRadius=nextPacking.radius;
  if(Math.abs(oldRadius-ballRadius)>0.04){
   for(let i=0;i<activeCount;i++){
    const bead=balls[i],[x,y]=nextPacking.positions[i];
    bead.x=x;bead.y=y;bead.vx=0;bead.vy=0;
   }
  }
 }
 const limitX=Math.max(0.015,halfW-ballRadius-0.15);
 const limitY=halfH-ballRadius-0.15;
 for(let i=0;i<activeCount;i++){
  balls[i].x=bounded(balls[i].x,-limitX,limitX);
  balls[i].y=bounded(balls[i].y,-limitY,limitY);
 }
}
function stepPhysics(dt,gx,gy){
 integrateMarbles(balls,activeCount,ballRadius,halfW,halfH,
  dt,gx,gy,Number(frictionPicker.value));
}
resetBalls();
$('reset').addEventListener('click',()=>{resetBalls();say('玉を中央に戻しました');});
$('pause').addEventListener('click',()=>{
 running=!running;$('pause').textContent=running?'一時停止':'再開';
});
countPicker.value=String(activeCount);
countPicker.addEventListener('input',()=>{
 activeCount=Number(countPicker.value);$('countOut').textContent=String(activeCount);
 resetBalls();
});
frictionPicker.addEventListener('input',()=>{$('frictionOut').textContent=Number(frictionPicker.value).toFixed(1);});
canvas.addEventListener('pointerdown',event=>{
 pointerId=event.pointerId;pointerOrigin=[event.clientX,event.clientY];
 pointerCurrent=pointerOrigin.slice();canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
 if(pointerId!==event.pointerId)return;
 pointerCurrent=[event.clientX,event.clientY];
 touchG=[
  bounded((pointerCurrent[0]-pointerOrigin[0])*0.075,-8,8),
  bounded((pointerCurrent[1]-pointerOrigin[1])*0.075,-8,8)
 ];
});
function releasePointer(event){
 if(pointerId!==event.pointerId)return;
 pointerId=null;touchG=[0,0];pointerCurrent=null;
}
canvas.addEventListener('pointerup',releasePointer);
canvas.addEventListener('pointercancel',releasePointer);
const heldKeys=new Set();
document.addEventListener('keydown',event=>{
 const valid=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','d','w','s'];
 if(valid.includes(event.key)){event.preventDefault();heldKeys.add(event.key);}
});
document.addEventListener('keyup',event=>heldKeys.delete(event.key));
window.addEventListener('blur',()=>{heldKeys.clear();touchG=[0,0];});
function keyForce(){
 const x=Number(heldKeys.has('ArrowRight')||heldKeys.has('d'))-
         Number(heldKeys.has('ArrowLeft')||heldKeys.has('a'));
 const y=Number(heldKeys.has('ArrowUp')||heldKeys.has('w'))-
         Number(heldKeys.has('ArrowDown')||heldKeys.has('s'));
 return [x*6,y*6];
}
function updateForce(){
 const keyboard=keyForce();
 // World board y is upward; screen y is downward.
 const sx=sensor.gravity[0]+touchG[0]+keyboard[0];
 const sy=sensor.gravity[1]+touchG[1]-keyboard[1];
 screenG=[bounded(sx,-12,12),bounded(sy,-12,12)];
 return [screenG[0],-screenG[1]];
}
function fillUniforms(width,height){
 const data=new Float32Array(8+maximumBalls*8);
 data.set([width,height,halfW,halfH],0);
 data.set([performance.now()*0.001,activeCount,screenG[0],screenG[1]],4);
 for(let i=0;i<maximumBalls;i++){
  const ball=balls[i],beadOffset=8+i*4,spinOffset=8+maximumBalls*4+i*4;
  data.set([ball.x,ball.y,0,i<activeCount?ballRadius:0],beadOffset);
  data.set(ball.q,spinOffset);
 }
 gpuDevice.queue.writeBuffer(gpuUniform,0,data);
}
function recordError(error){
 const detail=String(error?.message||error);
 setPhase('error',{error:detail});
 document.documentElement.dataset.test='error';
 say('WebGPU ERROR: '+detail);console.error(error);
}
async function initGPU(){
 if(!navigator.gpu)throw Error('WebGPU 非対応。Safari / Chrome の対応版と HTTPS が必要です');
 setPhase('request-adapter');
 const adapter=await navigator.gpu.requestAdapter();
 if(!adapter)throw Error('WebGPU adapter を取得できません');
 setPhase('request-device');
 gpuDevice=await adapter.requestDevice();
 gpuDevice.lost.then(reason=>recordError(Error('GPU device lost: '+reason.message)));
 gpuDevice.addEventListener('uncapturederror',event=>recordError(event.error));
 gpuFormat=isCI?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
 if(!isCI){
  gpuContext=canvas.getContext('webgpu');
  if(!gpuContext)throw Error('WebGPU canvas を作成できません');
  gpuContext.configure({device:gpuDevice,format:gpuFormat,alphaMode:'opaque'});
 }
 setPhase('shader-compilation-info');
 const module=gpuDevice.createShaderModule({label:'Rolling refractive glass spheres',code:wgsl});
 const info=await module.getCompilationInfo();
 const errors=info.messages.filter(item=>item.type==='error');
 if(errors.length)throw Error('WGSL '+errors.map(e=>e.lineNum+':'+e.linePos+' '+e.message).join(' / '));
 setPhase('create-pipeline');
 gpuDevice.pushErrorScope('validation');
 gpuPipeline=await gpuDevice.createRenderPipelineAsync({
  layout:'auto',vertex:{module,entryPoint:'vertexMain'},
  fragment:{module,entryPoint:'fragmentMain',targets:[{format:gpuFormat}]},
  primitive:{topology:'triangle-list'}
 });
 gpuUniform=gpuDevice.createBuffer({size:(8+maximumBalls*8)*4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 gpuGroup=gpuDevice.createBindGroup({layout:gpuPipeline.getBindGroupLayout(0),
  entries:[{binding:0,resource:{buffer:gpuUniform}}]});
 const pipelineError=await gpuDevice.popErrorScope();
 if(pipelineError)throw Error('GPU validation '+pipelineError.message);
 setPhase('gpu-ready');
}
function encodeRender(width,height,target){
 fillUniforms(width,height);
 const encoder=gpuDevice.createCommandEncoder();
 const pass=encoder.beginRenderPass({colorAttachments:[{
  view:target,clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'
 }]});
 pass.setPipeline(gpuPipeline);pass.setBindGroup(0,gpuGroup);pass.draw(3);pass.end();
 return encoder;
}
function resize(){
 const cssWidth=Math.max(1,canvas.clientWidth),cssHeight=Math.max(1,canvas.clientHeight);
 layoutBounds(cssWidth,cssHeight);
 const dpr=Math.min(window.devicePixelRatio||1,1.3);
 const budget=activeCount>20?420000:720000;
 const density=Math.min(dpr,Math.sqrt(budget/(cssWidth*cssHeight)));
 const w=Math.max(1,Math.round(cssWidth*density)),h=Math.max(1,Math.round(cssHeight*density));
 if(renderWidth!==w||renderHeight!==h){canvas.width=w;canvas.height=h;renderWidth=w;renderHeight=h;}
}
function tick(time){
 if(!gpuDevice || isCI)return;
 const dt=lastTick?Math.min((time-lastTick)/1000,0.033):0.016;lastTick=time;
 const [gx,gy]=updateForce();
 if(running)stepPhysics(dt,gx,gy);
 resize();
 const encoder=encodeRender(renderWidth,renderHeight,gpuContext.getCurrentTexture().createView());
 gpuDevice.queue.submit([encoder.finish()]);
 frameCounter++;
 if(time-lastMeterTime>700){
  const fps=Math.round(frameCounter*1000/Math.max(1,time-lastMeterTime));
  meter.textContent=fps+' FPS · '+renderWidth+'×'+renderHeight;
  tiltReadout.textContent='X '+screenG[0].toFixed(1)+' / Y '+screenG[1].toFixed(1)+' m/s²';
  $('sensorStatus').textContent=sensor.received?'センサー受信中':sensor.active?'センサー待機':'ドラッグ / 矢印キーでも操作可能';
  setPhase('rendering',{fps,frames:frameCounter,source:sensor.received?'sensor':'touch-keyboard'});
  frameCounter=0;lastMeterTime=time;
 }
 requestAnimationFrame(tick);
}
try{
 await initGPU();
 if(isCI){
  await runGpuRegression({
   device:gpuDevice,format:gpuFormat,render:encodeRender,
   setCount:(count,w,h)=>{
    activeCount=count;countPicker.value=String(count);
    $('countOut').textContent=String(count);
    // The headless viewport may be different from the requested render aspect.
    resetBalls();layoutBounds(w,h);
   },
   move:stepPhysics,getBalls:()=>balls.slice(0,activeCount),
   getRadius:()=>ballRadius,getBounds:()=>[halfW,halfH],
   report:say
  });
 }
 else{say('準備完了。センサーを有効にするか、盤面をドラッグ');requestAnimationFrame(tick);}
}catch(error){recordError(error);}
