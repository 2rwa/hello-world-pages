import {resetBodies,simulateBodies} from "./physics.mjs";
const canvas = document.getElementById('view');
const $ = id => document.getElementById(id);
const ciMode = new URLSearchParams(location.search).has('ci');
const MAX = 80, UNIFORM_FLOATS = 12 + MAX * 8;
const data = new Float32Array(UNIFORM_FLOATS);
const palette = [
  [1.0, .34, .30], [1.0, .70, .34], [.73, .44, 1.0],
  [.29, .85, .84], [1.0, .40, .66], [.52, .67, 1.0],
  [1.0, .79, .43], [.72, .97, .68], [1.0, .53, .35], [.49, .89, 1.0]
];
let bodies = [], frozen = false, yaw = .32, pitch = .18, zoom = 1.0;
let gpu, device, context, pipeline, bindGroup, uniformBuffer, outputTexture;
let frame = 0, tick = performance.now(), accum = 0, frames = 0, lastFps = tick;
let settings = {speed: 1, blend: .32, glass: 24, opaque: 7, quality: .58};
const mark = (step, detail='') => { window.__testState={step,detail}; document.body.dataset.testStep=step; };
const fail = err => { const msg=String(err?.stack || err); $('status').style.display='block'; $('status').textContent='WebGPU error: '+msg; mark('failed',msg); console.error(err); };
function reset(){
  bodies=resetBodies(settings,palette);
  $('actual').textContent=`${bodies.filter(b=>b.glass).length} / ${settings.glass}`;
}
const simulate=(dt)=>simulateBodies(bodies,dt,settings.blend);
function setUniforms(w,h,seconds){
  data.fill(0);
  data.set([w,h,seconds,frame],0);
  data.set([yaw,pitch,zoom,2.51],4);
  data.set([settings.blend,bodies.length,0,0],8);
  bodies.forEach((b,i)=>{
    data.set([...b.pos,b.radius],12+i*4);
    data.set([...b.color,b.glass?1:0],12+MAX*4+i*4);
  });
  device.queue.writeBuffer(uniformBuffer,0,data);
}
function makeOutput(w,h){
  if(outputTexture)outputTexture.destroy();
  const format = ciMode?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
  if(ciMode){
    outputTexture=device.createTexture({size:[w,h],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  }else{
    canvas.width=w;canvas.height=h;
    context.configure({device,format,alphaMode:'opaque'});
  }
  return format;
}
function makePipeline(shader,format){
  pipeline=device.createRenderPipeline({layout:'auto',vertex:{module:shader,entryPoint:'vs'},fragment:{module:shader,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}});
  bindGroup=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniformBuffer}}]});
}
function viewport(){
  if(ciMode)return [160,160];
  const dpr=Math.min(devicePixelRatio||1,1.75),q=settings.quality;
  return [Math.max(2,Math.round(innerWidth*dpr*q/2)*2),Math.max(2,Math.round(innerHeight*dpr*q/2)*2)];
}
function draw(w,h){
  const encoder=device.createCommandEncoder();
  const view=(ciMode?outputTexture:context.getCurrentTexture()).createView();
  const pass=encoder.beginRenderPass({colorAttachments:[{view,loadOp:'clear',storeOp:'store',clearValue:{r:.02,g:.035,b:.065,a:1}}]});
  pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.draw(3);pass.end();
  device.queue.submit([encoder.finish()]);
}
function addEvents(){
  for(const [id,key] of [['speed','speed'],['blend','blend'],['glass','glass'],['opaque','opaque'],['quality','quality']]){
    $(id).addEventListener(id==='quality'?'change':'input',e=>{
      const v=Number(e.target.value);settings[key]=v;
      if(id==='speed')$('speedOut').textContent=v.toFixed(1)+'×';
      if(id==='blend')$('blendOut').textContent=v.toFixed(2);
      if(id==='glass'){$('glassOut').textContent=v;reset();}
      if(id==='opaque'){$('opaqueOut').textContent=v;reset();}
      if(id==='quality'){resize();}
    });
  }
  $('toggle').onclick=()=>{frozen=!frozen;$('toggle').textContent=frozen?'▶ 再開':'Ⅱ 一時停止';};
  $('reset').onclick=reset;
  let pointer=null;
  canvas.addEventListener('pointerdown',e=>{pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;
    yaw+=(e.clientX-pointer.x)*.006;pitch=Math.max(-1.2,Math.min(1.2,pitch+(pointer.y-e.clientY)*.006));pointer.x=e.clientX;pointer.y=e.clientY;});
  canvas.addEventListener('pointerup',()=>{pointer=null;});
  canvas.addEventListener('pointercancel',()=>{pointer=null;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.72,Math.min(1.8,zoom*Math.exp(e.deltaY*.0008)));},{passive:false});
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{tick=performance.now();accum=0;});
}
function resize(){
  if(!device||ciMode)return;
  const [w,h]=viewport();if(canvas.width===w&&canvas.height===h)return;
  makeOutput(w,h);
}
async function verifyPixels(w,h){
  const rowBytes=Math.ceil(w*4/256)*256;
  const buffer=device.createBuffer({size:rowBytes*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture:outputTexture},{buffer,bytesPerRow:rowBytes},{width:w,height:h});
  device.queue.submit([enc.finish()]);await device.queue.onSubmittedWorkDone();
  await buffer.mapAsync(GPUMapMode.READ);
  const bytes=new Uint8Array(buffer.getMappedRange());
  const sample=(x,y)=>Array.from(bytes.slice(y*rowBytes+x*4,y*rowBytes+x*4+3));
  let samples=[sample(w>>1,h>>1),sample(w>>2,h>>2),sample(w-8,h-8)];
  const pixelSpread=Math.max(...samples.flat())-Math.min(...samples.flat());
  let checksum=0;for(let k=0;k<bytes.length;k+=41)checksum=(checksum+bytes[k]*(k+1))%1000000007;
  buffer.unmap();buffer.destroy();
  if(pixelSpread<12)throw Error('GPU rendered nearly uniform pixels '+JSON.stringify(samples));
  return {samples,pixelSpread,checksum};
}
async function start(){
  try{
    mark('script-start');
    if(!navigator.gpu)throw Error('WebGPUが利用できません。Chrome / Safari の対応版でHTTPSから開いてください。');
    mark('request-adapter');const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter)throw Error('WebGPU adapter unavailable');
    mark('request-device');device=await adapter.requestDevice();gpu=adapter;
    device.lost.then(info=>{if(info.reason!=='destroyed')fail(Error('GPU device lost '+info.reason+' '+info.message));});
    device.addEventListener('uncapturederror',event=>fail(event.error));
    const shaderText=(await Promise.all(['shader.wgsl','shader-render.wgsl'].map(async file=>{const response=await fetch(file);if(!response.ok)throw Error('Shader fetch '+file+' '+response.status);return response.text();}))).join('\n');
    const shader=device.createShaderModule({code:shaderText});
    mark('shader-compilation-info');const info=await shader.getCompilationInfo();
    const errors=info.messages.filter(x=>x.type==='error');
    if(errors.length)throw Error(errors.map(x=>`${x.lineNum}:${x.linePos} ${x.message}`).join('\n'));
    device.pushErrorScope('validation');
    uniformBuffer=device.createBuffer({size:UNIFORM_FLOATS*4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    reset();
    if(!ciMode)context=canvas.getContext('webgpu');
    const [w,h]=viewport();
    const format=makeOutput(w,h);
    mark('create-pipeline');makePipeline(shader,format);
    addEvents();
    mark('validation-scope');setUniforms(w,h,0);
    draw(w,h);mark('submitted-work-wait');await device.queue.onSubmittedWorkDone();
    const validation=await device.popErrorScope();if(validation)throw Error(validation.message);
    let details={};if(ciMode)details=await verifyPixels(w,h);
    mark('ok',JSON.stringify(details));
    $('fps').textContent=ciMode?'WEBGPU TEST OK':'WEBGPU RENDERING';
    if(!ciMode)requestAnimationFrame(animate);
  }catch(err){fail(err);}
}
function animate(now){
  let dt=Math.min(.04,(now-tick)/1000);tick=now;
  if(!frozen){accum=Math.min(.12,accum+dt*settings.speed);let loops=0;
    while(accum>=1/120&&loops++<16){simulate(1/120);accum-=1/120;}}
  const w=canvas.width,h=canvas.height;
  if(w&&h){setUniforms(w,h,now*.001);draw(w,h);frame++;}
  frames++;if(now-lastFps>1000){$('fps').textContent=`${Math.round(frames*1000/(now-lastFps))} FPS · ${w} × ${h}`;frames=0;lastFps=now;}
  requestAnimationFrame(animate);
}
window.__simDebug={get bodies(){return bodies.map(b=>({pos:[...b.pos],radius:b.radius,glass:b.glass}));},simulate,reset,configure(v){Object.assign(settings,v);reset();},get settings(){return {...settings};}};
window.__ciDraw=async()=>{
  if(!ciMode || !device)throw Error('Only for offscreen test');
  const [w,h]=viewport();setUniforms(w,h,0);draw(w,h);
  await device.queue.onSubmittedWorkDone();return verifyPixels(w,h);
};
start();
