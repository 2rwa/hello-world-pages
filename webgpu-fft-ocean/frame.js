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
  s.depth?.destroy();s.offscreen?.destroy();s.offscreenRead?.destroy();
  s.depth=device.createTexture({size:[w,h],format:'depth24plus',usage:T.RENDER_ATTACHMENT});
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
   s.entry(3,s.buffer(s.clipBuffers[level])),s.entry(4,s.normalView),s.entry(5,s.sampler)
  ]});
 }
 function drawGroup(){
  return device.createBindGroup({layout:s.renderBGL,entries:[
   s.entry(0,s.buffer(uniform)),s.entry(1,s.dispView),s.entry(2,s.normalView),
   s.entry(3,s.clips[0].views[s.clips[0].index].createView()),
   s.entry(4,s.clips[1].views[s.clips[1].index].createView()),s.entry(5,s.sampler)
  ]});
 }
 async function step(params,delta){
  const w=ci?640:Math.max(1,Math.round(canvas.clientWidth*Math.min(devicePixelRatio,1.5)));
  const h=ci?400:Math.max(1,Math.round(canvas.clientHeight*Math.min(devicePixelRatio,1.5)));
  if(!ci&&(canvas.width!==w||canvas.height!==h)){canvas.width=w;canvas.height=h;}
  resize(w,h);
  device.queue.writeBuffer(uniform,0,params);
  const encoder=device.createCommandEncoder();
  report('FFT-dispatch');
  compute(encoder,s.evolve,s.baseGroup,resolution/8,resolution/8,5);
  compute(encoder,s.rows,s.baseGroup,1,resolution,5);
  compute(encoder,s.columns,s.baseGroup,1,resolution,5);
  compute(encoder,s.normals,s.baseGroup,resolution/8,resolution/8,5);
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
  const readNow=s.frame++%12===0&&!s.pending;
  if(readNow){
   compute(encoder,s.buoyPipe,s.buoyGroup,1);
   encoder.copyBufferToBuffer(s.buoyBuffer,0,s.buoyRead,0,128);
   s.pending=true;
  }
  report('render');
  const target=ci?s.offscreen.createView():context.getCurrentTexture().createView();
  const pass=encoder.beginRenderPass({colorAttachments:[{view:target,
   clearValue:{r:0.06,g:0.16,b:0.3,a:1},loadOp:'clear',storeOp:'store'}],
   depthStencilAttachment:{view:s.depth.createView(),depthClearValue:1,
   depthLoadOp:'clear',depthStoreOp:'store'}});
  pass.setBindGroup(0,drawGroup());
  pass.setPipeline(s.skyPipe);pass.draw(3);
  pass.setPipeline(s.oceanPipe);pass.draw(6*(s.grid-1)*(s.grid-1));
  pass.setPipeline(s.ballPipe);pass.draw(6*40*24);
  pass.end();
  const pitch=Math.ceil(w*4/256)*256;
  if(ci)encoder.copyTextureToBuffer({texture:s.offscreen},
    {buffer:s.offscreenRead,bytesPerRow:pitch},{width:w,height:h});
  device.pushErrorScope('validation');
  device.queue.submit([encoder.finish()]);
  const probeReadback=readNow?s.buoyRead.mapAsync(GPUMapMode.READ).then(()=>{
    const floats=new Float32Array(s.buoyRead.getMappedRange().slice(0,108));
    s.boatHeight=floats.reduce((a,b)=>a+b,0)/floats.length;
    s.probes=floats.length;s.buoyRead.unmap();s.pending=false;
   }).catch(e=>{s.pending=false;report('readback: '+e.message)}):null;
  if(ci){
   report('submitted-work-wait');await device.queue.onSubmittedWorkDone();
   if(probeReadback)await probeReadback;
   const err=await device.popErrorScope();if(err)throw Error('WebGPU validation: '+err.message);
   await s.offscreenRead.mapAsync(GPUMapMode.READ);
   const bytes=new Uint8Array(s.offscreenRead.getMappedRange());
   const center=(Math.floor(h/2)*pitch+Math.floor(w/2)*4);
   const rgba=Array.from(bytes.slice(center,center+4));
   s.offscreenRead.unmap();
   if(rgba[3]!==255)throw Error('Offscreen readback alpha invalid: '+rgba);
   return {rgba,boatHeight:s.boatHeight,probes:s.probes};
  }
  const err=await device.popErrorScope();if(err)throw Error('WebGPU validation: '+err.message);
  return {boatHeight:s.boatHeight,probes:s.probes};
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
 return {device,step,resetWake,get height(){return s.boatHeight;},get probes(){return s.probes;}};
}