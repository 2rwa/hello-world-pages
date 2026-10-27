import {createPackets,makeViewProjection,PACKETS_PER_BAND,COMPUTE_RES} from "./waves.js";
const canvas=document.querySelector("#ocean"),state=document.querySelector("#status"),ciStage=document.querySelector("#ci-state");
const ci=new URLSearchParams(location.search).has("ci");
const GRID=192;
let gpu,context,format,paramsBuffer,packetBuffer,waveTexture,normalTexture,foamTextures,foamPhase=0;
let wavePipeline,foamPipeline,skyPipeline,seaPipeline,waveGroup,foamGroups,drawGroups,sample,depth,offscreen;
let last=0,now=0,frames=0,fpsAt=0,paused=false,yaw=0,pitch=0.14;
const params=new Float32Array(40);
function setting(key){return Number(document.getElementById(key).value);}
function status(text,error=false){state.textContent=text;state.dataset.error=error?"1":"0";}
function fail(error){const message=String(error?.stack||error);console.error(message);ciStage.textContent="error: "+message;status("GPU ERROR: "+message,true);}
function createTexture(format,depthOrArray,usage,width=GRID,height=GRID){
  return gpu.createTexture({size:{width,height,depthOrArrayLayers:depthOrArray},format,usage});
}
function reset(){
  now=0;foamPhase=0;
  const zeros=new Uint8Array(GRID*GRID*8);
  // Each float16 pixel consists of 8 zero bytes.
  for(const texture of foamTextures){
    gpu.queue.writeTexture({texture},zeros,{bytesPerRow:GRID*8,rowsPerImage:GRID},{width:GRID,height:GRID,depthOrArrayLayers:1});
  }
  gpu.queue.writeBuffer(packetBuffer,0,createPackets(setting("direction")*Math.PI/180));
}
function resize(){
  if(!gpu||ci)return;
  const scale=setting("resolution")*Math.min(1.7,window.devicePixelRatio||1);
  const width=Math.max(128,Math.min(1920,Math.floor(canvas.clientWidth*scale)));
  const height=Math.max(96,Math.min(1280,Math.floor(canvas.clientHeight*scale)));
  if(canvas.width===width&&canvas.height===height)return;
  canvas.width=width;canvas.height=height;
  depth?.destroy();depth=createTexture("depth24plus",1,GPUTextureUsage.RENDER_ATTACHMENT,width,height);
}
async function checkedShader(path){
  const text=await fetch("./"+path).then(x=>{if(!x.ok)throw Error(path+" HTTP "+x.status);return x.text();});
  const module=gpu.createShaderModule({label:path,code:text});
  const info=await module.getCompilationInfo();
  const errors=info.messages.filter(x=>x.type==="error");
  if(errors.length)throw Error(path+"\n"+errors.map(e=>e.lineNum+":"+e.linePos+" "+e.message).join("\n"));
  return module;
}
async function initialize(){
  ciStage.textContent="request-adapter";
  if(!navigator.gpu)throw Error("WebGPU非対応のブラウザです");
  const adapter=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});
  if(!adapter)throw Error("WebGPU adapter not available");
  gpu=await adapter.requestDevice();
  gpu.addEventListener("uncapturederror",event=>fail("WebGPU validation: "+event.error.message));
  gpu.lost.then(info=>{if(info.reason!=="destroyed")fail("Device lost: "+info.message);});
  const [wavesWGSL,foamWGSL,renderWGSL]=await Promise.all(["waves.wgsl","foam.wgsl","render.wgsl"].map(checkedShader));
  const B=GPUBufferUsage,T=GPUTextureUsage,S=GPUShaderStage;
  paramsBuffer=gpu.createBuffer({size:160,usage:B.UNIFORM|B.COPY_DST});
  packetBuffer=gpu.createBuffer({size:5*PACKETS_PER_BAND*48,usage:B.STORAGE|B.COPY_DST});
  sample=gpu.createSampler({magFilter:"linear",minFilter:"linear",mipmapFilter:"linear",addressModeU:"repeat",addressModeV:"repeat"});
  const waveUsage=T.STORAGE_BINDING|T.TEXTURE_BINDING|T.COPY_SRC;
  waveTexture=createTexture("rgba16float",5,waveUsage);
  normalTexture=createTexture("rgba16float",5,waveUsage);
  const foamUsage=T.STORAGE_BINDING|T.TEXTURE_BINDING|T.COPY_SRC|T.COPY_DST;
  foamTextures=[createTexture("rgba16float",1,foamUsage),createTexture("rgba16float",1,foamUsage)];
  const waveLayout=gpu.createBindGroupLayout({entries:[
    {binding:0,visibility:S.COMPUTE,buffer:{type:"uniform"}},
    {binding:1,visibility:S.COMPUTE,buffer:{type:"read-only-storage"}},
    {binding:2,visibility:S.COMPUTE,storageTexture:{access:"write-only",format:"rgba16float",viewDimension:"2d-array"}},
    {binding:3,visibility:S.COMPUTE,storageTexture:{access:"write-only",format:"rgba16float",viewDimension:"2d-array"}}
  ]});
  const foamLayout=gpu.createBindGroupLayout({entries:[
    {binding:0,visibility:S.COMPUTE,buffer:{type:"uniform"}},
    {binding:1,visibility:S.COMPUTE,texture:{viewDimension:"2d-array",sampleType:"float"}},
    {binding:2,visibility:S.COMPUTE,texture:{viewDimension:"2d",sampleType:"float"}},
    {binding:3,visibility:S.COMPUTE,storageTexture:{access:"write-only",format:"rgba16float",viewDimension:"2d"}},
    {binding:4,visibility:S.COMPUTE,sampler:{type:"filtering"}}
  ]});
  const drawLayout=gpu.createBindGroupLayout({entries:[
    {binding:0,visibility:S.VERTEX|S.FRAGMENT,buffer:{type:"uniform"}},
    {binding:1,visibility:S.VERTEX|S.FRAGMENT,texture:{viewDimension:"2d-array",sampleType:"float"}},
    {binding:2,visibility:S.FRAGMENT,texture:{viewDimension:"2d-array",sampleType:"float"}},
    {binding:3,visibility:S.FRAGMENT,texture:{viewDimension:"2d",sampleType:"float"}},
    {binding:4,visibility:S.VERTEX|S.FRAGMENT,sampler:{type:"filtering"}}
  ]});
  wavePipeline=await gpu.createComputePipelineAsync({label:"5-band analytic Gaussian packets",layout:gpu.createPipelineLayout({bindGroupLayouts:[waveLayout]}),compute:{module:wavesWGSL,entryPoint:"synthesize"}});
  foamPipeline=await gpu.createComputePipelineAsync({label:"persistent whitecaps",layout:gpu.createPipelineLayout({bindGroupLayouts:[foamLayout]}),compute:{module:foamWGSL,entryPoint:"foamAdvance"}});
  if(ci){
    canvas.width=192;canvas.height=128;
    format="rgba8unorm";
    offscreen=createTexture(format,1,T.RENDER_ATTACHMENT|T.COPY_SRC,canvas.width,canvas.height);
  }else{
    context=canvas.getContext("webgpu");
    format=navigator.gpu.getPreferredCanvasFormat();
    context.configure({device:gpu,format,alphaMode:"opaque"});
  }
  skyPipeline=await gpu.createRenderPipelineAsync({label:"procedural sky",layout:gpu.createPipelineLayout({bindGroupLayouts:[drawLayout]}),vertex:{module:renderWGSL,entryPoint:"skyVertex"},fragment:{module:renderWGSL,entryPoint:"skyFragment",targets:[{format}]},primitive:{topology:"triangle-list"}});
  seaPipeline=await gpu.createRenderPipelineAsync({label:"Gaussian 5-band displaced ocean mesh",layout:gpu.createPipelineLayout({bindGroupLayouts:[drawLayout]}),vertex:{module:renderWGSL,entryPoint:"oceanVertex"},fragment:{module:renderWGSL,entryPoint:"oceanFragment",targets:[{format}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"}});
  waveGroup=gpu.createBindGroup({layout:waveLayout,entries:[
    {binding:0,resource:{buffer:paramsBuffer}},
    {binding:1,resource:{buffer:packetBuffer}},
    {binding:2,resource:waveTexture.createView({dimension:"2d-array"})},
    {binding:3,resource:normalTexture.createView({dimension:"2d-array"})}
  ]});
  foamGroups=[0,1].map(i=>gpu.createBindGroup({layout:foamLayout,entries:[
    {binding:0,resource:{buffer:paramsBuffer}},
    {binding:1,resource:normalTexture.createView({dimension:"2d-array"})},
    {binding:2,resource:foamTextures[i].createView()},
    {binding:3,resource:foamTextures[1-i].createView()},
    {binding:4,resource:sample}
  ]}));
  drawGroups=[0,1].map(i=>gpu.createBindGroup({layout:drawLayout,entries:[
    {binding:0,resource:{buffer:paramsBuffer}},
    {binding:1,resource:waveTexture.createView({dimension:"2d-array"})},
    {binding:2,resource:normalTexture.createView({dimension:"2d-array"})},
    {binding:3,resource:foamTextures[1-i].createView()},
    {binding:4,resource:sample}
  ]}));
  depth=createTexture("depth24plus",1,T.RENDER_ATTACHMENT,canvas.width,canvas.height);
  if(!ci)resize();
  reset();ciStage.textContent="pipelines-ready";status("GAUSSIAN SPECTRUM ACTIVE");
}
function drawFrame(dt){
  if(!paused)now+=dt;
  const cameraHeight=setting("camera");
  const aspect=canvas.width/canvas.height;
  params.set(makeViewProjection([0,cameraHeight,0],cameraHeight,pitch,yaw,aspect),0);
  params.set([0,cameraHeight,0,now],16);
  const direction=setting("direction")*Math.PI/180;
  params.set([Math.cos(direction),Math.sin(direction),setting("height"),paused?0:dt],20);
  params.set([setting("choppiness"),setting("foam"),setting("sun"),setting("turbidity")],24);
  params.set([yaw,pitch,setting("debug"),aspect],28);
  params.set([canvas.width,canvas.height,paused?0:dt,0],32);
  gpu.queue.writeBuffer(paramsBuffer,0,params);
  const enc=gpu.createCommandEncoder();
  if(!paused){
    let pass=enc.beginComputePass({label:"spectral Gaussian waves"});
    pass.setPipeline(wavePipeline);pass.setBindGroup(0,waveGroup);
    pass.dispatchWorkgroups(GRID/8,GRID/8,5);pass.end();
    pass=enc.beginComputePass({label:"foam advection"});
    pass.setPipeline(foamPipeline);pass.setBindGroup(0,foamGroups[foamPhase]);
    pass.dispatchWorkgroups(GRID/8,GRID/8);pass.end();
  }
  const renderGroup=drawGroups[paused?(foamPhase+1)%2:foamPhase];
  const colorView=ci?offscreen.createView():context.getCurrentTexture().createView();
  const pass=enc.beginRenderPass({colorAttachments:[{view:colorView,clearValue:{r:0.05,g:0.11,b:0.2,a:1},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:{view:depth.createView(),depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"}});
  pass.setBindGroup(0,renderGroup);
  pass.setPipeline(skyPipeline);pass.draw(3);
  pass.setPipeline(seaPipeline);pass.draw(6*191*191);
  pass.end();gpu.queue.submit([enc.finish()]);
  if(!paused)foamPhase^=1;
}
function loop(timestamp){
  const dt=Math.min(0.032,Math.max(0.004,(timestamp-last)/1000||1/60));last=timestamp;
  try{drawFrame(dt);}catch(e){fail(e);return;}
  frames++;
  if(timestamp-fpsAt>1000){
    document.getElementById("fps").textContent=Math.round(frames*1000/(timestamp-fpsAt))+" FPS";frames=0;fpsAt=timestamp;
  }
  requestAnimationFrame(loop);
}
function controls(){
  for(const el of document.querySelectorAll('input[type="range"]')){
    const output=document.getElementById(el.id+"Value");
    if(output){const update=()=>{output.textContent=Number(el.value).toFixed(el.step==="1"?0:2);};el.addEventListener("input",update);update();}
  }
  document.getElementById("toggle").addEventListener("click",()=>{
    const panel=document.getElementById("panel");panel.classList.toggle("closed");
    document.getElementById("toggle").textContent=panel.classList.contains("closed")?"CONTROLS +":"CONTROLS −";
  });
  document.getElementById("reset").addEventListener("click",()=>reset());
  document.getElementById("pause").addEventListener("click",()=>{
    paused=!paused;document.getElementById("pause").textContent=paused?"RESUME":"PAUSE";
  });
  document.getElementById("resolution").addEventListener("input",resize);
  document.getElementById("direction").addEventListener("change",()=>{if(gpu)reset();});
  let pointer=null;
  canvas.addEventListener("pointerdown",e=>{if(e.button!==0)return;pointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener("pointermove",e=>{
    if(!pointer)return;
    yaw-=(e.clientX-pointer.x)*0.004;
    pitch=Math.max(-0.10,Math.min(0.65,pitch+(e.clientY-pointer.y)*0.003));
    pointer={x:e.clientX,y:e.clientY};
  });
  canvas.addEventListener("pointerup",()=>pointer=null);
  canvas.addEventListener("pointercancel",()=>pointer=null);
  window.addEventListener("resize",resize);
  if(innerWidth<680)document.getElementById("panel").classList.add("closed");
}
controls();
initialize().then(()=>{
  if(ci){
    import("./ci.js").then(mod=>mod.testOcean({gpu,drawFrame,waveTexture,normalTexture,foamTextures,offscreen,canvas,ciStage,status})).catch(fail);
  }else{
    last=performance.now();fpsAt=last;requestAnimationFrame(loop);
  }
}).catch(fail);
