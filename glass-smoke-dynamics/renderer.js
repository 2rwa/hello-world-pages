// GPU drawing and readback share the same production WGSL and render pipeline.
const vec=(x,y,z)=>[x,y,z];
const norm=a=>{const d=Math.hypot(...a)||1;return a.map(x=>x/d)};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const hexRgb=hex=>{const n=parseInt(hex.replace('#',''),16)||0x9dcdf6;return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]};
export class GlassRenderer{
 constructor(canvas,{offscreen=false}={}){this.canvas=canvas;this.offscreen=offscreen;this.yaw=.25;this.pitch=.16;this.distance=5.7;this.width=480;this.height=270;this.ready=false;this.log=[];}
 phase(v){this.log.push(v);window.__gpuPhase=v;document.documentElement.dataset.gpuPhase=v;}
 async init(){
  this.phase('request-adapter');
  if(!navigator.gpu)throw new Error('navigator.gpu unavailable (HTTPS and compatible GPU/browser required)');
  this.adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!this.adapter)throw new Error('WebGPU adapter unavailable');
  this.phase('request-device');
  this.device=await this.adapter.requestDevice();this.device.lost.then(info=>{this.phase('device-lost: '+info.reason+' '+info.message);this.ready=false});
  this.format=this.offscreen?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
  if(!this.offscreen){this.context=this.canvas.getContext('webgpu');this.context.configure({device:this.device,format:this.format,alphaMode:'opaque'});}
  this.phase('shader-compilation-info');
  const response=await fetch('./scene.wgsl');if(!response.ok)throw new Error('WGSL fetch failed '+response.status);
  const source=await response.text(),shader=this.device.createShaderModule({code:source});
  const compilation=await shader.getCompilationInfo();
  const failures=compilation.messages.filter(m=>m.type==='error');
  if(failures.length)throw new Error('WGSL errors: '+failures.map(m=>m.lineNum+':'+m.message).join(' | '));
  this.shaderWarnings=compilation.messages.filter(m=>m.type!=='error').map(m=>m.message);
  this.phase('create-pipeline');
  this.device.pushErrorScope('validation');
  this.layout=this.device.createBindGroupLayout({entries:[
   {binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
   {binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}},
   {binding:2,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}}
  ]});
  this.uniform=this.device.createBuffer({size:144,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.smokeBuffer=this.device.createBuffer({size:700*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  this.ballBuffer=this.device.createBuffer({size:16*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const pipelineLayout=this.device.createPipelineLayout({bindGroupLayouts:[this.layout]});
  this.pipeline=await this.device.createRenderPipelineAsync({layout:pipelineLayout,vertex:{module:shader,entryPoint:'vs_main'},fragment:{module:shader,entryPoint:'fs_main',targets:[{format:this.format}]},primitive:{topology:'triangle-list'}});
  this.bindGroup=this.device.createBindGroup({layout:this.layout,entries:[
   {binding:0,resource:{buffer:this.uniform}},
   {binding:1,resource:{buffer:this.smokeBuffer}},
   {binding:2,resource:{buffer:this.ballBuffer}}
  ]});
  const error=await this.device.popErrorScope();if(error)throw Error('Pipeline validation: '+error.message);
  this.ready=true;this.phase('pipeline-ready');this.resize(480,270);
 }
 resize(w,h){
  this.width=Math.min(1280,Math.max(128,Math.round(w)));this.height=Math.min(720,Math.max(72,Math.round(h)));
  this.canvas.width=this.width;this.canvas.height=this.height;
  if(this.offscreen){
   this.texture?.destroy();
   this.texture=this.device.createTexture({size:[this.width,this.height],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  }
 }
 camera(){
  const cp=Math.cos(this.pitch),eye=[Math.sin(this.yaw)*cp*this.distance,Math.sin(this.pitch)*this.distance,Math.cos(this.yaw)*cp*this.distance];
  const forward=norm(eye.map(x=>-x)),right=norm(cross(forward,[0,1,0])),up=norm(cross(right,forward));
  return {eye,forward,right,up};
 }
 upload(world,cfg,mode=0){
  const u=new Float32Array(36),{eye,forward,right,up}=this.camera();
  u.set([cfg.radius,world.smoke.length,world.balls.length,mode],0);
  u.set([cfg.ior,cfg.dispersion,cfg.reflectivity,cfg.gloss],4);
  u.set([cfg.smokeDensity,cfg.smokeAlpha,cfg.shellOpacity,cfg.bloom],8);
  u.set([...eye,.43],12);u.set([...right,0],16);u.set([...up,0],20);u.set([...forward,0],24);
  u.set([...hexRgb(cfg.smokeColor),1],28);u.set([this.width,this.height,world.t,0],32);
  this.device.queue.writeBuffer(this.uniform,0,u);
  const smoke=new Float32Array(700*8);
  world.smoke.forEach((p,i)=>{const j=i*8;smoke.set([...p.p,p.size,p.density,Math.max(.05,Math.min(1,(p.life-p.age)/1.7)),0,0],j)});
  this.device.queue.writeBuffer(this.smokeBuffer,0,smoke);
  const balls=new Float32Array(16*8);
  world.balls.forEach((b,i)=>{balls.set([...b.p,b.r,...b.v,0],i*8)});
  this.device.queue.writeBuffer(this.ballBuffer,0,balls);
 }
 async draw(world,cfg,{mode=0,readback=false}={}){
  if(!this.ready)throw Error('Renderer is not ready');
  this.phase('validation-scope');this.device.pushErrorScope('validation');
  this.upload(world,cfg,mode);
  const target=this.offscreen?this.texture:this.context.getCurrentTexture();
  const encoder=this.device.createCommandEncoder({label:'glass-smoke-scene'});
  const pass=encoder.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});
  pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.draw(3);pass.end();
  let readBuffer=null,rowPitch=0;
  if(readback){
   if(!this.offscreen)throw Error('Readback is available on offscreen texture only');
   rowPitch=Math.ceil(this.width*4/256)*256;
   readBuffer=this.device.createBuffer({size:rowPitch*this.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
   encoder.copyTextureToBuffer({texture:target},{buffer:readBuffer,bytesPerRow:rowPitch,rowsPerImage:this.height},{width:this.width,height:this.height,depthOrArrayLayers:1});
  }
  this.device.queue.submit([encoder.finish()]);
  this.phase('submitted-work-wait');await this.device.queue.onSubmittedWorkDone();
  const err=await this.device.popErrorScope();
  if(err){readBuffer?.destroy();throw Error('WebGPU validation error: '+err.message);}
  let metrics={ok:true,mode,width:this.width,height:this.height,gpuComplete:true};
  if(readBuffer){
   await readBuffer.mapAsync(GPUMapMode.READ);
   const bytes=new Uint8Array(readBuffer.getMappedRange()),pixels=new Uint8Array(this.width*this.height*4);
   for(let y=0;y<this.height;y++)pixels.set(bytes.subarray(y*rowPitch,y*rowPitch+this.width*4),y*this.width*4);
   let brightness=0,brightnessSquare=0,colored=0;
   for(let k=0;k<pixels.length;k+=4){const r=pixels[k],g=pixels[k+1],b=pixels[k+2],lum=(r+g+b)/3;brightness+=lum;brightnessSquare+=lum*lum;if(Math.max(r,g,b)-Math.min(r,g,b)>18)colored++;}
   const n=pixels.length/4;metrics={...metrics,mean:brightness/n,variance:brightnessSquare/n-(brightness/n)**2,coloredFraction:colored/n,center:Array.from(pixels.slice(((this.height>>1)*this.width+(this.width>>1))*4,((this.height>>1)*this.width+(this.width>>1))*4+4)),pixels:Array.from(pixels)};
   readBuffer.unmap();readBuffer.destroy();
  }
  this.phase('done');return metrics;
 }
}
