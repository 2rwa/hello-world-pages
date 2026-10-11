import {MAX_PARTICLES} from './physics.mjs';
const stage=message=>document.documentElement.dataset.webgpuStage=message;
function throwIfErrors(info,label){const errors=info.messages.filter(msg=>msg.type==='error');if(errors.length)throw new Error(`${label}: ${errors.map(e=>`${e.lineNum}:${e.linePos} ${e.message}`).join('\n')}`);}
export class GPUView {
 constructor(canvas,settings,offscreen){this.canvas=canvas;this.s=settings;this.ci=offscreen;this.width=0;this.height=0;this.qualityScale=settings.resolution;this.frame=0;this.hasHistory=false;this.lastCapture=null;}
 async initialize(){
  stage('request-adapter');if(!navigator.gpu)throw Error('WebGPU not available');
  this.adapter=await navigator.gpu.requestAdapter();if(!this.adapter)throw Error('No WebGPU adapter');
  stage('request-device');this.device=await this.adapter.requestDevice();const device=this.device;
  device.lost.then(info=>{document.documentElement.dataset.webgpuLost=`${info.reason}: ${info.message}`;if(info.reason!=='destroyed')document.documentElement.dataset.webgpuStatus='error';});
  device.addEventListener('uncapturederror',ev=>{document.documentElement.dataset.webgpuError=ev.error.message;document.documentElement.dataset.webgpuStatus='error';});
  this.format=navigator.gpu.getPreferredCanvasFormat();
  if(!this.ci){this.context=this.canvas.getContext('webgpu');if(!this.context)throw Error('Canvas WebGPU context unavailable');}
  this.uniform=device.createBuffer({size:160,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.postUniform=device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.particles=device.createBuffer({size:MAX_PARTICLES*8*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  this.ripples=device.createBuffer({size:8*8*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  stage('shader-compilation-info');
  const dir='./shaders/';const [core,scene,post,present]=await Promise.all(['scene-core.wgsl','scene-main.wgsl','post.wgsl','present.wgsl'].map(async f=>{const res=await fetch(dir+f);if(!res.ok)throw Error(`Shader ${f}: ${res.status}`);return res.text();}));
  const shaders=[core+'\n'+scene,post,present].map(code=>device.createShaderModule({code}));
  for(let k=0;k<shaders.length;k++){throwIfErrors(await shaders[k].getCompilationInfo(),['scene','post','present'][k]);}
  stage('create-pipeline');
  this.scenePipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:shaders[0],entryPoint:'vertexMain'},fragment:{module:shaders[0],entryPoint:'fragmentMain',targets:[{format:'rgba16float'}]},primitive:{topology:'triangle-list'}});
  this.postPipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:shaders[1],entryPoint:'postVertex'},fragment:{module:shaders[1],entryPoint:'postFragment',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}});
  this.presentPipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:shaders[2],entryPoint:'presentVertex'},fragment:{module:shaders[2],entryPoint:'presentFragment',targets:[{format:this.format}]},primitive:{topology:'triangle-list'}});
  this.sceneBind=device.createBindGroup({layout:this.scenePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.particles}},{binding:2,resource:{buffer:this.ripples}}]});
  this.ready=true;this.resize();
 }
 resize(){if(!this.ready)return;
  const dpr=Math.min(devicePixelRatio||1,this.s.maxDpr);
  const cssW=this.ci?this.ci.width:this.canvas.clientWidth;const cssH=this.ci?this.ci.height:this.canvas.clientHeight;
  let scale=this.s.quality==='auto'?this.qualityScale:({low:.45,medium:.65,high:.85,ultra:1}[this.s.quality]);
  if(this.s.quality==='auto')scale=Math.min(scale,this.s.resolution);
  const maxDim=this.ci?128:2048;
  const factor=Math.min(1,maxDim/Math.max(cssW,cssH));
  const w=Math.max(8,Math.round(cssW*dpr*scale*factor/2)*2),h=Math.max(8,Math.round(cssH*dpr*scale*factor/2)*2);
  if(this.width===w&&this.height===h)return;
  this.width=w;this.height=h;const device=this.device;
  this.hdr?.destroy();this.postTex?.destroy();this.historyTex?.destroy();this.target?.destroy();
  this.hdr=device.createTexture({size:[w,h],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
  this.postTex=device.createTexture({size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
  this.historyTex=device.createTexture({size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
  if(this.ci){this.target=device.createTexture({size:[w,h],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});}
  else {this.canvas.width=w;this.canvas.height=h;this.context.configure({device,format:this.format,alphaMode:'opaque'});}
  this.postBind=device.createBindGroup({layout:this.postPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.postUniform}},{binding:1,resource:this.hdr.createView()},{binding:2,resource:this.historyTex.createView()}]});
  this.presentBind=device.createBindGroup({layout:this.presentPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.postTex.createView()}]});
  this.hasHistory=false;
 }
 upload(sim,camera,clock){
  const s=this.s;this.device.queue.writeBuffer(this.particles,0,sim.data);
  this.device.queue.writeBuffer(this.ripples,0,sim.gpuRipples());
  const param=new Float32Array(40);
  let i=0;const put=(...vals)=>{param.set(vals,i);i+=4;};
  put(this.width,this.height,clock,s.count);
  put(...camera.position,s.threshold);
  put(...camera.right,s.amplitude);
  put(...camera.up,s.opacity);
  put(...camera.forward,camera.distance);
  put(s.glow,s.cloudDensity,s.shellOpacity,s.colorShift);
  put(s.colorMix,s.roughness,s.specular,{gel:0,glass:1,plasma:2}[s.material]);
  put({solid:0,cloud:1,hybrid:2,debug:3}[s.mode],s.ior,s.refraction,s.shellTint);
  put(s.ripple,s.rippleFrequency,s.rippleSpeed,s.collisionGlow);
  put(s.lightOrbit,clock,s.marchSteps,s.rayCull==='on'?1:0);
  this.device.queue.writeBuffer(this.uniform,0,param);
  const post=new Float32Array([this.width,this.height,s.bloom,0,s.bloomRadius,s.bloomThreshold,s.exposure,this.hasHistory?s.trail:0,s.vignette,0,0,0]);
  this.device.queue.writeBuffer(this.postUniform,0,post);
 }
 async draw(sim,camera,clock,readback=false){
  const device=this.device;this.resize();this.upload(sim,camera,clock);device.pushErrorScope('validation');
  const encoder=device.createCommandEncoder();
  const render=(pipeline,bind,view)=>{const pass=encoder.beginRenderPass({colorAttachments:[{view,loadOp:'clear',clearValue:{r:0,g:0,b:0,a:1},storeOp:'store'}]});pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.draw(3);pass.end();};
  render(this.scenePipeline,this.sceneBind,this.hdr.createView());
  render(this.postPipeline,this.postBind,this.postTex.createView());
  const finalView=this.ci?this.target.createView():this.context.getCurrentTexture().createView();
  render(this.presentPipeline,this.presentBind,finalView);
  encoder.copyTextureToTexture({texture:this.postTex},{texture:this.historyTex},[this.width,this.height]);
  let readBuffer;
  if(readback){const bytesPerRow=Math.ceil(this.width*4/256)*256;readBuffer=device.createBuffer({size:bytesPerRow*this.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});encoder.copyTextureToBuffer({texture:this.target},{buffer:readBuffer,bytesPerRow,rowsPerImage:this.height},[this.width,this.height]);}
  stage('validation-scope');device.queue.submit([encoder.finish()]);
  if(readback){await device.queue.onSubmittedWorkDone();await readBuffer.mapAsync(GPUMapMode.READ);const raw=new Uint8Array(readBuffer.getMappedRange());let nonblack=0,brightness=0;for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){const p=y* Math.ceil(this.width*4/256)*256+x*4;const v=raw[p]+raw[p+1]+raw[p+2];brightness+=v;if(v>28)nonblack++;}if(this.ci){const capture=document.getElementById('debug-capture')||document.createElement('canvas');capture.id='debug-capture';capture.width=this.width;capture.height=this.height;capture.style.cssText='position:fixed;inset:5px;z-index:3;width:auto;height:auto;image-rendering:pixelated';if(!capture.parentNode)document.body.append(capture);const ctx=capture.getContext('2d');const pixels=ctx.createImageData(this.width,this.height);const rowBytes=Math.ceil(this.width*4/256)*256;for(let yy=0;yy<this.height;yy++)pixels.data.set(raw.subarray(yy*rowBytes,yy*rowBytes+this.width*4),yy*this.width*4);ctx.putImageData(pixels,0,0);}readBuffer.unmap();readBuffer.destroy();this.lastCapture={nonblack,brightness,coverage:nonblack/(this.width*this.height),width:this.width,height:this.height};}
  const error=await device.popErrorScope();if(error)throw Error(`WebGPU validation: ${error.message}`);
  this.hasHistory=true;this.frame++;return this.lastCapture;
 }
}
