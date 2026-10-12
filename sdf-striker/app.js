const element = id => document.getElementById(id);
const canvas = element('gpu-canvas');
const viewport = element('viewport');
const params = {turn:24,pitch:13,zoom:5.4,animate:1,quality:.7,steps:80,glow:1.4};
const query = new URLSearchParams(location.search);
const inCI = query.has('ci');
let playing = true, turnOffset = 0, startTime = performance.now(), frozenTime = 0;
let device, context, shaderModule, pipeline, paramBuffer, bindGroup, frameTarget, drawing = false;
let sceneWidth = 0, sceneHeight = 0, lostDevice = false;
window.__sdfState = {phase:'script-start', ok:false, errors:[], pixels:null};
function setStage(phase, description = '') {
  window.__sdfState.phase = phase;
  element('status').textContent = description || phase;
  document.body.dataset.gpuStage = phase;
}
function fail(error) {
  const message = error?.stack || error?.message || String(error);
  window.__sdfState.errors.push(message);
  window.__sdfState.phase = 'error';
  document.body.dataset.gpuStage = 'error';
  element('status').textContent = 'WebGPU エラー';
  element('error').textContent = message;
  console.error(error);
}
function refreshLabels() {
  for (const [key,value] of Object.entries(params)) {
    element(key).value = value;
    const suffix = key==='turn'||key==='pitch'?'°': key==='steps'?'回':key==='quality'?'×':'';
    element(key+'-label').textContent = value+suffix;
  }
}
refreshLabels();
for (const name of Object.keys(params)) {
  element(name).addEventListener('input', event => {
    params[name] = Number(event.target.value);
    element(name+'-label').textContent = String(params[name])+(name==='turn'||name==='pitch'?'°':name==='steps'?'回':name==='quality'?'×':'');
  });
}
element('pause').addEventListener('click',()=>{
  if(playing){frozenTime=(performance.now()-startTime)/1000;playing=false;}
  else{startTime=performance.now()-frozenTime*1000;playing=true;}
  element('pause').textContent=playing?'停止':'再開';
});
element('reset').addEventListener('click',()=>{
  Object.assign(params,{turn:24,pitch:13,zoom:5.4,animate:1,quality:.7,steps:80,glow:1.4});
  turnOffset=0;refreshLabels();
});
let pointerStart=null;
viewport.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY};viewport.setPointerCapture(event.pointerId);});
viewport.addEventListener('pointermove',event=>{
  if(!pointerStart) return;
  params.turn=Math.max(-180,Math.min(180,params.turn+(event.clientX-pointerStart.x)*.4));
  params.pitch=Math.max(-60,Math.min(60,params.pitch-(event.clientY-pointerStart.y)*.3));
  pointerStart={x:event.clientX,y:event.clientY};
  refreshLabels();
});
viewport.addEventListener('pointerup',()=>pointerStart=null);
viewport.addEventListener('pointercancel',()=>pointerStart=null);
viewport.addEventListener('wheel',event=>{
  event.preventDefault();params.zoom=Math.max(3.7,Math.min(9,params.zoom+event.deltaY*.004));
  params.zoom=Math.round(params.zoom*10)/10;refreshLabels();
},{passive:false});
function resize() {
  const factor=inCI?1:Math.min(window.devicePixelRatio||1,1.6)*params.quality;
  const rect=viewport.getBoundingClientRect();
  const width=inCI?320:Math.max(2,Math.round(rect.width*factor));
  const height=inCI?240:Math.max(2,Math.round(rect.height*factor));
  if(width===sceneWidth&&height===sceneHeight)return;
  sceneWidth=width;sceneHeight=height;
  canvas.width=width;canvas.height=height;
  if(frameTarget){frameTarget.destroy();frameTarget=null;}
  if(inCI&&device){frameTarget=device.createTexture({size:[width,height],format:navigator.gpu.getPreferredCanvasFormat(),usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});}
}
function uniforms() {
  const elapsed=playing?(performance.now()-startTime)/1000:frozenTime;
  return new Float32Array([elapsed,sceneWidth,sceneHeight,params.zoom,
    params.turn*Math.PI/180,params.pitch*Math.PI/180,params.animate,0,
    params.steps,params.glow,turnOffset,0]);
}
function encodeFrame(commandEncoder) {
  device.queue.writeBuffer(paramBuffer,0,uniforms());
  const outputTexture=inCI?frameTarget:context.getCurrentTexture();
  const pass=commandEncoder.beginRenderPass({colorAttachments:[{
    view:outputTexture.createView(),loadOp:'clear',storeOp:'store',
    clearValue:{r:0,g:0,b:0,a:1}}]});
  pass.setPipeline(pipeline);
  pass.setBindGroup(0,bindGroup);
  pass.draw(3);
  pass.end();
}
async function readback() {
  const byteRow=Math.ceil(sceneWidth*4/256)*256;
  const output=device.createBuffer({size:byteRow*sceneHeight,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const encoder=device.createCommandEncoder();
  encoder.copyTextureToBuffer({texture:frameTarget},{buffer:output,bytesPerRow:byteRow},[sceneWidth,sceneHeight]);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  await output.mapAsync(GPUMapMode.READ);
  const pixels=new Uint8Array(output.getMappedRange());
  function pixel(x,y){return Array.from(pixels.slice(y*byteRow+x*4,y*byteRow+x*4+4));}
  const corners=[pixel(2,2),pixel(sceneWidth-3,sceneHeight-3)];
  const center=pixel(Math.floor(sceneWidth/2),Math.floor(sceneHeight/2));
  const sample={center,corners,nonBlack:center.some(v=>v>8),different:corners.some(v=>v.some((channel,index)=>Math.abs(channel-center[index])>12))};
  output.unmap();output.destroy();
  window.__sdfState.pixels=sample;
  if(!sample.nonBlack||!sample.different)throw new Error('GPU readback is blank or model/background are indistinguishable: '+JSON.stringify(sample));
}
async function start() {
  if(!navigator.gpu)throw new Error('WebGPU非対応: HTTPSまたは対応ブラウザで開いてください');
  setStage('request-adapter');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw new Error('WebGPU adapter not found');
  setStage('request-device');
  device=await adapter.requestDevice();
  device.lost.then(info=>{lostDevice=true;fail(new Error('GPU device lost: '+info.reason+' '+info.message));});
  device.addEventListener('uncapturederror', event=>fail(event.error));
  const format=navigator.gpu.getPreferredCanvasFormat();
  if(!inCI){
    context=canvas.getContext('webgpu');
    if(!context)throw new Error('webgpu canvas context not available');
    context.configure({device,format,alphaMode:'opaque'});
  }
  resize();
  setStage('shader-compilation-info');
  const response=await fetch('./scene.wgsl',{cache:'no-store'});
  if(!response.ok)throw new Error('WGSL HTTP '+response.status);
  const source=await response.text();
  shaderModule=device.createShaderModule({label:'SDF Striker scene',code:source});
  const compilation=await shaderModule.getCompilationInfo();
  const errors=compilation.messages.filter(item=>item.type==='error');
  if(errors.length)throw new Error('WGSL: '+errors.map(item=>`${item.lineNum}:${item.linePos} ${item.message}`).join('\n'));
  setStage('create-pipeline');
  device.pushErrorScope('validation');
  pipeline=await device.createRenderPipelineAsync({
    label:'SDF fullscreen raymarch',layout:'auto',
    vertex:{module:shaderModule,entryPoint:'vertexMain'},
    fragment:{module:shaderModule,entryPoint:'fragmentMain',targets:[{format}]},
    primitive:{topology:'triangle-list'}
  });
  paramBuffer=device.createBuffer({label:'SDF camera controls',size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  bindGroup=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:paramBuffer}}]});
  setStage('submit');
  const encoder=device.createCommandEncoder();
  encodeFrame(encoder);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const validationError=await device.popErrorScope();
  if(validationError)throw validationError;
  if(inCI){
    setStage('readback');
    await readback();
    window.__sdfState.ok=true;
    setStage('ok','GPU 描画・readback OK');
    return;
  }
  window.__sdfState.ok=true;
  setStage('ok','WebGPU 描画中');
  function animateFrame(){
    if(lostDevice)return;
    if(!drawing){
      drawing=true;
      try { resize();const nextEncoder=device.createCommandEncoder();encodeFrame(nextEncoder);device.queue.submit([nextEncoder.finish()]); }
      catch(error){fail(error);return;}
      finally{drawing=false;}
    }
    requestAnimationFrame(animateFrame);
  }
  requestAnimationFrame(animateFrame);
}
start().catch(fail);
