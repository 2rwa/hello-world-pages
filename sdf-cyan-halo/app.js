import {buildScene,packScene,DEFAULTS} from './model.js';
import {exportOBJ} from './export.js';
const canvas=document.getElementById('view'),status=document.getElementById('status');
const state=window.__haloState={phase:'script-start',ok:false,partCount:0};
const opts={...DEFAULTS,quality:.8,metal:.23,exposure:1.35,mode:0};
let device,context,pipeline,bindGroup,uniformBuffer,shapeBuffer,texture,targetFormat,parts=[];
let yaw=.56,pitch=.10,distance=5.3,initialized=false,requestPending=false;
let lastTouch=0,dragPoint=null,dirty=true;
const isCI=new URLSearchParams(location.search).get('ci');
const offscreen=isCI==='offscreen';
const $=id=>document.getElementById(id);
function report(phase,message,err=false){state.phase=phase;status.textContent=message;if(err)state.error=String(message);}
function shapeUpdate(){
 parts=buildScene(opts);state.partCount=parts.length;
 if(device){device.queue.writeBuffer(shapeBuffer,0,packScene(parts));}
 dirty=true;
}
function layout(){
 if(offscreen){canvas.width=144;canvas.height=144;return;}
 const pixel=window.devicePixelRatio||1;
 const upper=window.innerWidth<720?490:850;
 const factor=Math.min(1,upper*opts.quality/(window.innerHeight*pixel),1150*opts.quality/(window.innerWidth*pixel));
 canvas.width=Math.max(2,Math.floor(window.innerWidth*pixel*factor));
 canvas.height=Math.max(2,Math.floor(window.innerHeight*pixel*factor));
 dirty=true;
}
function camera(){
 const cp=Math.cos(pitch);
 return [Math.sin(yaw)*cp*distance,.12+Math.sin(pitch)*distance,Math.cos(yaw)*cp*distance];
}
function writeUniforms(now){
 const cameraPos=camera();
 const f=new Float32Array(16);
 f.set([...cameraPos,0],0);
 f.set([0,.12,0,0],4);
 f.set([canvas.width,canvas.height,parts.length,0],8);
 f.set([opts.exposure,opts.metal,opts.mode,now*.001],12);
 device.queue.writeBuffer(uniformBuffer,0,f);
}
function renderEncoder(){
 const encoder=device.createCommandEncoder();
 const view=offscreen?texture.createView():context.getCurrentTexture().createView();
 const pass=encoder.beginRenderPass({colorAttachments:[{view,clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});
 pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.draw(3);pass.end();
 return encoder;
}
async function readback(encoder){
 const w=canvas.width,h=canvas.height,stride=Math.ceil(w*4/256)*256;
 const staging=device.createBuffer({size:stride*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 encoder.copyTextureToBuffer({texture},{buffer:staging,bytesPerRow:stride,rowsPerImage:h},{width:w,height:h,depthOrArrayLayers:1});
 device.queue.submit([encoder.finish()]);
 await device.queue.onSubmittedWorkDone();
 await staging.mapAsync(GPUMapMode.READ);
 const bytes=new Uint8Array(staging.getMappedRange());
 let bright=0,nonDark=0,checksum=2166136261;
 for(let y=0;y<h;y+=2){for(let x=0;x<w;x+=2){
  const i=y*stride+x*4,energy=bytes[i]+bytes[i+1]+bytes[i+2];
  if(energy>115)bright++;if(energy>50)nonDark++;
  checksum=Math.imul(checksum^bytes[i],16777619);
  checksum=Math.imul(checksum^bytes[i+1],16777619);
  checksum=Math.imul(checksum^bytes[i+2],16777619);
 }}
 staging.unmap();staging.destroy();
 const stats={bright,nonDark,signature:(checksum>>>0).toString(16)};
 state.pixels=stats;return stats;
}
export async function drawOnce(){
 if(!initialized)throw Error('WebGPU not initialized');
 if(requestPending)return state.pixels||null;
 requestPending=true;
 try{
  writeUniforms(offscreen?1600:performance.now());
  device.pushErrorScope('validation');
  const encoder=renderEncoder();
  let pixels;
  if(offscreen)pixels=await readback(encoder);
  else{device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();}
  const error=await device.popErrorScope();
  if(error)throw Error('WebGPU validation: '+error.message);
  if(offscreen&&pixels.bright<15)throw Error('Offscreen render appears blank: '+JSON.stringify(pixels));
  state.ok=true;state.phase='ok';
  state.pixels=pixels||state.pixels;
  report('ok','WebGPU OK · '+parts.length+' SDF部品 · '+canvas.width+'×'+canvas.height+(pixels?' · '+pixels.bright+' bright samples':''));
  dirty=false;
  return pixels||{ok:true};
 }catch(e){state.ok=false;report('error',e.message,true);throw e;}
 finally{requestPending=false;}
}
window.__haloDraw=drawOnce;
async function init(){
 try{
  shapeUpdate();layout();
  if(!navigator.gpu)throw Error('このブラウザではWebGPUが利用できません。');
  report('request-adapter','WebGPU adapter...');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw Error('GPU adapterが見つかりません');
  report('request-device','GPU device...');
  device=await adapter.requestDevice();
  device.lost.then(info=>{state.ok=false;report('error','GPU device lost: '+info.reason+' '+info.message,true);});
  targetFormat=offscreen?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
  if(offscreen)texture=device.createTexture({size:[canvas.width,canvas.height],format:targetFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  else{
   context=canvas.getContext('webgpu');
   if(!context)throw Error('WebGPU canvas contextが取得できません');
   context.configure({device,format:targetFormat,alphaMode:'opaque'});
  }
  uniformBuffer=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  shapeBuffer=device.createBuffer({size:128*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  shapeUpdate();
  const response=await fetch('./character.wgsl',{cache:'no-store'});
  if(!response.ok)throw Error('WGSL fetch failed: '+response.status);
  const source=await response.text();
  const shader=device.createShaderModule({code:source});
  report('shader-compilation-info','WGSL compilation...');
  const info=await shader.getCompilationInfo();
  const failures=info.messages.filter(m=>m.type==='error');
  state.compilation=info.messages.map(m=>m.type+': '+m.message);
  if(failures.length)throw Error('WGSL: '+failures.map(m=>m.lineNum+':'+m.message).join(' / '));
  report('create-pipeline','Creating raymarch pipeline...');
  pipeline=await device.createRenderPipelineAsync({
   layout:'auto',vertex:{module:shader,entryPoint:'vertexMain'},
   fragment:{module:shader,entryPoint:'fragmentMain',targets:[{format:targetFormat}]},
   primitive:{topology:'triangle-list'}
  });
  bindGroup=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
   {binding:0,resource:{buffer:uniformBuffer}},{binding:1,resource:{buffer:shapeBuffer}}
  ]});
  initialized=true;report('submitted-work-wait','Tracing metallic 3D unit...');
  await drawOnce();
  if(!isCI)requestAnimationFrame(animate);
 }catch(e){console.error(e);state.ok=false;report('error',e.stack||e.message,true);}
}
function animate(){
 if(dirty&&!requestPending)drawOnce().catch(console.error);
 else if(!requestPending)drawOnce().catch(console.error);
 requestAnimationFrame(animate);
}
function rebuild(){shapeUpdate();if(isCI&&initialized)drawOnce().catch(console.error);}
for(const name of ['pose','halo','armor','cannon','quality','metal','exposure']){
 const element=$(name);
 const refresh=()=>{
  opts[name]=+element.value;$(name+'Out').textContent=(+element.value).toFixed(2);
  if(['pose','halo','armor','cannon'].includes(name))rebuild();
  else if(name==='quality')layout();
  dirty=true;
 };
 element.addEventListener('input',refresh);refresh();
}
$('mode').addEventListener('change',()=>{opts.mode=+$('mode').value;dirty=true;if(isCI&&initialized)drawOnce().catch(console.error);});
$('front').addEventListener('click',()=>{yaw=0;pitch=.06;dirty=true;});
$('side').addEventListener('click',()=>{yaw=Math.PI*.5;pitch=.02;dirty=true;});
$('reset').addEventListener('click',()=>{
 Object.assign(opts,DEFAULTS);for(const n of ['pose','halo','armor','cannon']){$(n).value=DEFAULTS[n];$(n+'Out').textContent=DEFAULTS[n].toFixed(2);}
 yaw=.56;pitch=.10;distance=5.3;rebuild();
});
$('toggle').addEventListener('click',()=>{
 $('panel').classList.toggle('hidden');$('toggle').textContent=$('panel').classList.contains('hidden')?'設定を表示':'設定を隠す';
});
$('export').addEventListener('click',async()=>{
 const button=$('export');button.disabled=true;status.textContent='OBJメッシュを生成しています…';
 try{await new Promise(requestAnimationFrame);const mesh=await exportOBJ(parts,56);
  status.textContent='OBJ作成完了 · '+mesh.triangles+' triangles · '+mesh.vertices+' vertices';}
 catch(e){report('error','OBJ export: '+e.message,true);}
 finally{button.disabled=false;}
});
canvas.addEventListener('pointerdown',e=>{dragPoint=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
 if(!dragPoint)return;
 const dx=e.clientX-dragPoint[0],dy=e.clientY-dragPoint[1];dragPoint=[e.clientX,e.clientY];
 yaw+=dx*.008;pitch=Math.max(-1.2,Math.min(1.2,pitch+dy*.008));dirty=true;
});
canvas.addEventListener('pointerup',()=>{dragPoint=null;});
canvas.addEventListener('pointercancel',()=>{dragPoint=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(2.1,Math.min(12,distance*Math.exp(e.deltaY*.001)));dirty=true;},{passive:false});
window.addEventListener('resize',()=>{if(initialized&&!offscreen){layout();}});
init();
