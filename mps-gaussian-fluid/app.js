// WebGPU MPS-inspired Gaussian fluid lab. No third-party runtime dependencies.
const $ = (id) => document.getElementById(id);
const canvas = $('screen');
const CI = new URLSearchParams(location.search).has('ci');
const state = { count: 512, rigidity: 0.85, sigma: 0.235, visualSigma: 0.15,
  opacity: 1.1, damping: 0.015, gravity: 6.0, palette: 0, yaw: 0.35, pitch: 0.22,
  distance: 7.6, paused: false, impulse: 0, tilt: false, gx: 0, gz: 0, t: 0 };
const TANK = 2.28;
const workgroupSize = 64;
let device, context, format, physicsPipelines, renderPipelines, simUniform, cameraUniform;
let simLayout, renderLayout, parts = {}, passes = {}, renderGroup, offscreen, initialized = false;
let previousTime = performance.now(), frameCount = 0, frameTimeSum = 0, pointerMap = new Map(), lastPinch = 0;
function setStage(stage) {
  document.documentElement.dataset.gpuStage = stage;
  $('stage').textContent = stage;
}
function fail(error) {
  const msg = String(error?.message || error);
  console.error(error);
  document.documentElement.dataset.gpuStage = 'error';
  document.documentElement.dataset.gpuError = msg;
  $('error').hidden = false;
  $('error').textContent = msg;
  $('stage').textContent = 'ERROR';
}
function makeBuffer(size, usage) {
  return device.createBuffer({size: Math.ceil(size / 4) * 4, usage});
}
function createBind(layout, buffers) {
  return device.createBindGroup({layout, entries: buffers.map((buffer, binding) =>
    ({binding, resource: {buffer}}))});
}
function restDensity(sigmaValue) {
  const spacing = 0.245, cutoff = 2.8 * sigmaValue;
  let rest = 0;
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++)
    for (let z = -3; z <= 3; z++) {
      const r2 = spacing * spacing * (x*x + y*y + z*z);
      if (r2 < cutoff * cutoff) rest += Math.exp(-0.5 * r2 / (sigmaValue*sigmaValue));
    }
  return rest;
}
function resetParticles() {
  for (const buffer of Object.values(parts)) buffer.destroy();
  const cubeSide = Math.round(Math.cbrt(state.count));
  const positions = new Float32Array(state.count * 4);
  const velocities = new Float32Array(state.count * 4);
  let k = 0;
  const spacing = 0.245;
  for (let z=0; z<cubeSide; z++) for (let y=0; y<cubeSide; y++) for (let x=0; x<cubeSide; x++) {
    let px = (x - (cubeSide-1)/2)*spacing;
    let py = (y - (cubeSide-1)/2)*spacing + 0.45;
    let pz = (z - (cubeSide-1)/2)*spacing;
    const d = Math.hypot(px,py,pz);
    if (d > TANK-0.10) { const s=(TANK-0.10)/d; px*=s; py*=s; pz*=s; }
    positions.set([px,py,pz,1],k*4); k++;
  }
  const bytes = positions.byteLength, flags = GPUBufferUsage;
  parts.pos = makeBuffer(bytes,flags.STORAGE|flags.COPY_DST|flags.COPY_SRC);
  parts.vel = makeBuffer(bytes,flags.STORAGE|flags.COPY_DST);
  parts.predA = makeBuffer(bytes,flags.STORAGE|flags.COPY_SRC);
  parts.predB = makeBuffer(bytes,flags.STORAGE);
  parts.velTemp = makeBuffer(bytes,flags.STORAGE);
  parts.lambda = makeBuffer(state.count*4,flags.STORAGE);
  device.queue.writeBuffer(parts.pos,0,positions);
  device.queue.writeBuffer(parts.vel,0,velocities);
  const common=(positionIn,velocityIn,positionOut,velocityOut) =>
    createBind(simLayout,[simUniform,positionIn,velocityIn,positionOut,velocityOut,parts.lambda]);
  passes.predict=common(parts.pos,parts.vel,parts.predA,parts.velTemp);
  passes.density0=common(parts.predA,parts.vel,parts.predB,parts.velTemp);
  passes.project0=common(parts.predA,parts.vel,parts.predB,parts.velTemp);
  passes.density1=common(parts.predB,parts.vel,parts.predA,parts.velTemp);
  passes.project1=common(parts.predB,parts.vel,parts.predA,parts.velTemp);
  passes.finalize=common(parts.pos,parts.velTemp,parts.predA,parts.vel);
  renderGroup=createBind(renderLayout,[cameraUniform,parts.pos]);
  state.impulse=0;
  $('particleCount').textContent=state.count.toLocaleString('ja-JP');
}
async function compileShader(path) {
  const response = await fetch(path,{cache:'no-store'});
  if (!response.ok) throw Error('WGSL fetch failed: '+path+' ('+response.status+')');
  const module=device.createShaderModule({code:await response.text()});
  const result=await module.getCompilationInfo();
  const errors=result.messages.filter((message)=>message.type==='error');
  if (errors.length) throw Error(path+'\n'+errors.map(e=>e.lineNum+':'+e.linePos+' '+e.message).join('\n'));
  return module;
}
function calcCamera() {
  const distance=state.distance;
  const eye=[Math.sin(state.yaw)*Math.cos(state.pitch)*distance,
             Math.sin(state.pitch)*distance,Math.cos(state.yaw)*Math.cos(state.pitch)*distance];
  const norm=(v)=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const forward=norm(eye.map(x=>-x));
  const right=norm(cross(forward,[0,1,0]));
  const up=norm(cross(right,forward));
  return {eye,right,up,forward};
}
function resize() {
  const dpr=Math.min(1.5,window.devicePixelRatio||1);
  let w=Math.max(2,Math.floor(canvas.clientWidth*dpr)),h=Math.max(2,Math.floor(canvas.clientHeight*dpr));
  const scale=Math.min(1,Math.sqrt(1250000/(w*h)));
  w=Math.max(2,Math.floor(w*scale));h=Math.max(2,Math.floor(h*scale));
  if(w===canvas.width&&h===canvas.height)return;
  canvas.width=w;canvas.height=h;
  if(CI){
    offscreen?.destroy();
    offscreen=device.createTexture({size:[w,h],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  }
  $('resolution').textContent=w+'×'+h;
}
function simulationPass(encoder,key,group) {
  const pass=encoder.beginComputePass();
  pass.setPipeline(physicsPipelines[key]);
  pass.setBindGroup(0,group);
  pass.dispatchWorkgroups(Math.ceil(state.count/workgroupSize));
  pass.end();
}
function advance(dt) {
  const sinT=state.tilt?state.gx:0, tiltZ=state.tilt?state.gz:0;
  const grav=[sinT*state.gravity,-state.gravity,tiltZ*state.gravity];
  const param=new Float32Array([
    dt,state.count,state.rigidity,state.damping,
    ...grav,0,
    state.sigma,restDensity(state.sigma),state.sigma*2.8,TANK,
    0,0,0,state.impulse
  ]);
  state.impulse=0;
  device.queue.writeBuffer(simUniform,0,param);
  const encoder=device.createCommandEncoder();
  simulationPass(encoder,'predict',passes.predict);
  simulationPass(encoder,'density',passes.density0);
  simulationPass(encoder,'project',passes.project0);
  simulationPass(encoder,'density',passes.density1);
  simulationPass(encoder,'project',passes.project1);
  simulationPass(encoder,'finalize',passes.finalize);
  encoder.copyBufferToBuffer(parts.predA,0,parts.pos,0,state.count*16);
  device.queue.submit([encoder.finish()]);
  state.t+=dt;
}
function draw() {
  resize();
  const cam=calcCamera();
  const focal=canvas.height*0.5/Math.tan(Math.PI/6);
  const arr=new Float32Array([
    ...cam.eye,0,...cam.right,0,...cam.up,0,...cam.forward,0,
    canvas.width,canvas.height,focal,state.visualSigma,
    state.opacity,state.palette,TANK,state.t
  ]);
  device.queue.writeBuffer(cameraUniform,0,arr);
  const encoder=device.createCommandEncoder();
  const view=CI?offscreen.createView():context.getCurrentTexture().createView();
  const pass=encoder.beginRenderPass({colorAttachments:[{
    view, clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'
  }]});
  pass.setBindGroup(0,renderGroup);
  pass.setPipeline(renderPipelines.background);pass.draw(3);
  pass.setPipeline(renderPipelines.particles);pass.draw(6,state.count);
  pass.end();
  device.queue.submit([encoder.finish()]);
}
function renderFrame(now) {
  try {
    const seconds=Math.min(0.040,(now-previousTime)/1000);
    previousTime=now;
    if(!state.paused)advance(Math.max(0.008,Math.min(0.022,seconds)));
    draw();
    frameTimeSum+=seconds;frameCount++;
    if(frameTimeSum>0.6){
      $('fps').textContent=Math.round(frameCount/frameTimeSum);
      frameCount=0;frameTimeSum=0;
    }
    requestAnimationFrame(renderFrame);
  }catch(e){fail(e);}
}
async function readback() {
  const rowBytes=Math.ceil(canvas.width*4/256)*256;
  const resultBuffer=makeBuffer(rowBytes*canvas.height,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const encoder=device.createCommandEncoder();
  encoder.copyTextureToBuffer({texture:offscreen},{buffer:resultBuffer,bytesPerRow:rowBytes},[canvas.width,canvas.height]);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  await resultBuffer.mapAsync(GPUMapMode.READ);
  const data=new Uint8Array(resultBuffer.getMappedRange());
  let colored=0, checksum=0;
  for(let y=0;y<canvas.height;y+=3)for(let x=0;x<canvas.width;x+=3){
    const k=y*rowBytes+x*4;
    const color0=data[k],color1=data[k+1],color2=data[k+2];
    if(Math.max(color0,color1,color2)>75)colored++;
    checksum=(Math.imul(checksum,33)+color0+3*color1+7*color2)>>>0;
  }
  resultBuffer.unmap();resultBuffer.destroy();
  return {colored,checksum};
}
async function init() {
  try {
    setStage('script-start');
    if(!navigator.gpu) throw Error('WebGPU unavailable. HTTPS and a WebGPU browser are required.');
    setStage('request-adapter');
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter)throw Error('WebGPU adapter unavailable');
    setStage('request-device');
    device=await adapter.requestDevice();
    device.lost.then(info=>fail(Error('WebGPU device lost: '+info.reason+' '+info.message)));
    format=navigator.gpu.getPreferredCanvasFormat();
    if(!CI){context=canvas.getContext('webgpu');context.configure({device,format,alphaMode:'opaque'});}
    setStage('shader-compilation-info');
    const physics=await compileShader('./physics.wgsl');
    const render=await compileShader('./render.wgsl');
    setStage('create-pipelines');
    device.pushErrorScope('validation');
    simLayout=device.createBindGroupLayout({entries:[
      {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
      {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
      {binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
      {binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}
    ]});
    renderLayout=device.createBindGroupLayout({entries:[
      {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
      {binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}}
    ]});
    const simPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[simLayout]});
    const renderPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[renderLayout]});
    physicsPipelines={};
    for(const key of ['predict','density','project','finalize']){
      physicsPipelines[key]=device.createComputePipeline({layout:simPipelineLayout,compute:{module:physics,entryPoint:key}});
    }
    renderPipelines={
      background:device.createRenderPipeline({layout:renderPipelineLayout,
        vertex:{module:render,entryPoint:'backgroundVertex'},
        fragment:{module:render,entryPoint:'backgroundFragment',targets:[{format}]},
        primitive:{topology:'triangle-list'}}),
      particles:device.createRenderPipeline({layout:renderPipelineLayout,
        vertex:{module:render,entryPoint:'particleVertex'},
        fragment:{module:render,entryPoint:'particleFragment',targets:[{format,
          blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},
                 alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},
        primitive:{topology:'triangle-list'}})
    };
    simUniform=makeBuffer(64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    cameraUniform=makeBuffer(96,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    resetParticles();
    const validation=await device.popErrorScope();
    if(validation)throw Error(validation.message);
    initialized=true;
    controls();
    setStage('ready');
    if(CI) {
      device.pushErrorScope('validation');
      setStage('submitted-work-wait');
      let first;
      for(let i=0;i<5;i++){advance(1/60);draw();if(i===0){await device.queue.onSubmittedWorkDone();first=await readback();}}
      await device.queue.onSubmittedWorkDone();
      const gpuError=await device.popErrorScope();
      if(gpuError)throw Error(gpuError.message);
      const last=await readback();
      if(last.colored<40)throw Error('No visible Gaussian splats: '+JSON.stringify(last));
      if(last.checksum===first.checksum)throw Error('Rendered frame failed to change');
      document.documentElement.dataset.gpuPixels=String(last.colored);
      document.documentElement.dataset.gpuHash=String(last.checksum);
      document.documentElement.dataset.gpuTest='ok';
      setStage('ok');
    } else requestAnimationFrame(renderFrame);
  }catch(e){fail(e);}
}
function controls() {
  const inputs={
    count:['count',v=>{state.count=Number(v);resetParticles();}],
    rigidity:['rigidity',v=>state.rigidity=Number(v)],
    sigma:['sigma',v=>state.sigma=Number(v)],
    splat:['visualSigma',v=>state.visualSigma=Number(v)],
    opacity:['opacity',v=>state.opacity=Number(v)],
    damping:['damping',v=>state.damping=Number(v)],
    gravity:['gravity',v=>state.gravity=Number(v)],
    palette:['palette',v=>state.palette=Number(v)]
  };
  for(const [id,[property,setter]] of Object.entries(inputs)){
    $(id).addEventListener('input',()=>{setter($(id).value);if($('v-'+id))$('v-'+id).textContent=$(id).value;});
  }
  $('pause').onclick=()=>{state.paused=!state.paused;$('pause').textContent=state.paused?'再開':'一時停止';};
  $('reset').onclick=()=>resetParticles();
  $('shake').onclick=()=>{state.impulse=4.2;if(state.paused){state.paused=false;$('pause').textContent='一時停止';}};
  $('collapse').onclick=()=>{$('panel').classList.toggle('collapsed');};
  $('sensor').onclick=async()=>{
    try{
      if(typeof DeviceOrientationEvent==='undefined')throw Error('orientation sensor unavailable');
      if(typeof DeviceOrientationEvent.requestPermission==='function'){
        const permission=await DeviceOrientationEvent.requestPermission();
        if(permission!=='granted')throw Error('sensor permission denied');
      }
      state.tilt=true;$('sensor').textContent='傾きセンサー ON';
    }catch(e){$('stage').textContent=String(e.message);}
  };
  window.addEventListener('deviceorientation',e=>{
    if(!state.tilt)return;
    state.gx=Math.max(-1,Math.min(1,(e.gamma||0)/45));
    state.gz=Math.max(-1,Math.min(1,(e.beta||0)/45));
  });
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointerMap.set(e.pointerId,[e.clientX,e.clientY]);});
  canvas.addEventListener('pointermove',e=>{
    if(!pointerMap.has(e.pointerId))return;
    const old=pointerMap.get(e.pointerId);
    pointerMap.set(e.pointerId,[e.clientX,e.clientY]);
    const points=[...pointerMap.values()];
    if(points.length===2){
      const dist=Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]);
      if(lastPinch)state.distance=Math.max(4.5,Math.min(13,state.distance*lastPinch/dist));
      lastPinch=dist;
    }else{
      state.yaw+=(e.clientX-old[0])*0.008;
      state.pitch=Math.max(-1.3,Math.min(1.3,state.pitch+(e.clientY-old[1])*0.008));
      lastPinch=0;
    }
  });
  const end=e=>{pointerMap.delete(e.pointerId);if(pointerMap.size<2)lastPinch=0;};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('wheel',e=>{e.preventDefault();state.distance=Math.max(4.5,Math.min(13,state.distance*Math.exp(e.deltaY*0.001)));},{passive:false});
}
init();
