import {$,canvas,ciMode,state,mark,fail,makePackets} from './ui.js';
const RES=192;
async function boot() {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable. Use current Chrome / Edge / Safari with WebGPU enabled.');
  mark('ADAPTER');const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw new Error('No compatible WebGPU adapter was found.');
  mark('DEVICE');const device=await adapter.requestDevice();
  device.lost.then(info=>fail(new Error('GPU device lost: '+info.reason+' '+info.message)));
  device.addEventListener('uncapturederror',event=>fail(event.error));
  const format=navigator.gpu.getPreferredCanvasFormat();
  const context=ciMode?null:canvas.getContext('webgpu');
  if(!ciMode&&!context)throw new Error('Canvas WebGPU context unavailable.');
  if(context)context.configure({device,format,alphaMode:'opaque'});
  mark('SHADERS');
  const shaders=await Promise.all(['wave.wgsl','ocean.wgsl'].map(async(path)=>{const response=await fetch(path);if(!response.ok)throw new Error('Fetch failed '+path+' '+response.status);return response.text();}));
  const modules=shaders.map(code=>device.createShaderModule({code}));
  for(let i=0;i<modules.length;i++) {
    const info=await modules[i].getCompilationInfo();
    const errors=info.messages.filter(item=>item.type==='error');
    if(errors.length)throw new Error(['wave.wgsl','ocean.wgsl'][i]+' WGSL: '+errors.map(item=>item.lineNum+':'+item.linePos+' '+item.message).join('\n'));
  }
  mark('PIPELINES');device.pushErrorScope('validation');
  const parameterBuffer=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const packetData=makePackets();
  const packetBuffer=device.createBuffer({size:packetData.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(packetBuffer,0,packetData);
  const waveBuffers=Array.from({length:2},()=>device.createBuffer({size:RES*RES*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}));
  const clearData=new Uint8Array(RES*RES*16);
  for(const waveBuffer of waveBuffers)device.queue.writeBuffer(waveBuffer,0,clearData);
  const mapTexture=device.createTexture({size:[RES,RES],format:'rgba16float',usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
  const sampler=device.createSampler({addressModeU:'repeat',addressModeV:'repeat',magFilter:'linear',minFilter:'linear'});
  const updatePipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:modules[0],entryPoint:'update'}});
  const renderPipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:modules[1],entryPoint:'oceanVertex'},fragment:{module:modules[1],entryPoint:'oceanFragment',targets:[{format}]},primitive:{topology:'triangle-list'}});
  const updateGroups=Array.from({length:2},(_,i)=>device.createBindGroup({layout:updatePipeline.getBindGroupLayout(0),entries:[
    {binding:0,resource:{buffer:parameterBuffer}},{binding:1,resource:{buffer:packetBuffer}},
    {binding:2,resource:{buffer:waveBuffers[i]}},{binding:3,resource:{buffer:waveBuffers[1-i]}},
    {binding:4,resource:mapTexture.createView()}
  ]}));
  const renderGroup=device.createBindGroup({layout:renderPipeline.getBindGroupLayout(0),entries:[
    {binding:0,resource:{buffer:parameterBuffer}},{binding:1,resource:mapTexture.createView()},
    {binding:2,resource:sampler}
  ]});
  const pipelineError=await device.popErrorScope();if(pipelineError)throw new Error('Pipeline validation: '+pipelineError.message);
  let offscreen=null,screenWidth=0,screenHeight=0,parity=0,previousTS=null,lastFPS=performance.now(),frames=0;
  const gpuParams=new Float32Array(16);
  function resize() {
    if(ciMode){screenWidth=320;screenHeight=180;return;}
    const dpr=Math.min(devicePixelRatio||1,1.5),width=Math.max(1,Math.min(1920,Math.floor(canvas.clientWidth*dpr))),height=Math.max(1,Math.min(1200,Math.floor(canvas.clientHeight*dpr)));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    screenWidth=width;screenHeight=height;
  }
  resize();
  if(ciMode)offscreen=device.createTexture({size:[screenWidth,screenHeight],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  $('reset').addEventListener('click',()=>{state.simTime=0;state.frame=0;state.splashAge=1000;parity=0;for(const buffer of waveBuffers)device.queue.writeBuffer(buffer,0,clearData);});
  function draw(timestamp) {
    const dt=previousTS===null?0.016:Math.min(0.04,Math.max(0,(timestamp-previousTS)*0.001));previousTS=timestamp;
    resize();
    if(!state.paused || ciMode){state.simTime+=dt;state.splashAge+=dt;}
    gpuParams.set([state.simTime,state.seaState,state.chop,state.wind,
      state.foam,state.sun,state.yaw,state.pitch,
      state.cameraHeight,screenWidth/screenHeight,state.splashX,state.splashZ,
      state.splashAge,state.frame,state.gaussianView?1:0,0]);
    device.queue.writeBuffer(parameterBuffer,0,gpuParams);
    const encoder=device.createCommandEncoder();
    if(!state.paused || state.frame===0 || ciMode){
      const computePass=encoder.beginComputePass();computePass.setPipeline(updatePipeline);computePass.setBindGroup(0,updateGroups[parity]);computePass.dispatchWorkgroups(Math.ceil(RES/8),Math.ceil(RES/8));computePass.end();parity=1-parity;state.frame++;
    }
    const target=ciMode?offscreen.createView():context.getCurrentTexture().createView();
    const renderPass=encoder.beginRenderPass({colorAttachments:[{view:target,clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});
    renderPass.setPipeline(renderPipeline);renderPass.setBindGroup(0,renderGroup);renderPass.draw(3);renderPass.end();
    device.queue.submit([encoder.finish()]);
    frames++;
    if(timestamp-lastFPS>950){$('perf').textContent=Math.round(frames*1000/(timestamp-lastFPS))+' FPS';lastFPS=timestamp;frames=0;}
    if(!ciMode)requestAnimationFrame(draw);
  }
  if(ciMode){
    mark('SUBMITTED');device.pushErrorScope('validation');draw(performance.now());
    await device.queue.onSubmittedWorkDone();
    const submitError=await device.popErrorScope();if(submitError)throw new Error('GPU submit: '+submitError.message);
    const bytesPerRow=Math.ceil((screenWidth*4)/256)*256;
    const readBuffer=device.createBuffer({size:bytesPerRow*screenHeight,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const command=device.createCommandEncoder();command.copyTextureToBuffer({texture:offscreen},{buffer:readBuffer,bytesPerRow,rowsPerImage:screenHeight},[screenWidth,screenHeight]);device.queue.submit([command.finish()]);
    await device.queue.onSubmittedWorkDone();await readBuffer.mapAsync(GPUMapMode.READ);
    const pixels=new Uint8Array(readBuffer.getMappedRange());let checksum=0;
    for(let y=0;y<screenHeight;y+=13)for(let x=0;x<screenWidth;x+=13)for(let c=0;c<3;c++)checksum+=pixels[y*bytesPerRow+x*4+c];
    readBuffer.unmap();if(checksum<200)throw new Error('Rendered readback is blank: '+checksum);
    status.dataset.checksum=String(checksum);mark('OK · GPU', 'ok');document.documentElement.dataset.test='ok';
  } else {mark('GPU ACTIVE','ok');requestAnimationFrame(draw);}
}
boot().catch(fail);
