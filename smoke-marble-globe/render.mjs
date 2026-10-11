import {CAPACITY} from './physics.mjs';
const markStage=stage=>document.documentElement.dataset.webgpuStage=stage;
function validateShader(info,name){const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(name+' WGSL: '+errors.map(e=>e.lineNum+':'+e.linePos+' '+e.message).join('\n'));}
const over={color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
export class SmokeGPU{
 constructor(canvas,state,ci=false){this.canvas=canvas;this.s=state;this.ci=ci;this.width=0;this.height=0;this.qualityScale=state.resolution;this.hasHistory=false;this.frame=0;this.lastCapture=null;}
 async initialize(){
  const root=document.documentElement;
  markStage('request-adapter');
  if(!navigator.gpu)throw Error('WebGPU unavailable');
  this.adapter=await navigator.gpu.requestAdapter();if(!this.adapter)throw Error('WebGPU adapter unavailable');
  markStage('request-device');
  this.device=await this.adapter.requestDevice();const d=this.device;
  d.lost.then(i=>{root.dataset.webgpuLost=i.reason+' '+i.message;if(i.reason!=='destroyed')root.dataset.webgpuStatus='error';});
  d.addEventListener('uncapturederror',e=>{root.dataset.webgpuStatus='error';root.dataset.webgpuError=e.error.message;});
  this.format=this.ci?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
  if(!this.ci){this.context=this.canvas.getContext('webgpu');if(!this.context)throw Error('No WebGPU context');}
  this.sceneUniform=d.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.postUniform=d.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.particleBuffer=d.createBuffer({size:CAPACITY*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const names=['scene.wgsl','post.wgsl','present.wgsl'];
  const shaderSources=await Promise.all(names.map(async name=>{
   const req=await fetch('./shaders/'+name);if(!req.ok)throw Error('Shader HTTP '+req.status+' '+name);return req.text();
  }));
  markStage('shader-compilation-info');
  const modules=shaderSources.map(code=>d.createShaderModule({code}));
  for(let i=0;i<modules.length;i++)validateShader(await modules[i].getCompilationInfo(),names[i]);
  markStage('create-pipeline');
  const tri={topology:'triangle-list'};
  const build=(vertex,fragment,format,blend)=>d.createRenderPipelineAsync({
   layout:'auto',vertex:{module:modules[0],entryPoint:vertex},fragment:{module:modules[0],entryPoint:fragment,targets:[{format,...(blend?{blend}: {})}]},primitive:tri
  });
  [this.background,this.fog,this.shell]=await Promise.all([
   build('screenVertex','backdrop','rgba16float'),
   build('quadVertex','smoke','rgba16float',over),
   build('screenVertex','glassFront','rgba16float',over)
  ]);
  this.post=await d.createRenderPipelineAsync({layout:'auto',vertex:{module:modules[1],entryPoint:'vertexMain'},
   fragment:{module:modules[1],entryPoint:'fragmentMain',targets:[{format:'rgba8unorm'}]},primitive:tri});
  this.present=await d.createRenderPipelineAsync({layout:'auto',vertex:{module:modules[2],entryPoint:'vertexMain'},
   fragment:{module:modules[2],entryPoint:'fragmentMain',targets:[{format:this.format}]},primitive:tri});
  const sceneEntries=[{binding:0,resource:{buffer:this.sceneUniform}},{binding:1,resource:{buffer:this.particleBuffer}}];
  this.backBind=d.createBindGroup({layout:this.background.getBindGroupLayout(0),entries:sceneEntries.filter(e=>e.binding===0)});
  this.fogBind=d.createBindGroup({layout:this.fog.getBindGroupLayout(0),entries:sceneEntries});
  this.shellBind=d.createBindGroup({layout:this.shell.getBindGroupLayout(0),entries:sceneEntries.filter(e=>e.binding===0)});
  this.ready=true;this.resize();
 }
 resize(){
  if(!this.ready)return;
  const s=this.s;
  const dpr=Math.min(devicePixelRatio||1,this.ci?1:1.75);
  const baseW=this.ci?320:Math.max(1,this.canvas.clientWidth);
  const baseH=this.ci?240:Math.max(1,this.canvas.clientHeight);
  const quality={low:.4,medium:.62,high:.82,ultra:1};
  const scale=s.quality==='auto'?Math.min(s.resolution,this.qualityScale):quality[s.quality];
  const cap=this.ci?256:1920;
  const factor=Math.min(1,cap/Math.max(baseW,baseH));
  const w=Math.max(8,Math.round(baseW*dpr*scale*factor/2)*2),h=Math.max(8,Math.round(baseH*dpr*scale*factor/2)*2);
  if(this.width===w&&this.height===h)return;
  this.width=w;this.height=h;
  for(const key of ['hdr','postTex','history','offscreen'])this[key]?.destroy();
  const d=this.device;
  this.hdr=d.createTexture({size:[w,h],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
  this.postTex=d.createTexture({size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
  this.history=d.createTexture({size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
  if(this.ci)this.offscreen=d.createTexture({size:[w,h],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  else{this.canvas.width=w;this.canvas.height=h;this.context.configure({device:d,format:this.format,alphaMode:'opaque'});}
  this.postBind=d.createBindGroup({layout:this.post.getBindGroupLayout(0),entries:[
   {binding:0,resource:{buffer:this.postUniform}},{binding:1,resource:this.hdr.createView()},{binding:2,resource:this.history.createView()}
  ]});
  this.presentBind=d.createBindGroup({layout:this.present.getBindGroupLayout(0),entries:[{binding:0,resource:this.postTex.createView()}]});
  this.hasHistory=false;
 }
 upload(sim,camera,time){
  const s=this.s;
  const packed=sim.sorted(camera);
  this.device.queue.writeBuffer(this.particleBuffer,0,packed);
  const values=new Float32Array([
   this.width,this.height,time,this.width/this.height,
   ...camera.position,1.85,
   ...camera.right,s.hueA,
   ...camera.up,s.hueB,
   ...camera.forward,s.saturation,
   s.opacity,s.softness,s.noise,s.wisp,
   s.core,s.lightIntensity,s.lightAngle,s.impactGlow,
   s.shellOpacity,s.shellTint,s.phaseRatio,s.count
  ]);
  this.device.queue.writeBuffer(this.sceneUniform,0,values);
  this.device.queue.writeBuffer(this.postUniform,0,new Float32Array([
   this.width,this.height,s.bloom,s.bloomRadius,s.exposure,this.hasHistory?s.trail:0,s.vignette,0
  ]));
 }
 async draw(sim,camera,time,readback=false){
  this.resize();this.upload(sim,camera,time);
  const d=this.device;d.pushErrorScope('validation');
  const encoder=d.createCommandEncoder();
  let pass=encoder.beginRenderPass({colorAttachments:[{
   view:this.hdr.createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'
  }]});
  pass.setPipeline(this.background);pass.setBindGroup(0,this.backBind);pass.draw(3);
  pass.setPipeline(this.fog);pass.setBindGroup(0,this.fogBind);pass.draw(6,sim.s.count);
  pass.setPipeline(this.shell);pass.setBindGroup(0,this.shellBind);pass.draw(3);pass.end();
  const fullPass=(target,pipeline,bind)=>{
   const p=encoder.beginRenderPass({colorAttachments:[{view:target,loadOp:'clear',clearValue:{r:0,g:0,b:0,a:1},storeOp:'store'}]});
   p.setPipeline(pipeline);p.setBindGroup(0,bind);p.draw(3);p.end();
  };
  fullPass(this.postTex.createView(),this.post,this.postBind);
  const output=this.ci?this.offscreen:this.context.getCurrentTexture();
  fullPass(output.createView(),this.present,this.presentBind);
  encoder.copyTextureToTexture({texture:this.postTex},{texture:this.history},[this.width,this.height]);
  let readBuffer;
  const stride=Math.ceil(this.width*4/256)*256;
  if(readback){
   if(!this.ci)throw Error('Readback only available in CI');
   readBuffer=d.createBuffer({size:stride*this.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
   encoder.copyTextureToBuffer({texture:output},{buffer:readBuffer,bytesPerRow:stride,rowsPerImage:this.height},[this.width,this.height]);
  }
  markStage('submitted-work-wait');d.queue.submit([encoder.finish()]);
  if(readback){
   await d.queue.onSubmittedWorkDone();await readBuffer.mapAsync(GPUMapMode.READ);
   const data=new Uint8Array(readBuffer.getMappedRange());
   let brightness=0,nonblack=0;const image=new Uint8ClampedArray(this.width*this.height*4);
   for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
    const p=y*stride+x*4,n=(y*this.width+x)*4;
    const total=data[p]+data[p+1]+data[p+2];brightness+=total;if(total>36)nonblack++;
    image[n]=data[p];image[n+1]=data[p+1];image[n+2]=data[p+2];image[n+3]=255;
   }
   if(this.ci){let capture=document.getElementById('debug-capture');
    if(!capture){capture=document.createElement('canvas');capture.id='debug-capture';capture.style.cssText='position:fixed;left:4px;top:4px;z-index:6;image-rendering:pixelated';document.body.append(capture);}
    capture.width=this.width;capture.height=this.height;capture.getContext('2d').putImageData(new ImageData(image,this.width,this.height),0,0);
   }
   this.lastCapture={brightness,nonblack,width:this.width,height:this.height,coverage:nonblack/(this.width*this.height)};
   readBuffer.unmap();readBuffer.destroy();
  }
  markStage('validation-scope');const error=await d.popErrorScope();if(error)throw Error('WebGPU: '+error.message);
  this.frame++;this.hasHistory=true;return this.lastCapture;
 }
}
