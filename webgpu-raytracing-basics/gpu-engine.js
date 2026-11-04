/* WebGPU ray tracer: the same WGSL compute + fullscreen render pipelines are used
 * on the visible canvas and in CI's offscreen render target. No CPU pixel fallback.
 */
'use strict';
(function (global) {
  async function inspectShader(device, module, label) {
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter(item => item.type === 'error');
    if (errors.length) {
      throw new Error(label + ': ' + errors.map(item =>
        'line ' + item.lineNum + ':' + item.linePos + ' ' + item.message).join('; '));
    }
    return info.messages.length;
  }
  async function loadShader(file) {
    const response=await fetch(file,{cache:'no-cache'});
    if(!response.ok)throw new Error(file + ' HTTP ' + response.status);
    return response.text();
  }
  function packUniforms({width,height,yaw,reflections,shadows,brightness}) {
    // WGSL CameraParams: vec2u(0), f32(8), u32(12), u32(16), f32(20), vec2u(24).
    const bytes=new ArrayBuffer(32), view=new DataView(bytes);
    view.setUint32(0,width,true);
    view.setUint32(4,height,true);
    view.setFloat32(8,yaw*Math.PI/180,true);
    view.setUint32(12,reflections,true);
    view.setUint32(16,shadows?1:0,true);
    view.setFloat32(20,brightness,true);
    return bytes;
  }
  async function create({canvas,offscreen=false,onStage=()=>{}}) {
    if(!navigator.gpu)throw new Error('WebGPU APIが使えません（HTTPSとブラウザ対応を確認）');
    onStage('request-adapter');
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter)throw new Error('GPUAdapterを取得できません');
    onStage('request-device');
    const device=await adapter.requestDevice();
    let lost=false;
    device.lost.then(info=>{
      lost=true;
      onStage('device-lost: ' + info.reason + ' ' + info.message);
    });
    device.addEventListener('uncapturederror',event=>{
      onStage('uncaptured-error: ' + event.error.message);
    });
    const context=offscreen?null:canvas.getContext('webgpu');
    if(!offscreen&&!context)throw new Error('CanvasのWebGPUコンテキストを取得できません');
    const presentFormat=offscreen?'bgra8unorm':navigator.gpu.getPreferredCanvasFormat();
    if(context)context.configure({device,format:presentFormat,alphaMode:'opaque'});
    const shaderSources=await Promise.all([loadShader('raytrace.wgsl'),loadShader('present.wgsl')]);
    onStage('shader-compilation-info');
    device.pushErrorScope('validation');
    let computePipeline,renderPipeline;
    try {
      const computeModule=device.createShaderModule({label:'ray intersection shader',code:shaderSources[0]});
      const presentModule=device.createShaderModule({label:'ray display shader',code:shaderSources[1]});
      await inspectShader(device,computeModule,'raytrace.wgsl');
      await inspectShader(device,presentModule,'present.wgsl');
      onStage('create-pipeline');
      [computePipeline,renderPipeline]=await Promise.all([
        device.createComputePipelineAsync({layout:'auto',compute:{module:computeModule,entryPoint:'tracePixels'}}),
        device.createRenderPipelineAsync({
          layout:'auto',
          vertex:{module:presentModule,entryPoint:'fullscreenVertex'},
          fragment:{module:presentModule,entryPoint:'fullscreenFragment',targets:[{format:presentFormat}]},
          primitive:{topology:'triangle-list'}
        })
      ]);
    } finally {
      const scopeError=await device.popErrorScope();
      if(scopeError)throw new Error('WebGPU pipeline validation: '+scopeError.message);
    }
    const uniformBuffer=device.createBuffer({
      size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,
      label:'CameraParams uniforms'
    });
    let imageTexture=null,imageSize='',renderCount=0;
    async function render(settings,{readback=false}={}) {
      if(lost)throw new Error('GPUDeviceが失われました');
      const {width,height}=settings;
      if(width<1||height<1||width%64!==0)throw new Error('描画幅は64の倍数が必要');
      if(width>device.limits.maxTextureDimension2D||height>device.limits.maxTextureDimension2D)
        throw new Error('端末の最大テクスチャサイズを超えました');
      const dims=width+'x'+height;
      if(imageSize!==dims) {
        if(imageTexture)imageTexture.destroy();
        imageTexture=device.createTexture({
          label:'Compute output rgba8unorm',
          size:[width,height],
          format:'rgba8unorm',
          usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC
        });
        imageSize=dims;
        if(canvas){canvas.width=width;canvas.height=height;}
      }
      const computeGroup=device.createBindGroup({
        layout:computePipeline.getBindGroupLayout(0),
        entries:[
          {binding:0,resource:{buffer:uniformBuffer}},
          {binding:1,resource:imageTexture.createView()}
        ]
      });
      const presentGroup=device.createBindGroup({
        layout:renderPipeline.getBindGroupLayout(0),
        entries:[{binding:0,resource:imageTexture.createView()}]
      });
      const targetTexture=offscreen?device.createTexture({
        label:'CI offscreen presentation',
        size:[width,height],format:presentFormat,
        usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC
      }):context.getCurrentTexture();
      const readBuffer=readback?device.createBuffer({
        size:width*height*4,
        usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,
        label:'CI RGBA pixel readback'
      }):null;
      const start=performance.now();
      device.queue.writeBuffer(uniformBuffer,0,packUniforms(settings));
      onStage('encode-compute-and-render');
      device.pushErrorScope('validation');
      let validationError=null;
      try {
        const encoder=device.createCommandEncoder({label:'Compute ray + fullscreen present'});
        const compute=encoder.beginComputePass();
        compute.setPipeline(computePipeline);
        compute.setBindGroup(0,computeGroup);
        compute.dispatchWorkgroups(Math.ceil(width/8),Math.ceil(height/8));
        compute.end();
        const renderPass=encoder.beginRenderPass({
          colorAttachments:[{
            view:targetTexture.createView(),
            clearValue:{r:0,g:0,b:0,a:1},
            loadOp:'clear',storeOp:'store'
          }]
        });
        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0,presentGroup);
        renderPass.draw(3);
        renderPass.end();
        if(readBuffer) {
          encoder.copyTextureToBuffer(
            {texture:targetTexture},
            {buffer:readBuffer,bytesPerRow:width*4,rowsPerImage:height},
            [width,height]
          );
        }
        device.queue.submit([encoder.finish()]);
        onStage('submitted-work-wait');
        await device.queue.onSubmittedWorkDone();
      } finally {
        validationError=await device.popErrorScope();
      }
      if(validationError)throw new Error('WebGPU render validation: '+validationError.message);
      let pixelData=null;
      if(readBuffer) {
        onStage('readback');
        // New staging buffer for each render: no overlapping mapAsync on one buffer.
        await readBuffer.mapAsync(GPUMapMode.READ);
        pixelData=new Uint8Array(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();
        readBuffer.destroy();
      }
      if(offscreen)targetTexture.destroy();
      const wallMs=performance.now()-start;
      renderCount++;
      onStage('done');
      return {width,height,wallMs,renderCount,pixelData,presentFormat};
    }
    return {render,device,presentFormat,offscreen};
  }
  global.WebGPURayEngine={create,packUniforms};
})(window);
