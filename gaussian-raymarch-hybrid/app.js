import { shader as splatShader } from '../gaussian-splatting-demo/shaders.js';
import { raymarchShader } from './raymarch-shader.js';
import { settings, state, camera, generate, clamp } from './scene.js';
const $=id=>document.getElementById(id);
const canvas=$('screen'),TEST=new URLSearchParams(location.search).has('ci');
const outputFormat=TEST?'rgba8unorm':navigator.gpu?.getPreferredCanvasFormat();
let device,context,splatPipeline,rayPipeline,uniformBuffer,splatBuffer,orderBuffer,splatBind,rayBind;
let splatTex,finalTex,rawPos,order,depths,frameCount=0,lastTime=0,fpsTime=0,fpsFrames=0;
function stage(s){document.documentElement.dataset.gpuStage=s;}
function fail(e){console.error(e);$('error').hidden=false;$('error').textContent='WebGPU error: '+(e?.message||e);
 document.documentElement.dataset.gpuError=String(e?.message||e);stage('error');}
function makeBuf(data,usage){let b=device.createBuffer({size:Math.max(4,data.byteLength),usage});device.queue.writeBuffer(b,0,data);return b;}
function rebuild(){
 const g=generate(settings.count,settings.scene,state.seed);rawPos=g.positions;
 splatBuffer?.destroy();orderBuffer?.destroy();
 splatBuffer=makeBuf(g.raw,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
 order=new Uint32Array(settings.count);depths=new Float32Array(settings.count);
 for(let i=0;i<settings.count;i++)order[i]=i;
 orderBuffer=makeBuf(order,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
 splatBind=device.createBindGroup({layout:splatPipeline.getBindGroupLayout(0),entries:[
  {binding:0,resource:{buffer:uniformBuffer}},{binding:1,resource:{buffer:splatBuffer}},{binding:2,resource:{buffer:orderBuffer}}]});
 recreateRayBind();$('countVal').textContent=settings.count; 
}
function recreateRayBind(){
 if(!splatTex||!splatBuffer||!rayPipeline)return;
 rayBind=device.createBindGroup({layout:rayPipeline.getBindGroupLayout(0),entries:[
 {binding:0,resource:{buffer:uniformBuffer}},{binding:1,resource:{buffer:splatBuffer}},{binding:2,resource:splatTex.createView()}]});
}
function resize(){
 const [w,h]=settings.resolution.split('x').map(Number);
 if(canvas.width===w&&canvas.height===h)return;
 canvas.width=w;canvas.height=h;
 splatTex?.destroy();finalTex?.destroy();
 splatTex=device.createTexture({size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
 if(TEST)finalTex=device.createTexture({size:[w,h],format:outputFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 $('resolutionVal').textContent=w+'×'+h;
 recreateRayBind();
}
function sort(cam){
 for(let i=0;i<settings.count;i++){
  let j=i*3;depths[i]=(rawPos[j]-cam.eye[0])*cam.front[0]+(rawPos[j+1]-cam.eye[1])*cam.front[1]+(rawPos[j+2]-cam.eye[2])*cam.front[2];
 }
 order.sort((a,b)=>depths[b]-depths[a]);device.queue.writeBuffer(orderBuffer,0,order);
}
function render(){
 resize();
 const c=camera(),w=canvas.width,h=canvas.height,focal=h*.5/Math.tan(Math.PI/6);
 const uniform=new Float32Array(32);
 uniform.set([...c.eye,0,...c.right,0,...c.up,0,...c.front,0],0);
 uniform.set([w,h,focal,settings.scale],16);
 uniform.set([settings.density,0,0,0],20);
 uniform.set([settings.mode,settings.count,settings.steps,settings.glass],24);
 uniform.set([performance.now()/1000,0,0,0],28);
 device.queue.writeBuffer(uniformBuffer,0,uniform);
 if(settings.mode===0)sort(c);
 const encoder=device.createCommandEncoder();
 if(settings.mode===0){
  const sPass=encoder.beginRenderPass({colorAttachments:[{view:splatTex.createView(),loadOp:'clear',clearValue:{r:0,g:0,b:0,a:0},storeOp:'store'}]});
  sPass.setPipeline(splatPipeline);sPass.setBindGroup(0,splatBind);sPass.draw(6,settings.count);sPass.end();
 }
 const target=TEST?finalTex.createView():context.getCurrentTexture().createView();
 const rPass=encoder.beginRenderPass({colorAttachments:[{view:target,loadOp:'clear',clearValue:{r:0,g:0,b:0,a:1},storeOp:'store'}]});
 rPass.setPipeline(rayPipeline);rPass.setBindGroup(0,rayBind);rPass.draw(3);rPass.end();
 device.queue.submit([encoder.finish()]);
 frameCount++;
}
async function snapshot(){
 const w=canvas.width,h=canvas.height,pitch=Math.ceil(w*4/256)*256;
 const out=device.createBuffer({size:pitch*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture:finalTex},{buffer:out,bytesPerRow:pitch,rowsPerImage:h},[w,h,1]);
 device.queue.submit([enc.finish()]);await device.queue.onSubmittedWorkDone();
 await out.mapAsync(GPUMapMode.READ);
 const src=new Uint8Array(out.getMappedRange());const pixels=new Uint8ClampedArray(w*h*4);
 let hash=2166136261,populated=0;
 for(let y=0;y<h;y++){pixels.set(src.subarray(y*pitch,y*pitch+w*4),y*w*4);}
 for(let i=0;i<pixels.length;i+=16){
  hash=Math.imul((hash^pixels[i])>>>0,16777619)>>>0;
  if(pixels[i]+pixels[i+1]+pixels[i+2]>42)populated++;
 }
 out.unmap();out.destroy();
 let preview=$('ciPreview');
 if(!preview){preview=document.createElement('canvas');preview.id='ciPreview';preview.style.display='none';document.body.append(preview);}
 preview.width=w;preview.height=h;preview.getContext('2d').putImageData(new ImageData(pixels,w,h),0,0);
 document.documentElement.dataset.gpuPixels=String(populated);document.documentElement.dataset.gpuHash=String(hash);
 return {width:w,height:h,hash,populated};
}
function wireControls(){
 const keys=['mode','scene','resolution','count','steps','density','scale','glass','auto'];
 const refresh=()=>{$('densityVal').textContent=settings.density.toFixed(2)+'×';$('scaleVal').textContent=settings.scale.toFixed(2)+'×';
 $('glassVal').textContent=settings.glass.toFixed(2)+'×';$('stepsVal').textContent=settings.steps;
 $('renderMode').textContent=['3DGS','Volume','Iso'][settings.mode];};
 for(let key of keys)$(key).addEventListener('input',()=>{
  const node=$(key);settings[key]=key==='auto'?node.checked:['scene','resolution'].includes(key)?node.value:Number(node.value);
  if(key==='scene'||key==='count')rebuild();refresh();
 });
 $('reset').addEventListener('click',()=>{state.yaw=.12;state.pitch=.13;state.distance=7.8;});
 $('regen').addEventListener('click',()=>{state.seed++;rebuild();});
 $('collapse').addEventListener('click',()=>{
  let closed=$('panel').classList.toggle('closed');$('collapse').textContent=closed?'+':'−';
 });
 const pointers=new Map();let pinch=0;
 canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);state.dragging=true;});
 canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  const before=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);
  if(pointers.size>=2){
   const a=[...pointers.values()];const d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);
   if(pinch)state.distance=clamp(state.distance*pinch/d,3,18);pinch=d;
  }else{state.yaw+=(e.clientX-before[0])*.007;state.pitch=clamp(state.pitch+(e.clientY-before[1])*.007,-1.4,1.4);pinch=0;}
 });
 const end=e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinch=0;state.dragging=pointers.size>0;};
 canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
 canvas.addEventListener('wheel',e=>{e.preventDefault();state.distance=clamp(state.distance*Math.exp(e.deltaY*.001),3,18);},{passive:false});
 refresh();
}
async function init(){
 try{
  stage('script-start');
  if(!navigator.gpu)throw Error('WebGPUが必要です。HTTPS/localhost上のChromeまたはSafariを使用してください。');
  stage('request-adapter');let adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('GPU adapter unavailable');
  stage('request-device');device=await adapter.requestDevice();
  device.lost.then(info=>{if(info.reason!=='destroyed')fail(Error('GPU device lost: '+info.message));});
  if(!TEST){context=canvas.getContext('webgpu');if(!context)throw Error('Canvas WebGPU context missing');
   context.configure({device,format:outputFormat,alphaMode:'opaque'});}
  stage('shader-compilation-info');
  const s=device.createShaderModule({code:splatShader}),r=device.createShaderModule({code:raymarchShader});
  for(const mod of [s,r]){const info=await mod.getCompilationInfo();const problems=info.messages.filter(m=>m.type==='error');
   if(problems.length)throw Error('WGSL: '+problems.map(m=>m.lineNum+':'+m.linePos+' '+m.message).join(' | '));}
  stage('create-pipeline');device.pushErrorScope('validation');
  splatPipeline=device.createRenderPipeline({layout:'auto',vertex:{module:s,entryPoint:'vs_main'},fragment:{module:s,entryPoint:'fs_main',targets:[{
   format:'rgba8unorm',blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},
   primitive:{topology:'triangle-list',cullMode:'none'}});
  rayPipeline=device.createRenderPipeline({layout:'auto',vertex:{module:r,entryPoint:'vs_main'},fragment:{module:r,entryPoint:'fs_main',targets:[{format:outputFormat}]},primitive:{topology:'triangle-list'}});
  uniformBuffer=device.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  resize();rebuild();
  const validation=await device.popErrorScope();if(validation)throw Error(validation.message);
  wireControls();
  if(TEST){
   // Same pipelines and shaders as interactive mode; only output attachment differs.
   settings.resolution='320x180';settings.count=16;settings.steps=12;
   $('resolution').value=settings.resolution;$('count').value='16';$('steps').value='12';rebuild();
   stage('submitted-work-wait');
   window.hybridCiRender=async()=>{device.pushErrorScope('validation');render();await device.queue.onSubmittedWorkDone();
    const e=await device.popErrorScope();if(e)throw Error(e.message);return snapshot();};
   const img=await window.hybridCiRender();if(img.populated<50)throw Error('Unexpected blank GPU frame');
   stage('ok');document.documentElement.dataset.gpuTest='ok';
  }else{
   stage('ready');lastTime=performance.now();
   const tick=t=>{try{const dt=Math.min(.1,(t-lastTime)/1000);lastTime=t;
    if(settings.auto&&!state.dragging)state.yaw+=dt*.1;
    render();fpsTime+=dt;fpsFrames++;
    if(fpsTime>=.7){$('fps').textContent=String(Math.round(fpsFrames/fpsTime));fpsTime=0;fpsFrames=0;}
    requestAnimationFrame(tick);
   }catch(e){fail(e);}};
   requestAnimationFrame(tick);
  }
 }catch(e){fail(e);}
}
init();
