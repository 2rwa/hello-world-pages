import { shader } from './shader.js';

const root = document.documentElement;
const setStage = (stage, status = '') => {
  root.dataset.webgpuStage = stage;
  if (status) root.dataset.webgpuStatus = status;
};
const vecSub = (a,b) => a.map((v,i) => v-b[i]);
const vecDot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const vecCross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vecNorm = a => { const d=Math.hypot(...a)||1; return a.map(v=>v/d); };
function multiplyMatrices(a,b) {
  const out = new Float32Array(16);
  for(let column=0;column<4;column++)
    for(let row=0;row<4;row++)
      for(let k=0;k<4;k++)
        out[column*4+row] += a[k*4+row]*b[column*4+k];
  return out;
}
function cameraData(camera, aspect) {
  const [yaw,pitch,distance] = [camera.yaw,camera.pitch,camera.distance];
  const center = [0,0.2,0];
  const eye = [Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance+0.2,Math.cos(yaw)*Math.cos(pitch)*distance];
  const forward = vecNorm(vecSub(center,eye));
  const right = vecNorm(vecCross(forward,[0,1,0]));
  const up = vecNorm(vecCross(right,forward));
  const view = new Float32Array([
    right[0],up[0],-forward[0],0,
    right[1],up[1],-forward[1],0,
    right[2],up[2],-forward[2],0,
    -vecDot(right,eye),-vecDot(up,eye),vecDot(forward,eye),1,
  ]);
  const f = 1/Math.tan(Math.PI/7);
  const near=0.1, far=100;
  const projection = new Float32Array([
    f/aspect,0,0,0, 0,f,0,0, 0,0,far/(near-far),-1, 0,0,far*near/(near-far),0
  ]);
  return {viewProj:multiplyMatrices(projection,view),right,up};
}
function compileErrors(info, label) {
  const errors=info.messages.filter(m=>m.type==='error');
  if(errors.length) throw new Error(label+': '+errors.map(e=>e.message+' at '+e.lineNum+':'+e.linePos).join('; '));
}
export async function createRenderer(canvas, ci=false) {
  setStage('request-adapter');
  if (!navigator.gpu) throw new Error('このブラウザではWebGPUを使用できません。HTTPSと対応GPUを確認してください。');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter) throw new Error('WebGPU adapter が見つかりません。');
  setStage('request-device');
  const device=await adapter.requestDevice();
  device.lost.then(info=>{
    root.dataset.webgpuLost = info.reason+': '+info.message;
    if(info.reason!=='destroyed') {
      root.dataset.webgpuStatus='error';
      root.dataset.webgpuError='Device lost: '+info.message;
    }
  });
  device.addEventListener('uncapturederror', event=>{
    root.dataset.webgpuStatus='error';
    root.dataset.webgpuError=String(event.error?.message||event.error);
  });
  const module=device.createShaderModule({label:'Gaussian PDE shader',code:shader});
  setStage('shader-compilation-info');
  compileErrors(await module.getCompilationInfo(),'WGSL');
  const format=navigator.gpu.getPreferredCanvasFormat();
  const layout=device.createBindGroupLayout({entries:[{
    binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,
    buffer:{type:'uniform',minBindingSize:160}
  }]});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const uniform=device.createBuffer({size:160,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const bindGroup=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:uniform}}]});
  setStage('create-pipeline');
  const createPipeline=(name,vertex,fragment,depth,additive=false)=>device.createRenderPipeline({
    label:name,layout:pipelineLayout,
    vertex:{module,entryPoint:vertex},
    fragment:{module,entryPoint:fragment,targets:[{format,
      ...(additive?{blend:{
        color:{srcFactor:'one',dstFactor:'one',operation:'add'},
        alpha:{srcFactor:'one',dstFactor:'one',operation:'add'}
      }}:{})}]},
    primitive:{topology:'triangle-list',cullMode:'none'},
    depthStencil:{format:'depth24plus',depthWriteEnabled:depth&&!additive,depthCompare:depth?'less':'always'}
  });
  const skyPipe=createPipeline('starfield','skyVertex','skyFragment',false);
  const surfacePipe=createPipeline('analytic PDE surface','surfaceVertex','surfaceFragment',true);
  const dustPipe=createPipeline('Gaussian sparks','dustVertex','dustFragment',true,true);
  let context=null;
  if(!ci) {
    context=canvas.getContext('webgpu');
    if(!context) throw new Error('WebGPU canvas context を取得できません。');
    context.configure({device,format,alphaMode:'opaque'});
  }
  let width=0,height=0,depthTexture=null,offscreenTexture=null;
  function resize(widthNext,heightNext) {
    const w=Math.max(1,Math.floor(widthNext));
    const h=Math.max(1,Math.floor(heightNext));
    if(w===width&&h===height) return;
    width=w;height=h;
    if(!ci) { canvas.width=w;canvas.height=h; }
    depthTexture?.destroy();offscreenTexture?.destroy();
    depthTexture=device.createTexture({size:[w,h],format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT});
    if(ci) offscreenTexture=device.createTexture({size:[w,h],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  }
  function draw(config,camera,elapsed) {
    const data = cameraData(camera,width/height);
    const buffer=new Float32Array(40);
    buffer.set(data.viewProj,0);
    buffer.set([...data.right,0],16);
    buffer.set([...data.up,0],20);
    buffer.set([elapsed, config.count, config.mode, config.diffusion],24);
    buffer.set([config.width,config.height,config.waveSpeed,config.rotation],28);
    buffer.set([config.contours,config.glow,config.palette,config.grid],32);
    buffer.set([config.particleSize,config.particleLift,0,0],36);
    device.queue.writeBuffer(uniform,0,buffer);
    const view=(ci?offscreenTexture:context.getCurrentTexture()).createView();
    const encoder=device.createCommandEncoder({label:'PDE field frame'});
    const pass=encoder.beginRenderPass({
      colorAttachments:[{view,clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}],
      depthStencilAttachment:{view:depthTexture.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}
    });
    pass.setBindGroup(0,bindGroup);
    pass.setPipeline(skyPipe);pass.draw(3);
    pass.setPipeline(surfacePipe);pass.draw(144*144*6);
    if(config.particles) {
      pass.setPipeline(dustPipe);pass.draw(6,config.particles);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
  async function testDraw(config,camera) {
    resize(320,180);
    setStage('validation-scope');
    device.pushErrorScope('validation');
    draw(config,camera,1.5);
    setStage('submitted-work-wait');
    await device.queue.onSubmittedWorkDone();
    const error=await device.popErrorScope();
    if(error) throw new Error('GPU validation: '+error.message);
    const bytesPerRow=Math.ceil(320*4/256)*256;
    const copy=device.createBuffer({size:bytesPerRow*180,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const encoder=device.createCommandEncoder();
    encoder.copyTextureToBuffer({texture:offscreenTexture},{buffer:copy,bytesPerRow,rowsPerImage:180},[320,180]);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    await copy.mapAsync(GPUMapMode.READ);
    const pixels=new Uint8Array(copy.getMappedRange());
    let min=255,max=0,above=0;
    for(let y=12;y<168;y+=5)
      for(let x=12;x<308;x+=5) {
        const pos=y*bytesPerRow+x*4;
        const value=pixels[pos]+pixels[pos+1]+pixels[pos+2];
        min=Math.min(min,value);max=Math.max(max,value);
        if(value>65) above++;
      }
    copy.unmap();copy.destroy();
    if(max-min<30||above<15) throw new Error('Pixel readback lacks visible field: '+JSON.stringify({min,max,above}));
    root.dataset.webgpuPixels=JSON.stringify({min,max,above,width:320,height:180});
    setStage('done','ok');
    return {min,max,above};
  }
  return {resize,draw,testDraw,device};
}
