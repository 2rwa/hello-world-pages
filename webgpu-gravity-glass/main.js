import {wgsl} from './shader.js';

const $ = id => document.getElementById(id);
const canvas=$('view'), status=$('status'), meter=$('meter'), tiltReadout=$('tiltReadout');
const sensorButton=$('sensorButton'), countPicker=$('count'), frictionPicker=$('friction');
const isCI=new URLSearchParams(location.search).has('ci');
const ballRadius=0.65, maximumBalls=5, initialCount=3;
let halfW=3,halfH=5, gpuDevice, gpuContext, gpuPipeline, gpuGroup, gpuUniform, gpuFormat;
let running=true, renderWidth=0,renderHeight=0, lastTick=0,frameCounter=0,lastMeterTime=0;
let sensorActive=false,sensorReceived=false,sensorBaseline=null;
let sensorG=[0,0], touchG=[0,0], keysG=[0,0], screenG=[0,0];
let pointerId=null,pointerOrigin=null, pointerCurrent=null;
let activeCount=initialCount;
const balls=[];
window.__gravityGlass={phase:'script-start',source:'touch'};
function setPhase(phase, extra={}) {Object.assign(window.__gravityGlass,{phase,...extra});}
function say(message){status.textContent=message;}
function bounded(value,lo,hi){return Math.max(lo,Math.min(hi,value));}
function resetBalls(){
  balls.length=0;
  for(let i=0;i<maximumBalls;i++){
    const angle=2.399963*i,ring=i===0?0:0.91*Math.sqrt(i);
    balls.push({x:Math.cos(angle)*ring,y:Math.sin(angle)*ring,
      vx:0,vy:0,q:[0,0,0,1]});
  }
  screenG=[0,0]; touchG=[0,0]; keysG=[0,0];
}
resetBalls();
function layoutBounds(cssW,cssH){
  halfH=5.0;
  halfW=halfH*cssW/Math.max(1,cssH);
  // Keep balls completely on the board even on narrow portrait screens.
  for(const ball of balls){
    ball.x=bounded(ball.x,-Math.max(0,halfW-ballRadius-0.13),Math.max(0,halfW-ballRadius-0.13));
    ball.y=bounded(ball.y,-halfH+ballRadius+0.13,halfH-ballRadius-0.13);
  }
}
function mulQuat(a,b){
 return [
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
 ];
}
function stepPhysics(delta,gravityX,gravityY){
 const dt=bounded(delta,0,0.033),friction=Number(frictionPicker.value);
 for(let i=0;i<activeCount;i++){
  const ball=balls[i],oldX=ball.x,oldY=ball.y;
  ball.vx+=gravityX*dt*1.25;
  ball.vy+=gravityY*dt*1.25;
  const damp=Math.exp(-friction*dt);
  ball.vx*=damp;ball.vy*=damp;
  const speed=Math.hypot(ball.vx,ball.vy);
  if(speed>9){ball.vx*=9/speed;ball.vy*=9/speed;}
  ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
  const limitX=Math.max(0.015,halfW-ballRadius-0.15);
  const limitY=halfH-ballRadius-0.15;
  if(ball.x < -limitX){ball.x=-limitX;ball.vx=Math.abs(ball.vx)*0.67;}
  if(ball.x > limitX){ball.x=limitX;ball.vx=-Math.abs(ball.vx)*0.67;}
  if(ball.y < -limitY){ball.y=-limitY;ball.vy=Math.abs(ball.vy)*0.67;}
  if(ball.y > limitY){ball.y=limitY;ball.vy=-Math.abs(ball.vy)*0.67;}
  // Rolling angular motion: omega = normal cross velocity / radius.
  const dx=ball.x-oldX,dy=ball.y-oldY,move=Math.hypot(dx,dy);
  if(move>0.00001){
   const theta=move/ballRadius,angleHalf=theta*0.5;
   const rotation=[-dy/move*Math.sin(angleHalf),dx/move*Math.sin(angleHalf),
     0,Math.cos(angleHalf)];
   ball.q=mulQuat(rotation,ball.q);
   const magnitude=Math.hypot(...ball.q);
   ball.q=ball.q.map(v=>v/magnitude);
  }
 }
 // Equal-mass discs, positional correction and normal impulse.
 for(let i=0;i<activeCount;i++)for(let j=i+1;j<activeCount;j++){
  const a=balls[i],b=balls[j],dx=b.x-a.x,dy=b.y-a.y;
  const distance=Math.hypot(dx,dy);
  if(distance>=ballRadius*2)continue;
  const nx=distance>0.001?dx/distance:1,ny=distance>0.001?dy/distance:0;
  const overlap=ballRadius*2-distance;
  a.x-=nx*overlap*0.5;a.y-=ny*overlap*0.5;
  b.x+=nx*overlap*0.5;b.y+=ny*overlap*0.5;
  const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
  if(rel<0){
    const impulse=-(1+0.76)*rel*0.5;
    a.vx-=impulse*nx;a.vy-=impulse*ny;
    b.vx+=impulse*nx;b.vy+=impulse*ny;
  }
 }
}
function orientationAngle(){
 const angle=screen.orientation?.angle ?? window.orientation ?? 0;
 return ((Math.round(Number(angle)/90)*90)%360+360)%360;
}
function convertDeviceGravity(acc){
 // Device axes: x right, y toward phone top; board y is world-up.
 // Accelerometer points opposite down-slope; negate then rotate to viewport.
 const x=acc.x,y=acc.y;
 switch(orientationAngle()){
  case 90:return [-y,-x];
  case 180:return [x,-y];
  case 270:return [y,x];
  default:return [-x,y];
 }
}
function onMotion(event){
 const a=event.accelerationIncludingGravity;
 if(!a || !Number.isFinite(a.x) || !Number.isFinite(a.y))return;
 const rotated=convertDeviceGravity(a);
 if(!sensorBaseline)sensorBaseline=rotated.slice();
 const multiplier=$('reverse').checked?-1:1;
 const targetX=bounded((rotated[0]-sensorBaseline[0])*multiplier,-9.8,9.8);
 const targetY=bounded((rotated[1]-sensorBaseline[1])*multiplier,-9.8,9.8);
 sensorG[0]=sensorG[0]*0.78+targetX*0.22;
 sensorG[1]=sensorG[1]*0.78+targetY*0.22;
 sensorReceived=true;
}
sensorButton.addEventListener('click',async()=>{
 try{
  if(typeof DeviceMotionEvent==='undefined')throw Error('DeviceMotionEvent に非対応');
  if(typeof DeviceMotionEvent.requestPermission==='function'){
   const permitted=await DeviceMotionEvent.requestPermission();
   if(permitted!=='granted')throw Error('モーションセンサーの許可がありません');
  }
  if(!sensorActive){
   window.addEventListener('devicemotion',onMotion,{passive:true});
   sensorActive=true;
  }
  sensorBaseline=null;
  sensorReceived=false;
  sensorButton.textContent='センサー有効・再設定';
  say('センサー待機中… 端末を少し傾けてください');
  setTimeout(()=>{if(sensorActive&&!sensorReceived)say('センサーデータなし。端末の設定を確認するか、指でドラッグしてください。');},2200);
 }catch(error){
  say(String(error.message||error)+' ／ ドラッグ操作も使えます');
 }
});
$('recenter').addEventListener('click',()=>{
 sensorBaseline=null;sensorG=[0,0];say('現在の角度を水平基準にします');
});
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
 const sx=sensorG[0]+touchG[0]+keyboard[0];
 const sy=sensorG[1]+touchG[1]-keyboard[1];
 screenG=[bounded(sx,-12,12),bounded(sy,-12,12)];
 return [screenG[0],-screenG[1]];
}
function fillUniforms(width,height){
 const data=new Float32Array(48);
 data.set([width,height,halfW,halfH],0);
 data.set([performance.now()*0.001,activeCount,screenG[0],screenG[1]],4);
 for(let i=0;i<maximumBalls;i++){
  const ball=balls[i],beadOffset=8+i*4,spinOffset=28+i*4;
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
 gpuUniform=gpuDevice.createBuffer({size:192,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
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
 const density=Math.min(dpr,Math.sqrt(720000/(cssWidth*cssHeight)));
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
  $('sensorStatus').textContent=sensorReceived?'センサー受信中':sensorActive?'センサー待機':'ドラッグ / 矢印キーでも操作可能';
  setPhase('rendering',{fps,frames:frameCounter,source:sensorReceived?'sensor':'touch-keyboard'});
  frameCounter=0;lastMeterTime=time;
 }
 requestAnimationFrame(tick);
}
async function ciTest(){
 // Use the real render pipeline but avoid headless canvas swapchain failures.
 layoutBounds(256,360);
 const startX=balls[0].x;
 for(let i=0;i<80;i++)stepPhysics(0.016,4.5,0);
 if(!(balls[0].x>startX+0.15))throw Error('Gravity physics did not move the bead');
 const width=256,height=360,rowPitch=width*4;
 const target=gpuDevice.createTexture({size:[width,height],format:gpuFormat,
  usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 const pixels=gpuDevice.createBuffer({size:rowPitch*height,
  usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 gpuDevice.pushErrorScope('validation');
 const encoder=encodeRender(width,height,target.createView());
 encoder.copyTextureToBuffer({texture:target},{buffer:pixels,bytesPerRow:rowPitch},{width,height});
 gpuDevice.queue.submit([encoder.finish()]);
 await gpuDevice.queue.onSubmittedWorkDone();
 const validation=await gpuDevice.popErrorScope();
 if(validation)throw Error('Render validation: '+validation.message);
 await pixels.mapAsync(GPUMapMode.READ);
 const rgba=new Uint8Array(pixels.getMappedRange());
 let min=255,max=0,sampleCount=0;
 for(let y=12;y<height-12;y+=17)for(let x=12;x<width-12;x+=17){
  const idx=(y*width+x)*4;
  const luminosity=Math.round((rgba[idx]+rgba[idx+1]+rgba[idx+2])/3);
  min=Math.min(min,luminosity);max=Math.max(max,luminosity);sampleCount++;
 }
 pixels.unmap();pixels.destroy();target.destroy();
 if(max-min<24)throw Error('Rendered pixels are unexpectedly flat: '+min+'…'+max);
 window.__gravityGlass={phase:'ok',moved:balls[0].x-startX,pixelRange:[min,max],
  samples:sampleCount,rendered:[width,height]};
 document.documentElement.dataset.test='ok';
 say('CI OK: gravity motion + actual GPU pixels '+min+'–'+max);
}
try{
 await initGPU();
 if(isCI){await ciTest();}
 else{say('準備完了。センサーを有効にするか、盤面をドラッグ');requestAnimationFrame(tick);}
}catch(error){recordError(error);}
