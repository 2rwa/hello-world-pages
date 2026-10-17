import {fftSource} from '../webgpu-fft-ocean-v3/fft.wgsl.js';
import {glassWGSL} from './glass.wgsl.js';
import {floatingBallsComputeWGSL} from './balls.wgsl.js';
const BU=GPUBufferUsage,TU=GPUTextureUsage,ST=GPUShaderStage;
export async function createEngine(canvas,resolution,ci,report){
 if(!navigator.gpu)throw Error('WebGPU非対応です。HTTPSと対応ブラウザを確認してください。');
 report('request-adapter');
 const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter)throw Error('GPU adapterが見つかりません');
 if(adapter.limits.maxComputeInvocationsPerWorkgroup<256||adapter.limits.maxComputeWorkgroupStorageSize<resolution*24)
  throw Error('FFT workgroup limits exceeded');
 report('request-device');
 const device=await adapter.requestDevice();
 device.lost.then(e=>report('DEVICE LOST '+e.reason+' '+e.message));
 device.addEventListener('uncapturederror',e=>report('GPU ERROR '+e.error.message));
 const format=ci?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
 const context=ci?null:canvas.getContext('webgpu');
 if(context)context.configure({device,format,alphaMode:'opaque'});
 const uniform=device.createBuffer({size:144,usage:BU.UNIFORM|BU.COPY_DST});
 const ballOptions=device.createBuffer({size:16,usage:BU.UNIFORM|BU.COPY_DST});
 const balls=device.createBuffer({size:1600,usage:BU.STORAGE|BU.COPY_SRC});
 const ballRead=ci?device.createBuffer({size:1600,usage:BU.COPY_DST|BU.MAP_READ}):null;
 const storageSize=resolution*resolution*5*24;
 const frequency=device.createBuffer({size:storageSize,usage:BU.STORAGE});
 const rowData=device.createBuffer({size:storageSize,usage:BU.STORAGE});
 const displacement=device.createTexture({size:[resolution,resolution,5],format:'rgba16float',usage:TU.STORAGE_BINDING|TU.TEXTURE_BINDING});
 const dispView=displacement.createView({dimension:'2d-array'});
 const sampler=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'repeat',addressModeV:'repeat'});
 const fftLayout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:ST.COMPUTE,buffer:{type:'uniform'}},
  {binding:1,visibility:ST.COMPUTE,buffer:{type:'storage'}},
  {binding:2,visibility:ST.COMPUTE,buffer:{type:'storage'}},
  {binding:3,visibility:ST.COMPUTE,storageTexture:{access:'write-only',format:'rgba16float',viewDimension:'2d-array'}}
 ]});
 const renderLayout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:ST.FRAGMENT,buffer:{type:'uniform'}},
  {binding:1,visibility:ST.FRAGMENT,texture:{viewDimension:'2d-array'}},
  {binding:2,visibility:ST.FRAGMENT,sampler:{type:'filtering'}},
  {binding:3,visibility:ST.FRAGMENT,buffer:{type:'read-only-storage'}},
  {binding:4,visibility:ST.FRAGMENT,buffer:{type:'uniform'}}
 ]});
 const placementLayout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:ST.COMPUTE,buffer:{type:'uniform'}},
  {binding:1,visibility:ST.COMPUTE,texture:{viewDimension:'2d-array'}},
  {binding:2,visibility:ST.COMPUTE,sampler:{type:'filtering'}},
  {binding:3,visibility:ST.COMPUTE,buffer:{type:'storage'}},
  {binding:4,visibility:ST.COMPUTE,buffer:{type:'uniform'}}
 ]});
 const fftGroup=device.createBindGroup({layout:fftLayout,entries:[
  {binding:0,resource:{buffer:uniform}},{binding:1,resource:{buffer:frequency}},
  {binding:2,resource:{buffer:rowData}},{binding:3,resource:dispView}
 ]});
 const renderGroup=device.createBindGroup({layout:renderLayout,entries:[
  {binding:0,resource:{buffer:uniform}},{binding:1,resource:dispView},
  {binding:2,resource:sampler},{binding:3,resource:{buffer:balls}},
  {binding:4,resource:{buffer:ballOptions}}
 ]});
 const placementGroup=device.createBindGroup({layout:placementLayout,entries:[
  {binding:0,resource:{buffer:uniform}},{binding:1,resource:dispView},
  {binding:2,resource:sampler},{binding:3,resource:{buffer:balls}},
  {binding:4,resource:{buffer:ballOptions}}
 ]});
 report('shader-compilation-info');
 async function shader(source,label){
  const mod=device.createShaderModule({label,code:source});
  const info=await mod.getCompilationInfo();
  const errors=info.messages.filter(m=>m.type==='error');
  if(errors.length)throw Error(label+' WGSL '+errors.map(e=>e.lineNum+':'+e.linePos+' '+e.message).join(' | '));
  return mod;
 }
 const [fftShader,oceanShader,ballsShader]=await Promise.all([
  shader(fftSource(resolution),'FFT'),shader(glassWGSL,'Floating glass spheres + curved FFT ocean'),
  shader(floatingBallsComputeWGSL,'FFT sampled sphere positions')]);
 report('create-pipeline');
 const fftPipeLayout=device.createPipelineLayout({bindGroupLayouts:[fftLayout]});
 const renderPipeLayout=device.createPipelineLayout({bindGroupLayouts:[renderLayout]});
 const placementPipeLayout=device.createPipelineLayout({bindGroupLayouts:[placementLayout]});
 const [evolve,fftRows,fftColumns,positionPipe,renderPipe]=await Promise.all([
  device.createComputePipelineAsync({layout:fftPipeLayout,compute:{module:fftShader,entryPoint:'evolve'}}),
  device.createComputePipelineAsync({layout:fftPipeLayout,compute:{module:fftShader,entryPoint:'fftRows'}}),
  device.createComputePipelineAsync({layout:fftPipeLayout,compute:{module:fftShader,entryPoint:'fftColumns'}}),
  device.createComputePipelineAsync({layout:placementPipeLayout,compute:{module:ballsShader,entryPoint:'updateBalls'}}),
  device.createRenderPipelineAsync({layout:renderPipeLayout,vertex:{module:oceanShader,entryPoint:'mainVertex'},
   fragment:{module:oceanShader,entryPoint:'mainFragment',targets:[{format}]},
   primitive:{topology:'triangle-list'}})
 ]);
 let offscreen=null,readback=null,lastW=0,lastH=0,readPitch=0;
 function resize(w,h){
  if(lastW===w&&lastH===h)return;
  lastW=w;lastH=h;
  offscreen?.destroy();readback?.destroy();
  if(ci){
   offscreen=device.createTexture({size:[w,h],format,usage:TU.RENDER_ATTACHMENT|TU.COPY_SRC});
   readPitch=Math.ceil(w*4/256)*256;
   readback=device.createBuffer({size:readPitch*h,usage:BU.MAP_READ|BU.COPY_DST});
  }else{
   canvas.width=w;canvas.height=h;
  }
 }
 function dispatch(encoder,pipeline,x,y=1,z=1){
  const pass=encoder.beginComputePass();
  pass.setPipeline(pipeline);pass.setBindGroup(0,fftGroup);
  pass.dispatchWorkgroups(x,y,z);pass.end();
 }
 async function render(values,w,h,settings={}){
  resize(w,h);
  device.queue.writeBuffer(uniform,0,values);
  const count=Math.max(1,Math.min(100,Math.round(settings.count??1)));
  const bounces=Math.max(1,Math.min(8,Math.round(settings.bounces??2)));
  device.queue.writeBuffer(ballOptions,0,new Float32Array([
   count,bounces,settings.spread??32,settings.drift??1
  ]));
  const encoder=device.createCommandEncoder();
  report('FFT-dispatch');
  dispatch(encoder,evolve,resolution/8,resolution/8,5);
  dispatch(encoder,fftRows,1,resolution,5);
  dispatch(encoder,fftColumns,1,resolution,5);
  report('fft-buoyancy-compute');
  const placement=encoder.beginComputePass();
  placement.setPipeline(positionPipe);placement.setBindGroup(0,placementGroup);
  placement.dispatchWorkgroups(Math.ceil(count/64));placement.end();
  report('raymarch-render');
  const pass=encoder.beginRenderPass({colorAttachments:[{
   view:ci?offscreen.createView():context.getCurrentTexture().createView(),
   clearValue:{r:0.06,g:0.16,b:0.24,a:1},loadOp:'clear',storeOp:'store'
  }]});
  pass.setPipeline(renderPipe);pass.setBindGroup(0,renderGroup);pass.draw(3);pass.end();
  if(ci){
   encoder.copyTextureToBuffer({texture:offscreen},{buffer:readback,bytesPerRow:readPitch},{width:w,height:h});
   encoder.copyBufferToBuffer(balls,0,ballRead,0,count*16);
  }
  device.pushErrorScope('validation');
  device.queue.submit([encoder.finish()]);
  if(!ci){
   const err=await device.popErrorScope();
   if(err)throw Error('WebGPU validation: '+err.message);
   return null;
  }
  report('submitted-work-wait');
  await device.queue.onSubmittedWorkDone();
  const err=await device.popErrorScope();
  if(err)throw Error('WebGPU validation: '+err.message);
  await ballRead.mapAsync(GPUMapMode.READ);
  const spherePos=Array.from(new Float32Array(ballRead.getMappedRange().slice(0,count*16)));
  ballRead.unmap();
  await readback.mapAsync(GPUMapMode.READ);
  const data=new Uint8Array(readback.getMappedRange());
  const pixels=new Uint8ClampedArray(w*h*4);
  for(let row=0;row<h;row++)pixels.set(data.subarray(row*readPitch,row*readPitch+w*4),row*w*4);
  readback.unmap();
  const loc=(y)=>(Math.floor(h*y)*w+Math.floor(w/2))*4;
  const sky=Array.from(pixels.slice(loc(.1),loc(.1)+4));
  const water=Array.from(pixels.slice(loc(.85),loc(.85)+4));
  let visible=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i]>3||pixels[i+1]>3||pixels[i+2]>3)visible++;
  if(sky.join()===water.join())throw Error('Sky and water pixels have no contrast');
  if(visible<w*h*.8)throw Error('Offscreen render mostly blank');
  canvas.width=w;canvas.height=h;
  canvas.getContext('2d').putImageData(new ImageData(pixels,w,h),0,0);
  return {sky,water,visible,resolution,cascades:5,count,bounces,positions:spherePos};
 }
 return {render};
}
