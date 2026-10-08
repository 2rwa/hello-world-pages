import { shader } from './shaders.js';
import { settings, state, clamp, makeData, getCamera } from './scene.js';
const $ = id => document.getElementById(id);
const canvas = $('screen');
function makeBuffer(device,data,usage){const b=device.createBuffer({size:Math.max(4,data.byteLength),usage});device.queue.writeBuffer(b,0,data);return b;}
let device,context,format,pipeline,uniformBuffer,bindGroup,splatsBuffer,orderBuffer,positions,rawData,order,depths,activeCount=0,offscreenTex;
const TEST=location.search.includes('ci=1');
const testLog=[];function step(s){testLog.push(s);document.documentElement.dataset.gpuStage=s;}
function resetCamera(){state.yaw=.12;state.pitch=.18;state.distance=9.4;state.dirty=true;}
function rebuild(){
 const data=makeData(settings.count,settings.scene,state.seed);rawData=data.raw;positions=data.positions;activeCount=settings.count;
 splatsBuffer?.destroy();orderBuffer?.destroy();
 splatsBuffer=makeBuffer(device,rawData,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
 order=new Uint32Array(activeCount);depths=new Float32Array(activeCount);
 for(let i=0;i<activeCount;i++)order[i]=i;
 orderBuffer=makeBuffer(device,order,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
 bindGroup=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
  {binding:0,resource:{buffer:uniformBuffer}},{binding:1,resource:{buffer:splatsBuffer}},{binding:2,resource:{buffer:orderBuffer}}
 ]});
 $('countVal').textContent=activeCount.toLocaleString('ja-JP');state.dirty=true;
}
function sortBackToFront(cam){
 for(let i=0;i<activeCount;i++){
  const k=i*3;depths[i]=(positions[k]-cam.eye[0])*cam.front[0]+(positions[k+1]-cam.eye[1])*cam.front[1]+(positions[k+2]-cam.eye[2])*cam.front[2];
 }
 order.sort((a,b)=>depths[b]-depths[a]);
 device.queue.writeBuffer(orderBuffer,0,order);
 state.dirty=false;
}
function resize(){
 const dpr=Math.min(devicePixelRatio||1,1.35);const w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
 // Limit pixel count to avoid excessive GPU work on phones.
 const shrink=Math.min(1,Math.sqrt(1152000/(w*h)));const rw=Math.max(1,Math.floor(w*shrink)),rh=Math.max(1,Math.floor(h*shrink));
 if(canvas.width===rw&&canvas.height===rh)return;
 canvas.width=rw;canvas.height=rh;
 if(TEST){offscreenTex?.destroy();offscreenTex=device.createTexture({size:[rw,rh],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});}
 $('resolution').textContent=`${rw}×${rh}`;state.dirty=true;
}
function frameDraw(cam){
 resize();
 const focal=.5*canvas.height/Math.tan(Math.PI/6);
 const arr=new Float32Array(24);arr.set([...cam.eye,0,...cam.right,0,...cam.up,0,...cam.front,0],0);
 arr.set([canvas.width,canvas.height,focal,settings.size],16);
 arr.set([settings.opacity,settings.points?1:0,0,0],20);
 device.queue.writeBuffer(uniformBuffer,0,arr);
 if(state.dirty)sortBackToFront(cam);
 const encoder=device.createCommandEncoder();
 const surface=TEST?offscreenTex.createView():context.getCurrentTexture().createView();
 const pass=encoder.beginRenderPass({colorAttachments:[{view:surface,clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
 pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.draw(6,activeCount);pass.end();
 device.queue.submit([encoder.finish()]);
}
function setError(err){console.error(err);$('error').hidden=false;$('error').textContent='WebGPU 初期化・描画エラー: '+(err?.message||String(err));document.documentElement.dataset.gpuStage='error';document.documentElement.dataset.gpuError=String(err?.message||err);}
async function init(){
 try{
 step('script-start');
 if(!navigator.gpu)throw Error('WebGPUに対応したブラウザとHTTPS（またはlocalhost）が必要です。');
 step('request-adapter');const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('GPU adapterを取得できませんでした。');
 step('request-device');device=await adapter.requestDevice();device.lost.then(i=>setError(Error(`GPU device lost: ${i.reason} ${i.message}`)));
 format=navigator.gpu.getPreferredCanvasFormat();
 if(!TEST){context=canvas.getContext('webgpu');if(!context)throw Error('WebGPU canvas context unavailable');context.configure({device,format,alphaMode:'premultiplied'});}
 step('shader-compilation-info');const module=device.createShaderModule({code:shader});const info=await module.getCompilationInfo();
 const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
 step('create-pipeline');
 device.pushErrorScope('validation');
 pipeline=device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs_main'},fragment:{module,entryPoint:'fs_main',targets:[{format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-list',cullMode:'none'}});
 uniformBuffer=device.createBuffer({size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});rebuild();
 const pipelineError=await device.popErrorScope();if(pipelineError)throw Error(pipelineError.message);
 setupControls();
 step('ready');let last=performance.now(),dtSum=0,frameCount=0;
 function tick(now){
  try{
   let dt=Math.min(.1,(now-last)/1000);last=now;
   if(settings.auto&&!state.dragging){state.yaw+=dt*.075;state.dirty=true;}
   frameDraw(getCamera());
   dtSum+=dt;frameCount++;
   if(dtSum>=.5){$('fps').textContent=String(Math.round(frameCount/dtSum));$('visible').textContent=activeCount.toLocaleString('ja-JP');dtSum=0;frameCount=0;}
   requestAnimationFrame(tick);
  }catch(e){setError(e);}
 }
 if(TEST){
  // CI: same shaders, buffers and draw path; render target is offscreen to avoid Chromium swapchain errors.
  resize();device.pushErrorScope('validation');step('submitted-work-wait');frameDraw(getCamera());await device.queue.onSubmittedWorkDone();
  const gpuErr=await device.popErrorScope();if(gpuErr)throw Error(gpuErr.message);
  // Validate actual pixels, not just a successfully submitted draw call.
  const pitch=Math.ceil(canvas.width*4/256)*256;
  const readback=device.createBuffer({size:pitch*canvas.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const copy=device.createCommandEncoder();
  copy.copyTextureToBuffer({texture:offscreenTex},{buffer:readback,bytesPerRow:pitch,rowsPerImage:canvas.height},[canvas.width,canvas.height,1]);
  device.queue.submit([copy.finish()]);await device.queue.onSubmittedWorkDone();
  await readback.mapAsync(GPUMapMode.READ);
  const pixels=new Uint8Array(readback.getMappedRange());let populated=0;
  for(let y=0;y<canvas.height;y+=8)for(let x=0;x<canvas.width;x+=8){if(pixels[y*pitch+x*4+3]>5)populated++;}
  readback.unmap();readback.destroy();
  if(populated<20)throw Error('GPU rendered too few visible pixels: '+populated);
  document.documentElement.dataset.gpuPixels=String(populated);
  step('ok');document.documentElement.dataset.gpuTest='ok';
 }else requestAnimationFrame(tick);
 }catch(e){setError(e);}
}
function setupControls(){
 for(const id of ['scene','count','size','opacity','points','auto']){
  $(id).addEventListener('input',()=>{
   const e=$(id);settings[id]=id==='points'||id==='auto'?e.checked:id==='scene'?e.value:Number(e.value);
   if(id==='scene'||id==='count'){rebuild();}
   if(id==='size')$('sizeVal').textContent=settings.size.toFixed(2)+'×';
   if(id==='opacity')$('opacityVal').textContent=settings.opacity.toFixed(2)+'×';
   state.dirty=true;
  });
 }
 $('reset').addEventListener('click',resetCamera);
 $('regen').addEventListener('click',()=>{state.seed++;rebuild();});
 $('collapse').addEventListener('click',()=>{const v=$('panel').classList.toggle('hide');$('collapse').textContent=v?'+':'−';});
 let lastX=0,lastY=0;const touchMap=new Map();let pinch=0;
 canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);touchMap.set(e.pointerId,[e.clientX,e.clientY]);state.dragging=true;lastX=e.clientX;lastY=e.clientY;});
 canvas.addEventListener('pointermove',e=>{
  if(!touchMap.has(e.pointerId))return;
  const old=touchMap.get(e.pointerId);touchMap.set(e.pointerId,[e.clientX,e.clientY]);
  const ps=[...touchMap.values()];
  if(ps.length===2){const dist=Math.hypot(ps[0][0]-ps[1][0],ps[0][1]-ps[1][1]);if(pinch)state.distance=clamp(state.distance*pinch/dist,3.2,22);pinch=dist;}
  else {state.yaw+=(e.clientX-old[0])*.007;state.pitch=clamp(state.pitch+(e.clientY-old[1])*.007,-1.42,1.42);pinch=0;}
  state.dirty=true;
 });
 const end=e=>{touchMap.delete(e.pointerId);if(touchMap.size<2)pinch=0;if(touchMap.size===0)state.dragging=false;};
 canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
 canvas.addEventListener('wheel',e=>{e.preventDefault();state.distance=clamp(state.distance*Math.exp(e.deltaY*.001),3.2,22);state.dirty=true;},{passive:false});
}
init();