const U=GPUBufferUsage,T=GPUTextureUsage;
export function makeFrame(s) {
 const {device,canvas,context,format,resolution,ci,report,uniform}=s;
 function compute(encoder,pipeline,bg,x,y=1,z=1){
  const pass=encoder.beginComputePass();
  pass.setPipeline(pipeline);pass.setBindGroup(0,bg);pass.dispatchWorkgroups(x,y,z);pass.end();
 }
 function resize(w,h){
  if(s.dim.w===w&&s.dim.h===h&&s.depth)return;
  s.dim={w,h};
  s.depth?.destroy();s.scene?.destroy();s.offscreen?.destroy();s.offscreenRead?.destroy();
  s.scene=device.createTexture({size:[w,h],format,usage:T.RENDER_ATTACHMENT|T.TEXTURE_BINDING});
  s.depth=device.createTexture({size:[w,h],format:'depth24plus',usage:T.RENDER_ATTACHMENT|T.TEXTURE_BINDING});
  if(ci){
   s.offscreen=device.createTexture({size:[w,h],format,usage:T.RENDER_ATTACHMENT|T.COPY_SRC});
   const pitch=Math.ceil(w*4/256)*256;
   s.offscreenRead=device.createBuffer({size:pitch*h,usage:U.COPY_DST|U.MAP_READ});
  }
 }
 function foamGroup(level) {
  const clip=s.clips[level];
  return device.createBindGroup({layout:s.foamBGL,entries:[
   s.entry(0,s.buffer(uniform)),s.entry(1,clip.views[clip.index].createView()),
   s.entry(2,clip.views[1-clip.index].createView()),
   s.entry(3,s.buffer(s.clipBuffers[level])),s.entry(4,s.normalView),s.entry(5,s.sampler),
   s.entry(6,s.buffer(s.wakeSettings))
  ]});
 }
 function drawGroup(){
  return device.createBindGroup({layout:s.renderBGL,entries:[
   s.entry(0,s.buffer(uniform)),s.entry(1,s.dispView),s.entry(2,s.normalView),
   s.entry(3,s.clips[0].views[s.clips[0].index].createView()),
   s.entry(4,s.clips[1].views[s.clips[1].index].createView()),s.entry(5,s.sampler)
  ]});
 }
 async function step(params,delta,controls={}){
  const w=ci?640:Math.max(1,Math.round(canvas.clientWidth*Math.min(devicePixelRatio,1.5)));
  const h=ci?400:Math.max(1,Math.round(canvas.clientHeight*Math.min(devicePixelRatio,1.5)));
  if(!ci&&(canvas.width!==w||canvas.height!==h)){canvas.width=w;canvas.height=h;}
  resize(w,h);
  device.queue.writeBuffer(uniform,0,params);
  device.queue.writeBuffer(s.sprayOptions,0,new Float32Array([delta,controls.spray??1.0,controls.slam??0.2,h]));
  device.queue.writeBuffer(s.wakeSettings,0,new Float32Array([controls.lace??1.0,0,0,0]));
  const am=controls.amoeba||{};
  const count=am.count??3;
  device.queue.writeBuffer(s.amoeba.options,0,new Float32Array([
   count,am.blend??2.0,am.ior??1.48,am.absorption??0.8,
   am.wobble??0.65,am.stretch??1.0,am.bounces??1,am.steps??64,
   am.emission??0.25,am.opacity??0.95,0.0,count<=3?8.6:12.7
  ]));
  const encoder=device.createCommandEncoder();
  report('FFT-dispatch');
  compute(encoder,s.evolve,s.baseGroup,resolution/8,resolution/8,5);
  compute(encoder,s.rows,s.baseGroup,1,resolution,5);
  compute(encoder,s.columns,s.baseGroup,1,resolution,5);
  compute(encoder,s.normals,s.normalGroup,resolution/8,resolution/8,5);
  for(let l=0;l<s.numMips-1;l++){
   compute(encoder,s.mip,s.mipGroups[l],Math.max(1,Math.ceil((resolution/2**(l+1))/8)),
   Math.max(1,Math.ceil((resolution/2**(l+1))/8)),5);
  }
  report('foam-dispatch');
  for(let c=0;c<2;c++){
   const clip=s.clips[c];
   device.queue.writeBuffer(s.clipBuffers[c],0,new Float32Array([
    clip.meters,clip.center[0],clip.center[1],delta
   ]));
   compute(encoder,s.foamPipe,foamGroup(c),s.fv/8,s.fv/8);
   clip.center=[params[20],params[22]];
   clip.index=1-clip.index;
  }
  compute(encoder,s.sprayComputePipe,s.sprayComputeGroup,Math.ceil(s.particleCount/64));
  const readNow=s.frame++%12===0&&!s.pending;
  if(readNow){
   compute(encoder,s.buoyPipe,s.buoyGroup,1);
   encoder.copyBufferToBuffer(s.buoyBuffer,0,s.buoyRead,0,128);
   s.pending=true;
  }
  report('render');
  const target=ci?s.offscreen.createView():context.getCurrentTexture().createView();
  // Pass A: opaque ocean, sky, and translucent spray in an offscreen scene.
  const pass=encoder.beginRenderPass({colorAttachments:[{view:s.scene.createView(),
   clearValue:{r:0.06,g:0.16,b:0.3,a:1},loadOp:'clear',storeOp:'store'}],
   depthStencilAttachment:{view:s.depth.createView(),depthClearValue:1,
   depthLoadOp:'clear',depthStoreOp:'store'}});
  pass.setBindGroup(0,drawGroup());
  pass.setPipeline(s.skyPipe);pass.draw(3);
  pass.setPipeline(s.oceanPipe);pass.draw(6*(s.grid-1)*(s.grid-1));
  pass.setBindGroup(0,s.sprayRenderGroup);
  pass.setPipeline(s.sprayRenderPipe);pass.draw(6*s.particleCount);
  pass.end();
  // Pass B: cheap analytic bound first; march only camera rays through the amoeba.
  const sceneBind=device.createBindGroup({layout:s.amoeba.amoebaBGL,entries:[
   s.entry(0,s.buffer(uniform)),s.entry(1,s.buffer(s.amoeba.options)),
   s.entry(2,s.buffer(s.amoeba.sphereBuffer)),s.entry(3,s.scene.createView()),
   s.entry(4,s.depth.createView()),s.entry(5,s.amoeba.sampler)
  ]});
  const composite=encoder.beginRenderPass({colorAttachments:[{view:target,
   clearValue:{r:0.0,g:0.0,b:0.0,a:1},loadOp:'clear',storeOp:'store'}]});
  composite.setPipeline(s.amoeba.pipeline);
  composite.setBindGroup(0,sceneBind);
  composite.draw(3);
  composite.end();
  const pitch=Math.ceil(w*4/256)*256;
  if(ci)encoder.copyBufferToBuffer(s.particleBuffer,0,s.sprayRead,0,s.particleCount*48);
  if(ci)encoder.copyTextureToBuffer({texture:s.offscreen},
    {buffer:s.offscreenRead,bytesPerRow:pitch},{width:w,height:h});
  device.pushErrorScope('validation');
  device.queue.submit([encoder.finish()]);
  const probeReadback=readNow?s.buoyRead.mapAsync(GPUMapMode.READ).then(()=>{
    const floats=new Float32Array(s.buoyRead.getMappedRange().slice(0,108));
    s.boatHeight=floats.reduce((a,b)=>a+b,0)/floats.length;
    const mean=(indices)=>indices.reduce((a,i)=>a+floats[i],0)/indices.length;
    // Probe order is 9 lateral x 3 longitudinal on the sphere's projected footprint.
    const port=mean([0,9,18]),starboard=mean([8,17,26]);
    const stern=mean([0,1,2,3,4,5,6,7,8]);
    const bow=mean([18,19,20,21,22,23,24,25,26]);
    s.roll=Math.atan2(starboard-port,7.4);
    s.pitch=Math.atan2(bow-stern,7.4);
    s.probes=floats.length;s.buoyRead.unmap();s.pending=false;
   }).catch(e=>{s.pending=false;report('readback: '+e.message)}):null;
  if(ci){
   report('submitted-work-wait');await device.queue.onSubmittedWorkDone();
   if(probeReadback)await probeReadback;
   const err=await device.popErrorScope();if(err)throw Error('WebGPU validation: '+err.message);
   await s.sprayRead.mapAsync(GPUMapMode.READ);
   const packedParticles=new Float32Array(s.sprayRead.getMappedRange());
   let particlesAlive=0, visibleParticles=0, aboveWater=0;
   let maxParticleHeight=-1e9,minParticleHeight=1e9;
   for(let i=0;i<s.particleCount;i++){
    const stride=i*12,age=packedParticles[stride+3],life=packedParticles[stride+7];
    if(age>=0&&age<life&&life>0){
     particlesAlive++;
     const x=packedParticles[stride],y=packedParticles[stride+1],z=packedParticles[stride+2];
     maxParticleHeight=Math.max(maxParticleHeight,y);
     minParticleHeight=Math.min(minParticleHeight,y);
     if(y>s.boatHeight)aboveWater++;
     const cx=params[0]*x+params[4]*y+params[8]*z+params[12];
     const cy=params[1]*x+params[5]*y+params[9]*z+params[13];
     const cz=params[2]*x+params[6]*y+params[10]*z+params[14];
     const cw=params[3]*x+params[7]*y+params[11]*z+params[15];
     if(cw>0&&Math.abs(cx)<cw&&Math.abs(cy)<cw&&cz>=0&&cz<cw) visibleParticles++;
    }
   }
   s.sprayRead.unmap();
   await s.offscreenRead.mapAsync(GPUMapMode.READ);
   const bytes=new Uint8Array(s.offscreenRead.getMappedRange());
   const center=(Math.floor(h/2)*pitch+Math.floor(w/2)*4);
   const rgba=Array.from(bytes.slice(center,center+4));
   // CI-only presentation of the exact GPU offscreen image for visual regression.
   const rgbaPixels=new Uint8ClampedArray(w*h*4);
   for(let row=0;row<h;row++){
    rgbaPixels.set(bytes.subarray(row*pitch,row*pitch+w*4),row*w*4);
   }
   const sky=Array.from(rgbaPixels.slice((w*10+Math.floor(w/2))*4,(w*10+Math.floor(w/2))*4+4));
   const water=Array.from(rgbaPixels.slice((w*(h-30)+Math.floor(w/2))*4,(w*(h-30)+Math.floor(w/2))*4+4));
   s.offscreenRead.unmap();
   canvas.width=w;canvas.height=h;
   canvas.getContext('2d').putImageData(new ImageData(rgbaPixels,w,h),0,0);
   if(rgba[3]!==255)throw Error('Offscreen readback alpha invalid: '+rgba);
   if(sky.join(',')===water.join(','))throw Error('Offscreen image lacks sky/water separation');
   return {rgba,sky,water,particlesAlive,visibleParticles,aboveWater,maxParticleHeight,minParticleHeight,particleCount:s.particleCount,boatHeight:s.boatHeight,roll:s.roll||0,pitch:s.pitch||0,probes:s.probes};
  }
  const err=await device.popErrorScope();if(err)throw Error('WebGPU validation: '+err.message);
  return {boatHeight:s.boatHeight,particleCount:s.particleCount,roll:s.roll||0,pitch:s.pitch||0,probes:s.probes};
 }
 function resetWake(){
  for(const clip of s.clips){
   clip.views.forEach(tex=>tex.destroy());
   clip.views=Array.from({length:2},()=>device.createTexture({
    size:[s.fv,s.fv],format:'rgba16float',usage:T.STORAGE_BINDING|T.TEXTURE_BINDING
   }));
   clip.index=0;clip.center=[0,0];
  }
 }
 return {device,step,resetWake,get height(){return s.boatHeight;},get roll(){return s.roll||0;},get pitch(){return s.pitch||0;},get probes(){return s.probes;}};
}