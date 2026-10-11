import {CAPACITY} from './physics.mjs';
const stage=s=>document.documentElement.dataset.webgpuStage=s;
export class GlassRenderer{
 constructor(canvas,settings,ci=false){
  this.canvas=canvas;this.s=settings;this.ci=ci;this.width=0;this.height=0;
  this.scale=settings.resolution;this.hasHistory=false;this.frames=0;this.lastPixels=null;
 }
 async initialize(){
  stage('request-adapter');
  if(!navigator.gpu)throw Error('WebGPU is not supported in this browser');
  this.adapter=await navigator.gpu.requestAdapter();
  if(!this.adapter)throw Error('No WebGPU adapter available');
  stage('request-device');
  const d=this.device=await this.adapter.requestDevice();
  const root=document.documentElement;
  d.lost.then(e=>{root.dataset.deviceLost=e.reason+' '+e.message;if(e.reason!=='destroyed')root.dataset.webgpuStatus='error';});
  d.addEventListener('uncapturederror',e=>{root.dataset.webgpuStatus='error';root.dataset.webgpuError=e.error.message;});
  this.format=this.ci?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
  if(!this.ci){this.context=this.canvas.getContext('webgpu');if(!this.context)throw Error('WebGPU canvas not available');}
  this.uniform=d.createBuffer({size:160,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.postUniform=d.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.storage=d.createBuffer({size:CAPACITY*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  stage('shader-compilation-info');
  const files=['scene.wgsl','post.wgsl','present.wgsl'];
  const source=await Promise.all(files.map(async file=>{
   const res=await fetch('./shaders/'+file);if(!res.ok)throw Error('Could not load '+file+' HTTP '+res.status);
   return res.text();
  }));
  const shaders=source.map(code=>d.createShaderModule({code}));
  for(let i=0;i<shaders.length;i++){
   const info=await shaders[i].getCompilationInfo();
   const err=info.messages.filter(v=>v.type==='error');
   if(err.length)throw Error(files[i]+' WGSL '+err.map(e=>e.lineNum+':'+e.linePos+' '+e.message).join('\n'));
  }
  stage('create-pipeline');
  this.scene=await d.createRenderPipelineAsync({layout:'auto',
   vertex:{module:shaders[0],entryPoint:'vertexMain'},
   fragment:{module:shaders[0],entryPoint:'fragmentMain',targets:[{format:'rgba16float'}]},
   primitive:{topology:'triangle-list'}});
  this.post=await d.createRenderPipelineAsync({layout:'auto',
   vertex:{module:shaders[1],entryPoint:'vertexMain'},
   fragment:{module:shaders[1],entryPoint:'fragmentMain',targets:[{format:'rgba8unorm'}]},
   primitive:{topology:'triangle-list'}});
  this.present=await d.createRenderPipelineAsync({layout:'auto',
   vertex:{module:shaders[2],entryPoint:'vertexMain'},
   fragment:{module:shaders[2],entryPoint:'fragmentMain',targets:[{format:this.format}]},
   primitive:{topology:'triangle-list'}});
  this.sceneBind=d.createBindGroup({layout:this.scene.getBindGroupLayout(0),entries:[
   {binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.storage}}
  ]});
  this.ready=true;this.resize();
 }
 resize(){
  if(!this.ready)return;
  const s=this.s;
  const quality={low:.4,medium:.63,high:.82,ultra:1};
  const scale=s.quality==='auto'?Math.min(s.resolution,this.scale):quality[s.quality];
  const pixelRatio=this.ci?1:Math.min(devicePixelRatio||1,1.5);
  const cw=this.ci?320:Math.max(1,this.canvas.clientWidth);
  const ch=this.ci?240:Math.max(1,this.canvas.clientHeight);
  const maxSize=this.ci?256:1440;
  const factor=Math.min(1,maxSize/Math.max(cw,ch));
  const w=Math.max(8,Math.round(cw*scale*pixelRatio*factor/2)*2);
  const h=Math.max(8,Math.round(ch*scale*pixelRatio*factor/2)*2);
  if(this.width===w&&this.height===h)return;
  const d=this.device;this.width=w;this.height=h;
  for(const key of ['hdr','postTex','history','offscreen'])this[key]?.destroy();
  this.hdr=d.createTexture({size:[w,h],format:'rgba16float',
   usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
  this.postTex=d.createTexture({size:[w,h],format:'rgba8unorm',
   usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
  this.history=d.createTexture({size:[w,h],format:'rgba8unorm',
   usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
  if(this.ci)this.offscreen=d.createTexture({size:[w,h],format:'rgba8unorm',
   usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  else{
   this.canvas.width=w;this.canvas.height=h;
   this.context.configure({device:d,format:this.format,alphaMode:'opaque'});
  }
  this.postBind=d.createBindGroup({layout:this.post.getBindGroupLayout(0),entries:[
   {binding:0,resource:{buffer:this.postUniform}},
   {binding:1,resource:this.hdr.createView()},
   {binding:2,resource:this.history.createView()}
  ]});
  this.presentBind=d.createBindGroup({layout:this.present.getBindGroupLayout(0),entries:[
   {binding:0,resource:this.postTex.createView()}
  ]});
  this.hasHistory=false;
 }
 upload(physics,camera,time){
  const s=this.s,d=this.device;
  d.queue.writeBuffer(this.storage,0,physics.packed());
  const envMode={studio:0,deepsea:1,night:2}[s.background];
  const viewMode={glass:0,normals:1,shape:2}[s.viewMode];
  const data=new Float32Array([
   this.width,this.height,time,this.width/this.height,
   ...camera.position,1.85,
   ...camera.right,envMode,
   ...camera.up,s.shell,
   ...camera.forward,s.hue,
   s.count,s.blend,s.shapeNoise,s.ior,
   s.refraction,s.dispersion,s.fresnel,s.surfaceRoughness,
   s.thickness,s.hue,s.saturation,s.bodyTint,
   s.specular,s.lightAngle,s.environment,s.rim,
   s.shellTint,.07,.18,viewMode
  ]);
  d.queue.writeBuffer(this.uniform,0,data);
  d.queue.writeBuffer(this.postUniform,0,new Float32Array([
   this.width,this.height,s.bloom,s.bloomRadius,
   s.exposure,this.hasHistory?s.trail:0,s.vignette,0
  ]));
 }
 async draw(physics,camera,time,readback=false){
  this.resize();this.upload(physics,camera,time);
  const d=this.device;
  d.pushErrorScope('validation');
  const encoder=d.createCommandEncoder();
  const pass=(view,pipeline,bind)=>{
   const p=encoder.beginRenderPass({colorAttachments:[{
    view,clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'
   }]});
   p.setPipeline(pipeline);p.setBindGroup(0,bind);p.draw(3);p.end();
  };
  pass(this.hdr.createView(),this.scene,this.sceneBind);
  pass(this.postTex.createView(),this.post,this.postBind);
  const output=this.ci?this.offscreen:this.context.getCurrentTexture();
  pass(output.createView(),this.present,this.presentBind);
  encoder.copyTextureToTexture({texture:this.postTex},{texture:this.history},[this.width,this.height]);
  let buffer;
  const stride=Math.ceil(this.width*4/256)*256;
  if(readback){
   if(!this.ci)throw Error('Readback only available under CI');
   buffer=d.createBuffer({size:stride*this.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
   encoder.copyTextureToBuffer({texture:output},
    {buffer,bytesPerRow:stride,rowsPerImage:this.height},[this.width,this.height]);
  }
  stage('submitted-work-wait');
  d.queue.submit([encoder.finish()]);
  if(readback){
   await d.queue.onSubmittedWorkDone();await buffer.mapAsync(GPUMapMode.READ);
   const bytes=new Uint8Array(buffer.getMappedRange());
   let brightness=0,brightPixels=0,centerEnergy=0;
   const rgba=new Uint8ClampedArray(this.width*this.height*4);
   for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
    const i=y*stride+x*4,j=(y*this.width+x)*4;
    const lum=bytes[i]+bytes[i+1]+bytes[i+2];brightness+=lum;
    if(lum>96)brightPixels++;
    if(x>this.width*.32&&x<this.width*.68&&y>this.height*.32&&y<this.height*.68)centerEnergy+=lum;
    rgba[j]=bytes[i];rgba[j+1]=bytes[i+1];rgba[j+2]=bytes[i+2];rgba[j+3]=255;
   }
   let c=document.getElementById('captureCanvas');
   if(!c){c=document.createElement('canvas');c.id='captureCanvas';c.style.cssText='position:fixed;top:0;left:0;z-index:5;image-rendering:pixelated';document.body.append(c);}
   c.width=this.width;c.height=this.height;c.getContext('2d').putImageData(new ImageData(rgba,this.width,this.height),0,0);
   this.lastPixels={brightness,brightPixels,centerEnergy,width:this.width,height:this.height};
   buffer.unmap();buffer.destroy();
  }
  stage('validation-scope');
  const error=await d.popErrorScope();if(error)throw Error('WebGPU validation '+error.message);
  this.hasHistory=true;this.frames++;
  return this.lastPixels;
 }
}
