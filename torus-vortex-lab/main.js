const canvas=document.querySelector('#scene');
const statusText=document.querySelector('#status');
const probeCanvas=document.querySelector('#probe');
const isCI=new URLSearchParams(location.search).has('ci');
const ids=['waterSpeed','smokeSpeed','twist','turbulence','waterLevel','smokeDensity','glass','glow','resolution','quality'];
const defaults=Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value]));
const setting=Object.fromEntries(ids.map(id=>[id,Number(defaults[id])]));
let isPaused=false,isAuto=true,currentTime=0,lastTick=0,azimuth=.39,elevation=.49,distance=4.25;
let gpuDevice,gpuContext,renderPipeline,uniformBuffer,bindGroup,renderFormat;
const uniformData=new Float32Array(20);
function status(message,error=false){
 statusText.textContent=message; statusText.classList.toggle('error',error);
 if(error) document.body.dataset.testStatus='error';
}
function displayValues(){
 for(const id of ids) document.getElementById('v-'+id).textContent=
  id==='quality'?String(setting[id]):setting[id].toFixed(id==='waterLevel'?2:1);
}
for(const id of ids)document.getElementById(id).addEventListener('input',event=>{
 setting[id]=Number(event.target.value);displayValues();
 if(isCI&&window.runTorusProbe)window.runTorusProbe().catch(error=>status(String(error),true));
});
displayValues();
if(window.matchMedia('(max-width: 640px)').matches)document.querySelector('#panel').open=false;
document.querySelector('#pause').addEventListener('click',event=>{
 isPaused=!isPaused;event.currentTarget.textContent=isPaused?'再生':'一時停止';
});
document.querySelector('#auto').addEventListener('click',event=>{
 isAuto=!isAuto;event.currentTarget.textContent='自動回転 '+(isAuto?'ON':'OFF');
});
document.querySelector('#reset').addEventListener('click',()=>{
 for(const id of ids){setting[id]=Number(defaults[id]);document.getElementById(id).value=defaults[id];}
 azimuth=.39;elevation=.49;distance=4.25;displayValues();
});
let dragInfo=null;
canvas.addEventListener('pointerdown',event=>{
 dragInfo={id:event.pointerId,x:event.clientX,y:event.clientY};
 canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
 if(!dragInfo||dragInfo.id!==event.pointerId)return;
 azimuth-=(event.clientX-dragInfo.x)*.007;
 elevation=Math.max(-1.35,Math.min(1.35,elevation+(event.clientY-dragInfo.y)*.006));
 dragInfo.x=event.clientX;dragInfo.y=event.clientY;
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])
 canvas.addEventListener(name,()=>{dragInfo=null});
canvas.addEventListener('wheel',event=>{
 event.preventDefault();distance=Math.min(7,Math.max(2.55,distance+Math.sign(event.deltaY)*.2));
},{passive:false});
function updateUniforms(width,height){
 uniformData.set([width,height,currentTime,setting.quality],0);
 uniformData.set([azimuth,elevation,distance,0],4);
 uniformData.set([setting.waterSpeed,setting.smokeSpeed,setting.twist,setting.turbulence],8);
 uniformData.set([setting.waterLevel,setting.smokeDensity,setting.glass,setting.glow],12);
 uniformData.set([0,0,0,0],16);
 gpuDevice.queue.writeBuffer(uniformBuffer,0,uniformData);
}
function setupCanvas(){
 const pixelRatio=Math.min(window.devicePixelRatio||1,1.5),scale=setting.resolution*pixelRatio;
 const width=Math.max(2,Math.min(1400,Math.round(canvas.clientWidth*scale)));
 const height=Math.max(2,Math.min(1200,Math.round(canvas.clientHeight*scale)));
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 return {width,height};
}
function encodeRender(targetView,width,height,encoder){
 updateUniforms(width,height);
 const pass=encoder.beginRenderPass({colorAttachments:[{
  view:targetView,loadOp:'clear',storeOp:'store',
  clearValue:{r:.01,g:.03,b:.04,a:1}
 }]});
 pass.setPipeline(renderPipeline);pass.setBindGroup(0,bindGroup);pass.draw(3);pass.end();
}
function normalFrame(){
 const {width,height}=setupCanvas();
 const encoder=gpuDevice.createCommandEncoder();
 encodeRender(gpuContext.getCurrentTexture().createView(),width,height,encoder);
 gpuDevice.queue.submit([encoder.finish()]);
}
async function runOffscreenProbe(){
 const width=128,height=96;
 const texture=gpuDevice.createTexture({size:[width,height],format:renderFormat,
  usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 const bytesPerRow=Math.ceil(width*4/256)*256;
 const readback=gpuDevice.createBuffer({size:bytesPerRow*height,
  usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 gpuDevice.pushErrorScope('validation');
 const encoder=gpuDevice.createCommandEncoder();
 encodeRender(texture.createView(),width,height,encoder);
 encoder.copyTextureToBuffer({texture},{buffer:readback,bytesPerRow,rowsPerImage:height},[width,height]);
 gpuDevice.queue.submit([encoder.finish()]);
 await gpuDevice.queue.onSubmittedWorkDone();
 const validation=await gpuDevice.popErrorScope();
 if(validation)throw Error('GPU validation: '+validation.message);
 await readback.mapAsync(GPUMapMode.READ);
 const mapped=new Uint8Array(readback.getMappedRange());
 const rgba=new Uint8ClampedArray(width*height*4);
 let checksum=2166136261,low=255,high=0;
 for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){
  const srcIndex=yy*bytesPerRow+xx*4,dstIndex=(yy*width+xx)*4;
  for(let k=0;k<4;k++)rgba[dstIndex+k]=mapped[srcIndex+(renderFormat==='bgra8unorm'&&k<3?2-k:k)];
  const lightness=Math.round((rgba[dstIndex]+rgba[dstIndex+1]+rgba[dstIndex+2])/3);
  low=Math.min(low,lightness);high=Math.max(high,lightness);
  checksum=Math.imul(checksum^lightness,16777619);
 }
 readback.unmap();readback.destroy();texture.destroy();
 if(high-low<12)throw Error('Offscreen image looks flat: range='+(high-low));
 probeCanvas.width=width;probeCanvas.height=height;
 probeCanvas.getContext('2d').putImageData(new ImageData(rgba,width,height),0,0);
 document.body.dataset.frameHash=(checksum>>>0).toString(16);
 document.body.dataset.frameRange=String(high-low);
 document.body.dataset.testStatus='ok';
 status('WebGPU OK · GPU draw / readback 完了 · range '+(high-low));
 return document.body.dataset.frameHash;
}
async function initialize(){
 document.body.dataset.testStatus='script-start';
 if(!navigator.gpu)throw Error('このブラウザは WebGPU に対応していません。Chrome / Safari の最新版をお試しください。');
 document.body.dataset.testStatus='request-adapter';
 const adapter=await navigator.gpu.requestAdapter();
 if(!adapter)throw Error('WebGPU アダプターを取得できません。');
 document.body.dataset.testStatus='request-device';
 gpuDevice=await adapter.requestDevice();
 gpuDevice.lost.then(info=>status('GPU device lost: '+info.reason+' '+info.message,true));
 gpuDevice.addEventListener('uncapturederror',event=>status('WebGPU error: '+event.error.message,true));
 renderFormat=navigator.gpu.getPreferredCanvasFormat();
 if(!isCI){
  gpuContext=canvas.getContext('webgpu');
  if(!gpuContext)throw Error('WebGPU canvas の生成に失敗しました。');
  gpuContext.configure({device:gpuDevice,format:renderFormat,alphaMode:'opaque'});
 }
 const response=await fetch('./shader.wgsl');
 if(!response.ok)throw Error('WGSL load failed: HTTP '+response.status);
 const shader=gpuDevice.createShaderModule({code:await response.text()});
 document.body.dataset.testStatus='shader-compilation-info';
 const info=await shader.getCompilationInfo();
 const errors=info.messages.filter(message=>message.type==='error');
 if(errors.length)throw Error(errors.map(message=>'WGSL '+message.lineNum+':'+message.linePos+' '+message.message).join('\n'));
 gpuDevice.pushErrorScope('validation');
 uniformBuffer=gpuDevice.createBuffer({size:uniformData.byteLength,
  usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 renderPipeline=await gpuDevice.createRenderPipelineAsync({
  layout:'auto',vertex:{module:shader,entryPoint:'vsMain'},
  fragment:{module:shader,entryPoint:'fsMain',targets:[{format:renderFormat}]},
  primitive:{topology:'triangle-list'}
 });
 bindGroup=gpuDevice.createBindGroup({layout:renderPipeline.getBindGroupLayout(0),
  entries:[{binding:0,resource:{buffer:uniformBuffer}}]});
 const pipelineError=await gpuDevice.popErrorScope();
 if(pipelineError)throw Error('WebGPU pipeline: '+pipelineError.message);
 document.body.dataset.testStatus='pipeline-ready';
 if(isCI){window.runTorusProbe=runOffscreenProbe;await runOffscreenProbe();return;}
 status('LIVE · 水と煙を描画中 · ドラッグで視点変更');
 document.body.dataset.testStatus='ok';
 function tick(timestamp){
  if(!isPaused&&lastTick){
   const delta=Math.min((timestamp-lastTick)/1000,.1);
   currentTime+=delta;if(isAuto&&!dragInfo)azimuth+=delta*.11;
  }
  lastTick=timestamp;normalFrame();requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
}
initialize().catch(error=>{console.error(error);status('ERROR: '+(error.message||String(error)),true)});
