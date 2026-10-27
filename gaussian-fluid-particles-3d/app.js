import {gaussianParticles} from "./seed.js";
import {createParticleEngine} from "./particles-engine.js";
import {createFoamEngine} from "./foam-engine.js";
import {allocateDeformation,bindJacobianResources} from "./jacobian-resources.js";
import {installInterface,setting} from "./controls.js";
import {runGpuCI} from "./ci.js";
const canvas=document.getElementById("ocean");
const status=document.getElementById("state");
const perf=document.getElementById("fps");
const errorBox=document.getElementById("error");
const ciState=document.getElementById("ci-state");
const ci=new URLSearchParams(location.search).has("ci");
const SIZE=160,COUNT=384,HASH=256;
let device,context,encoderFormat,renderPipeline,renderGroups,simPipelines,simGroups,fieldBuffers;
let particleBuffer,headBuffer,linkBuffer,uniformBuffer,renderTarget,deformationBuffers,foamEngine,particleEngine;
let time=0,phase=0,paused=false,lastNow=0,fpsFrames=0,fpsStart=0;
let controls;
const params=new Float32Array(20);
function mark(value,isError=false){
  status.textContent=value;
  status.dataset.status=isError?"error":"ok";
}
function fail(message){
  const details=String(message?.stack||message);
  mark("WEBGPU ERROR",true);
  ciState.textContent="error: "+details;
  errorBox.hidden=false;errorBox.textContent=details;
  console.error(details);
}
function buffer(size,usage,data){
  const item=device.createBuffer({size:Math.ceil(size/4)*4,usage});
  if(data)device.queue.writeBuffer(item,0,data);
  return item;
}
function reset(){
  if(!device)return;
  const zeros=new Float32Array(SIZE*SIZE*4);
  for(const item of [...fieldBuffers,...deformationBuffers])device.queue.writeBuffer(item,0,zeros);
  foamEngine?.reset();
  particleEngine?.reset();
  device.queue.writeBuffer(particleBuffer,0,gaussianParticles());
  time=0;phase=0;
  if(controls)controls.clearImpulse();
  mark("RESEEDED");
}
function resize(){
  if(ci||!device)return;
  const viewportScale=setting("resolution")*Math.min(window.devicePixelRatio||1,1.7);
  const max=device.limits.maxTextureDimension2D;
  const wide=Math.max(64,Math.min(1920,max,Math.round(canvas.clientWidth*viewportScale)));
  const high=Math.max(64,Math.min(1200,max,Math.round(canvas.clientHeight*viewportScale)));
  if(canvas.width!==wide||canvas.height!==high){canvas.width=wide;canvas.height=high;}
}
async function compile(code,url){
  const module=device.createShaderModule({label:url,code});
  const info=await module.getCompilationInfo();
  const errors=info.messages.filter(m=>m.type==="error");
  if(errors.length)throw Error(url+"\n"+errors.map(x=>x.lineNum+":"+x.linePos+" "+x.message).join("\n"));
  return module;
}
async function initialize(){
  ciState.textContent="script-start";
  if(!navigator.gpu)throw Error("WebGPU非対応です。Safari / ChromeのWebGPU対応環境で開いてください。");
  ciState.textContent="request-adapter";
  const adapter=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});
  if(!adapter)throw Error("GPU adapter unavailable");
  ciState.textContent="request-device";
  device=await adapter.requestDevice();
  device.lost.then(info=>fail("GPU device lost: "+info.reason+" "+info.message));
  device.addEventListener("uncapturederror",event=>fail("GPU validation: "+event.error.message));
  const [simCode,renderCode]=await Promise.all([
    fetch("./sim.wgsl").then(r=>{if(!r.ok)throw Error("sim.wgsl HTTP "+r.status);return r.text();}),
    fetch("./render.wgsl").then(r=>{if(!r.ok)throw Error("render.wgsl HTTP "+r.status);return r.text();})
  ]);
  ciState.textContent="shader-compilation-info";
  const simModule=await compile(simCode,"sim.wgsl");
  const renderModule=await compile(renderCode,"render.wgsl");
  const S=GPUShaderStage,U=GPUBufferUsage;
  particleBuffer=buffer(COUNT*32,U.STORAGE|U.COPY_DST,gaussianParticles());
  headBuffer=buffer(HASH*4,U.STORAGE);
  linkBuffer=buffer(COUNT*4,U.STORAGE);
  uniformBuffer=buffer(80,U.UNIFORM|U.COPY_DST);
  fieldBuffers=Array.from({length:3},()=>buffer(SIZE*SIZE*16,U.STORAGE|U.COPY_DST|U.COPY_SRC));
  deformationBuffers=allocateDeformation(device,SIZE);
  const simLayout=device.createBindGroupLayout({entries:[
    {binding:0,visibility:S.COMPUTE,buffer:{type:"storage"}},
    {binding:1,visibility:S.COMPUTE,buffer:{type:"storage"}},
    {binding:2,visibility:S.COMPUTE,buffer:{type:"storage"}},
    {binding:3,visibility:S.COMPUTE,buffer:{type:"read-only-storage"}},
    {binding:4,visibility:S.COMPUTE,buffer:{type:"storage"}},
    {binding:5,visibility:S.COMPUTE,buffer:{type:"uniform"}},
    {binding:6,visibility:S.COMPUTE,buffer:{type:"storage"}},
    {binding:7,visibility:S.COMPUTE,buffer:{type:"read-only-storage"}},
    {binding:8,visibility:S.COMPUTE,buffer:{type:"storage"}}
  ]});
  const renderLayout=device.createBindGroupLayout({entries:[
    {binding:0,visibility:S.FRAGMENT,buffer:{type:"read-only-storage"}},
    {binding:1,visibility:S.FRAGMENT,buffer:{type:"uniform"}},
    {binding:2,visibility:S.FRAGMENT,buffer:{type:"read-only-storage"}},
    {binding:3,visibility:S.FRAGMENT,buffer:{type:"read-only-storage"}}
  ]});
  const simPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[simLayout]});
  const drawPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[renderLayout]});
  ciState.textContent="create-pipeline";
  simPipelines={};
  for(const name of ["clearGrid","moveGaussians","heightStep","velocityStep","displaceStep"]){
    simPipelines[name]=await device.createComputePipelineAsync({
      label:name,layout:simPipelineLayout,compute:{module:simModule,entryPoint:name}
    });
  }
  foamEngine=await createFoamEngine({device,compile,uniformBuffer,fieldBuffers,deformationBuffers,size:SIZE});
  if(ci){
    canvas.width=320;canvas.height=192;
    encoderFormat="rgba8unorm";
    renderTarget=device.createTexture({size:[canvas.width,canvas.height],format:encoderFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  } else {
    context=canvas.getContext("webgpu");
    if(!context)throw Error("Failed to create WebGPU canvas");
    encoderFormat=navigator.gpu.getPreferredCanvasFormat();
    context.configure({device,format:encoderFormat,alphaMode:"opaque"});
    resize();
  }
  renderPipeline=await device.createRenderPipelineAsync({
    label:"ocean fullscreen ray-height renderer",layout:drawPipelineLayout,
    vertex:{module:renderModule,entryPoint:"fullscreen"},
    fragment:{module:renderModule,entryPoint:"render",targets:[{format:encoderFormat}]},
    primitive:{topology:"triangle-list"}
  });
  particleEngine=await createParticleEngine({device,compile,format:encoderFormat,uniformBuffer,fieldBuffers,foamBuffers:foamEngine.foamBuffers});
  ({simGroups,renderGroups}=bindJacobianResources(device,simLayout,renderLayout,{
    particleBuffer,headBuffer,linkBuffer,uniformBuffer,fieldBuffers,deformationBuffers,foamBuffers:foamEngine.foamBuffers
  }));
  reset();
  ciState.textContent="pipeline-ready";
}
function draw(dt){
  if(!paused)time+=dt;
  params[0]=time;params[1]=paused?0:dt;
  params[2]=setting("energy");params[3]=setting("wind");
  params[4]=setting("height");params[5]=controls.yaw;params[6]=controls.pitch;params[7]=setting("foam");
  params[8]=setting("sun");params[9]=setting("diagnosticMode");params[10]=setting("swell");
  const hitImpulse=controls.consumeImpulse();
  params[12]=hitImpulse?.[0]||0;params[13]=hitImpulse?.[1]||0;
  params[14]=hitImpulse?.[2]||0;params[15]=hitImpulse?1:0;
  params[16]=canvas.width;params[17]=canvas.height;params[18]=setting("breaking");params[19]=setting("foamLife");
  device.queue.writeBuffer(uniformBuffer,0,params);
  particleEngine.updateSettings([setting("bubbles"),setting("spray"),setting("particleScale"),setting("buoyancy")]);
  const command=device.createCommandEncoder({label:"Gaussian-fluid ocean frame"});
  const idx=phase;
  if(!paused){
    const bindings=simGroups[idx];
    for(const entryPoint of ["clearGrid","moveGaussians","heightStep","velocityStep","displaceStep"]){
      const pass=command.beginComputePass({label:entryPoint});
      pass.setPipeline(simPipelines[entryPoint]);
      pass.setBindGroup(0,bindings);
      if(entryPoint==="clearGrid")pass.dispatchWorkgroups(4);
      else if(entryPoint==="moveGaussians")pass.dispatchWorkgroups(6);
      else pass.dispatchWorkgroups(20,20);
      pass.end();
    }
    foamEngine.encode(command,idx);
    particleEngine.encode(command,idx);
  }
  const resultGroup=paused?renderGroups[(phase+1)%2]:renderGroups[idx];
  const destination=ci?renderTarget.createView():context.getCurrentTexture().createView();
  const pass=command.beginRenderPass({colorAttachments:[{
    view:destination,clearValue:{r:.03,g:.07,b:.09,a:1},loadOp:"clear",storeOp:"store"
  }]});
  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0,resultGroup);
  pass.draw(3);
  if(setting("diagnosticMode")<1 || setting("diagnosticMode")>3)particleEngine.draw(pass);
  pass.end();
  device.queue.submit([command.finish()]);
  if(!paused){phase^=1;}
}
function loop(now){
  if(!device)return;
  const dt=Math.min(.027,Math.max(.008,(now-lastNow)/1000||.016));
  lastNow=now;
  try{draw(dt);}catch(err){fail(err);return;}
  fpsFrames++;
  if(now-fpsStart>1000){
    const fps=(fpsFrames*1000/(now-fpsStart)).toFixed(0);
    perf.textContent=fps+" FPS";fpsFrames=0;fpsStart=now;
    if(!paused)mark("SIMULATING");
  }
  requestAnimationFrame(loop);
}
controls=installInterface({canvas,reset,resize});
document.getElementById("pause").addEventListener("click",()=>{paused=!paused;document.getElementById("pause").textContent=paused?"RESUME":"PAUSE";});
initialize().then(()=>{
  if(ci){runGpuCI({device,draw,renderTarget,canvas,ciState,mark,fieldBuffers,deformationBuffers,foamBuffers:foamEngine.foamBuffers,particleEngine}).catch(fail);}
  else{lastNow=performance.now();fpsStart=lastNow;requestAnimationFrame(loop);}
}).catch(fail);
