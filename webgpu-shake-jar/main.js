import {wgsl} from './shader.js';
import {MAX_BALLS,JAR_RADIUS,marbleRadius,makeMarbles,integrate,shakeImpulse,measureEnergy} from './physics.js';
import {makeMotionSensor} from './sensor.js';
import {testOffscreen} from './regression.js';
const $=id=>document.getElementById(id);
const canvas=$('scene'),fpsDisplay=$('fps'),status=$('status');
const countInput=$('count'),sensitivity=$('sensitivity'),friction=$('friction');
const ci=new URLSearchParams(location.search).has('ci');
const app={phase:'script-start',activeCount:24,sensorReceived:false,frames:0};
window.__shakeLab=app;
let device,pipeline,uniform,bindGroup,context,format;
let balls=makeMarbles(24),ballRadius=marbleRadius(24);
let halfW=4.65,halfH=4.65,width=0,height=0,started=0,frames=0,running=true;
let viewOffset=[0,0],viewVelocity=[0,0],manualEnergy=0,lastIntensity=0;
const motion=makeMotionSensor(message=>{status.textContent=message;});
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
function resetBalls(){
 const count=Number(countInput.value);
 balls=makeMarbles(count);ballRadius=marbleRadius(count);
 app.activeCount=count;app.radius=ballRadius;
 viewOffset=[0,0];viewVelocity=[0,0];manualEnergy=0;
 $('countValue').textContent=String(count);
}
resetBalls();
countInput.addEventListener('input',resetBalls);
for(const name of ['sensitivity','friction']){
 const control=$(name);
 control.addEventListener('input',()=>{$(name+'Value').textContent=Number(control.value).toFixed(1);});
}
$('enable').addEventListener('click',async()=>{
 try{
  await motion.activate();
  $('enable').textContent='センサー有効・再接続';
 }catch(error){status.textContent=String(error.message||error);}
});
function triggerShake(){
 shakeImpulse(balls,1.15*Number(sensitivity.value));
 manualEnergy=16;app.shakes=(app.shakes||0)+1;
 status.textContent='シェイク！ 容器の中で衝突中';
}
$('shake').addEventListener('click',triggerShake);
$('reset').addEventListener('click',()=>{resetBalls();status.textContent='ビー玉を元に戻しました';});
$('pause').addEventListener('click',()=>{
 running=!running;$('pause').textContent=running?'一時停止':'再開';
});
let dragging=false,lastPointer=null,lastPointerTime=0;
canvas.addEventListener('pointerdown',event=>{
 dragging=true;lastPointer=[event.clientX,event.clientY];lastPointerTime=performance.now();
 canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
 if(!dragging)return;
 const now=performance.now();
 const stepMs=Math.max(8,now-lastPointerTime);
 const dx=event.clientX-lastPointer[0],dy=event.clientY-lastPointer[1];
 const scale=Number(sensitivity.value);
 const pxToWorld=2*halfW/Math.max(1,canvas.clientWidth);
 // Impulses are proportional to the jar displacement and opposed to it.
 const kickX=-dx*pxToWorld*5.1*scale;
 const kickY=dy*pxToWorld*5.1*scale;
 const rate=Math.min(2.2,16/stepMs);
 for(const b of balls){
  b.vx+=kickX*rate;b.vy+=kickY*rate;
 }
 manualEnergy=Math.min(40,manualEnergy+Math.hypot(dx,dy)*0.17);
 viewVelocity[0]+=dx*pxToWorld*0.22;
 viewVelocity[1]-=dy*pxToWorld*0.22;
 lastPointer=[event.clientX,event.clientY];lastPointerTime=now;
});
function endDrag(){dragging=false;lastPointer=null;}
canvas.addEventListener('pointerup',endDrag);
canvas.addEventListener('pointercancel',endDrag);
canvas.addEventListener('lostpointercapture',endDrag);
window.addEventListener('blur',endDrag);
const held=new Set();
document.addEventListener('keydown',e=>{
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)){
  e.preventDefault();held.add(e.key);
  if(e.key===' '&&!e.repeat)triggerShake();
 }
});
document.addEventListener('keyup',e=>held.delete(e.key));
function setPhase(phase,extra={}){Object.assign(app,{phase,...extra});}
function reportError(error){
 const message=String(error?.message||error);
 console.error(error);setPhase('error',{error:message});
 document.documentElement.dataset.test='error';
 status.textContent='ERROR: '+message;
}
function resize(targetW,targetH){
 // Circular jar fills roughly 80% of the shorter screen dimension.
 if(targetW<targetH){halfW=4.65;halfH=4.65*targetH/targetW;}
 else{halfH=4.65;halfW=4.65*targetW/targetH;}
}
async function initGPU(){
 if(!navigator.gpu)throw Error('WebGPU が使えません。Safari / Chrome の対応版を利用してください');
 setPhase('request-adapter');
 const adapter=await navigator.gpu.requestAdapter();
 if(!adapter)throw Error('GPU アダプターがありません');
 setPhase('request-device');
 device=await adapter.requestDevice();
 device.lost.then(info=>reportError(Error('GPU lost: '+info.message)));
 device.addEventListener('uncapturederror',event=>reportError(event.error));
 format=ci?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
 if(!ci){
  context=canvas.getContext('webgpu');
  context.configure({device,format,alphaMode:'opaque'});
 }
 setPhase('shader-compilation-info');
 const shader=device.createShaderModule({label:'Shaking transparent glass jar and marbles',code:wgsl});
 const info=await shader.getCompilationInfo();
 const errors=info.messages.filter(m=>m.type==='error');
 if(errors.length)throw Error('WGSL '+errors.map(m=>m.lineNum+':'+m.linePos+' '+m.message).join(' | '));
 setPhase('create-pipeline');
 device.pushErrorScope('validation');
 pipeline=await device.createRenderPipelineAsync({
  layout:'auto',vertex:{module:shader,entryPoint:'vertexMain'},
  fragment:{module:shader,entryPoint:'fragmentMain',targets:[{format}]},
  primitive:{topology:'triangle-list'}
 });
 uniform=device.createBuffer({size:1648,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 bindGroup=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),
  entries:[{binding:0,resource:{buffer:uniform}}]});
 const invalid=await device.popErrorScope();
 if(invalid)throw Error(invalid.message);
 setPhase('gpu-ready');
}
function packUniform(w,h){
 const data=new Float32Array(412);
 data.set([w,h,halfW,halfH],0);
 data.set([viewOffset[0],viewOffset[1],JAR_RADIUS,balls.length],4);
 data.set([performance.now()*0.001,ballRadius,lastIntensity,0],8);
 for(let i=0;i<MAX_BALLS;i++){
  const b=balls[i];
  if(b){
   data.set([b.x,b.y,b.z,ballRadius],12+4*i);
   data.set(b.q,12+MAX_BALLS*4+i*4);
  }else{
   data.set([0,0,0,0],12+4*i);
   data.set([0,0,0,1],12+MAX_BALLS*4+i*4);
  }
 }
 device.queue.writeBuffer(uniform,0,data);
}
function draw(w,h,target){
 packUniform(w,h);
 const encoder=device.createCommandEncoder();
 const pass=encoder.beginRenderPass({colorAttachments:[{
  view:target,loadOp:'clear',clearValue:{r:0,g:0,b:0,a:1},storeOp:'store'
 }]});
 pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.draw(3);pass.end();
 return encoder;
}
function updatePhysics(dt){
 const sensed=motion.sample(dt);
 const scale=Number(sensitivity.value);
 // Accelerometer reports the jar's acceleration; marbles feel the opposite.
 const fx=clamp(sensed[0]*scale,-55,55);
 const fy=clamp(sensed[1]*scale,-55,55);
 const fz=clamp(sensed[2]*scale,-45,45);
 const arrowX=Number(held.has('ArrowRight'))-Number(held.has('ArrowLeft'));
 const arrowY=Number(held.has('ArrowUp'))-Number(held.has('ArrowDown'));
 if(running){
  // Substeps cap tunneling during intense shakes and keep wall collisions robust.
  for(let i=0;i<2;i++)integrate(balls,ballRadius,dt*0.5,
   [fx-arrowX*19,fy-arrowY*19,fz],Number(friction.value));
 }
 viewVelocity[0]+=(-viewOffset[0]*35-viewVelocity[0]*9)*dt;
 viewVelocity[1]+=(-viewOffset[1]*35-viewVelocity[1]*9)*dt;
 viewOffset[0]=clamp(viewOffset[0]+viewVelocity[0]*dt,-0.32,0.32);
 viewOffset[1]=clamp(viewOffset[1]+viewVelocity[1]*dt,-0.32,0.32);
 manualEnergy*=Math.exp(-4.4*dt);
 lastIntensity=Math.max(motion.intensity,manualEnergy);
 app.energy=measureEnergy(balls);app.sensorReceived=motion.received;
}
function resizeCanvas(){
 const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
 resize(w,h);
 const budget=balls.length>30?340000:560000;
 const scale=Math.min(window.devicePixelRatio||1,1.4,Math.sqrt(budget/(w*h)));
 const pxW=Math.max(1,Math.floor(w*scale)),pxH=Math.max(1,Math.floor(h*scale));
 if(width!==pxW||height!==pxH){canvas.width=pxW;canvas.height=pxH;width=pxW;height=pxH;}
}
function frame(now){
 if(app.phase==='error')return;
 const dt=started?Math.min(.032,(now-started)/1000):.016;started=now;
 updatePhysics(dt);resizeCanvas();
 device.queue.submit([draw(width,height,context.getCurrentTexture().createView()).finish()]);
 frames++;
 if(frames%18===0){
  fpsDisplay.textContent=(1/Math.max(0.001,dt)).toFixed(0)+' FPS · '+balls.length+' balls';
  $('energy').textContent=app.energy.toFixed(1);
  $('activityFill').style.width=clamp((lastIntensity/24)*100,0,100)+'%';
  if(motion.received&&status.textContent.startsWith('センサー待機中'))
   status.textContent='センサー受信中 ('+motion.method+')';
  setPhase('rendering',{frames,activeCount:balls.length});
 }
 requestAnimationFrame(frame);
}

try{
 await initGPU();
 if(ci)await testOffscreen({device,resize,draw,format,balls,ballRadius,
  friction,motion,setPhase,status,
  setCount:n=>{countInput.value=String(n);resetBalls();},
  getBalls:()=>balls,getRadius:()=>ballRadius});
 else{status.textContent='準備完了。スマホを振る / ドラッグ / シェイク！';
  requestAnimationFrame(frame);}
}catch(error){reportError(error);}
