const canvas=document.getElementById('sea');
const statusLabel=document.getElementById('status');
const isCI=new URLSearchParams(location.search).has('ci');
const state={
 height:1.35, sharpness:0.68, variation:0.62, foam:0.84,
 trains:5, direction:26, altitude:9.0, resolution:0.8,
 yaw:0.0, pitch:-0.12, timeSpeed:1.0,
};
const defaults={...state};
let paused=false, simulatedTime=0, previousFrame=0, fps=0;
let adapter,device,pipeline,bindGroup,uniformBuffer,context,format;
const ui=new Map();
const sliders=[
 {key:'height',name:'波の高さ',min:0.15,max:2.6,step:0.05,suffix:'×',group:'waveControls'},
 {key:'sharpness',name:'波頭の尖り',min:0,max:1,step:0.01,suffix:'',group:'waveControls'},
 {key:'variation',name:'局所風・進行方向の変化',min:0,max:1,step:0.01,suffix:'',group:'waveControls'},
 {key:'trains',name:'波列の本数',min:1,max:6,step:1,suffix:'本',group:'waveControls'},
 {key:'direction',name:'卓越風向',min:-180,max:180,step:1,suffix:'°',group:'waveControls'},
 {key:'foam',name:'位相に連動する白波',min:0,max:2,step:0.05,suffix:'',group:'waveControls'},
 {key:'altitude',name:'カメラ高度',min:4,max:32,step:0.5,suffix:'m',group:'cameraControls'},
 {key:'resolution',name:'描画解像度',min:0.45,max:1.0,step:0.05,suffix:'×',group:'cameraControls'},
 {key:'timeSpeed',name:'時間の進み方',min:0,max:2.5,step:0.1,suffix:'×',group:'cameraControls'},
];
function showValue(def,value){
 return Number(value).toFixed(def.step>=1?0:def.step>=0.1?1:2)+def.suffix;
}
for(const def of sliders){
 const root=document.createElement('label');root.className='control';
 const header=document.createElement('div');header.className='labels';
 const name=document.createElement('span');name.textContent=def.name;
 const readout=document.createElement('output');readout.className='value';
 readout.textContent=showValue(def,state[def.key]);
 const input=document.createElement('input');
 input.type='range';input.min=def.min;input.max=def.max;input.step=def.step;
 input.value=state[def.key];input.id='ctrl-'+def.key;
 input.setAttribute('aria-label',def.name);
 input.addEventListener('input',()=>{
  state[def.key]=Number(input.value);
  readout.textContent=showValue(def,state[def.key]);
  if(def.key==='resolution')resize();
 });
 header.append(name,readout);root.append(header,input);
 document.getElementById(def.group).append(root);
 ui.set(def.key,{input,readout,def});
}
function assign(next){
 Object.assign(state,next);
 for(const [key,ref] of ui){
  ref.input.value=state[key];
  ref.readout.textContent=showValue(ref.def,state[key]);
 }
 resize();
}
document.getElementById('calm').onclick=()=>assign({
 height:0.5,sharpness:0.34,variation:0.25,foam:0.12,
 trains:4,direction:20,timeSpeed:0.75,altitude:7
});
document.getElementById('storm').onclick=()=>assign({
 height:2.25,sharpness:0.96,variation:0.9,foam:1.8,
 trains:6,direction:38,timeSpeed:1.4,altitude:13
});
document.getElementById('reset').onclick=()=>{assign({...defaults});simulatedTime=0;};
document.getElementById('recenter').onclick=()=>{
 state.yaw=0;state.pitch=-0.12;state.altitude=defaults.altitude;
 assign(state);
};
document.getElementById('pause').onclick=(event)=>{
 paused=!paused;
 event.currentTarget.textContent=paused?'▶ 再開':'⏸ 一時停止';
};
document.getElementById('collapse').onclick=()=>{
 const panel=document.getElementById('panel');
 const compact=panel.classList.toggle('collapsed');
 const button=document.getElementById('collapse');
 button.textContent=compact?'開く':'閉じる';
 button.setAttribute('aria-expanded',String(!compact));
};
const pointers=new Map();
let priorPinch=0;
canvas.addEventListener('pointerdown',(event)=>{
 canvas.setPointerCapture(event.pointerId);
 pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 priorPinch=0;
});
canvas.addEventListener('pointermove',(event)=>{
 if(!pointers.has(event.pointerId))return;
 const prior=pointers.get(event.pointerId);
 pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(pointers.size===1){
  state.yaw+=(event.clientX-prior.x)*0.004;
  state.pitch=Math.max(-0.6,Math.min(0.27,state.pitch-(event.clientY-prior.y)*0.003));
 }else if(pointers.size===2){
  const pair=[...pointers.values()];
  const distance=Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y);
  if(priorPinch>0){
   state.altitude=Math.min(32,Math.max(4,state.altitude*priorPinch/distance));
   assign(state);
  }
  priorPinch=distance;
 }
});
function releasePointer(event){pointers.delete(event.pointerId);priorPinch=0;}
canvas.addEventListener('pointerup',releasePointer);
canvas.addEventListener('pointercancel',releasePointer);
canvas.addEventListener('wheel',(event)=>{
 event.preventDefault();
 state.altitude=Math.min(32,Math.max(4,state.altitude*Math.exp(event.deltaY*0.0012)));
 assign(state);
},{passive:false});
function setStage(stage,detail=''){
 document.documentElement.dataset.stage=stage;
 statusLabel.textContent=detail||stage;
}
function fail(error){
 console.error('[ocean]',error);
 setStage('failed','WebGPU error');
 document.getElementById('errorText').textContent=String(error?.stack||error);
 document.getElementById('error').classList.add('visible');
 document.documentElement.dataset.test='failed';
}
function resize(){
 if(!device||isCI)return;
 const dpr=Math.min(devicePixelRatio||1,1.8);
 const wanted=Math.max(0.4,state.resolution);
 const width=Math.max(1,Math.round(canvas.clientWidth*dpr*wanted));
 const height=Math.max(1,Math.round(canvas.clientHeight*dpr*wanted));
 const limit=device.limits.maxTextureDimension2D;
 const ratio=Math.min(1,limit/Math.max(width,height));
 const w=Math.max(1,Math.floor(width*ratio));
 const h=Math.max(1,Math.floor(height*ratio));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
}
window.addEventListener('resize',resize);
function uploadUniform(width,height){
 const values=new Float32Array([
  width,height,0,0,
  state.altitude,state.yaw,state.pitch,simulatedTime,
  state.height,state.sharpness,state.variation,state.foam,
  state.trains,state.direction*Math.PI/180,state.resolution,0,
  0.25,0.22,0,0,
 ]);
 device.queue.writeBuffer(uniformBuffer,0,values);
}
function encodeScene(encoder,target){
 const pass=encoder.beginRenderPass({
  colorAttachments:[{
   view:target.createView(),
   clearValue:{r:0.02,g:0.07,b:0.13,a:1},
   loadOp:'clear',storeOp:'store',
  }]
 });
 pass.setPipeline(pipeline);
 pass.setBindGroup(0,bindGroup);
 pass.draw(3);
 pass.end();
}
async function runCI(){
 document.getElementById('panel').style.display='none';
 const width=320,height=180,bytesPerRow=Math.ceil(width*4/256)*256;
 const testTexture=device.createTexture({
  size:[width,height,1],format,
  usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC,
 });
 const readback=device.createBuffer({
  size:bytesPerRow*height,
  usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,
 });
 device.pushErrorScope('validation');
 uploadUniform(width,height);
 const encoder=device.createCommandEncoder();
 encodeScene(encoder,testTexture);
 encoder.copyTextureToBuffer({texture:testTexture},
  {buffer:readback,bytesPerRow,rowsPerImage:height},[width,height,1]);
 device.queue.submit([encoder.finish()]);
 setStage('submitted-work-wait','CI: GPU submission pending');
 await device.queue.onSubmittedWorkDone();
 const validation=await device.popErrorScope();
 if(validation)throw Error('WebGPU validation: '+validation.message);
 await readback.mapAsync(GPUMapMode.READ);
 const pixels=new Uint8Array(readback.getMappedRange());
 const colors=new Set();
 for(let y=3;y<height;y+=5){
  for(let x=5;x<width;x+=8){
   const index=y*bytesPerRow+x*4;
   colors.add([pixels[index]>>3,pixels[index+1]>>3,pixels[index+2]>>3].join(':'));
  }
 }
 const topOffset=10*bytesPerRow+(width>>1)*4;
 const bottomOffset=(height-10)*bytesPerRow+(width>>1)*4;
 const top=[...pixels.slice(topOffset,topOffset+3)];
 const bottom=[...pixels.slice(bottomOffset,bottomOffset+3)];
 readback.unmap();readback.destroy();testTexture.destroy();
 if(colors.size<12)throw Error('Flat image: '+colors.size+' colors');
 if(top.every((v,i)=>Math.abs(v-bottom[i])<4))
  throw Error('Top/bottom pixel colors are too similar');
 window.__oceanTest={ok:true,colors:colors.size,top,bottom,
  backend:adapter.info?.description||'WebGPU'};
 document.documentElement.dataset.test='ok';
 setStage('done','CI OK / rendered '+colors.size+' unique color buckets');
}
function renderFrame(now){
 if(!device||document.documentElement.dataset.stage==='failed')return;
 try{
  const delta=previousFrame?Math.min(0.07,(now-previousFrame)/1000):0;
  previousFrame=now;
  if(!paused)simulatedTime+=delta*state.timeSpeed;
  fps=fps?fps*0.94+(delta>0?1/delta:60)*0.06:60;
  resize();uploadUniform(canvas.width,canvas.height);
  const encoder=device.createCommandEncoder();
  encodeScene(encoder,context.getCurrentTexture());
  device.queue.submit([encoder.finish()]);
  if(Math.floor(now/600)!==Math.floor((now-16)/600)){
   statusLabel.textContent='WebGPU  |  '+canvas.width+'×'+canvas.height+
    '  |  '+fps.toFixed(0)+' FPS  |  '+state.trains+' trains';
  }
  requestAnimationFrame(renderFrame);
 }catch(error){fail(error);}
}
async function initialize(){
 if(!navigator.gpu)throw Error('navigator.gpu is unavailable (HTTPS / compatible browser required)');
 setStage('request-adapter','WebGPU: requesting adapter');
 adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter)adapter=await navigator.gpu.requestAdapter({powerPreference:'low-power'});
 if(!adapter)throw Error('No WebGPU adapter found');
 setStage('request-device','WebGPU: requesting device');
 device=await adapter.requestDevice();
 device.lost.then(info=>{if(info.reason!=='destroyed')fail(Error('Device lost: '+info.reason+' '+info.message));});
 device.addEventListener('uncapturederror',event=>fail(Error('Uncaptured GPU: '+event.error?.message)));
 format=navigator.gpu.getPreferredCanvasFormat();
 const response=await fetch('./sea.wgsl',{cache:'no-store'});
 if(!response.ok)throw Error('WGSL fetch failed: '+response.status);
 const shaderSource=await response.text();
 const shader=device.createShaderModule({code:shaderSource,label:'Dynamic Wave Trains'});
 setStage('shader-compilation-info','Checking WGSL compilation');
 const compilation=await shader.getCompilationInfo();
 const errors=compilation.messages.filter(entry=>entry.type==='error');
 if(errors.length)throw Error('WGSL errors:\n'+errors.map(entry=>
  entry.lineNum+':'+entry.linePos+' '+entry.message).join('\n'));
 device.pushErrorScope('validation');
 setStage('create-pipeline','Creating render pipeline');
 pipeline=await device.createRenderPipelineAsync({
  layout:'auto',
  vertex:{module:shader,entryPoint:'vertexMain'},
  fragment:{module:shader,entryPoint:'fragmentMain',targets:[{format}]},
  primitive:{topology:'triangle-list'},
 });
 uniformBuffer=device.createBuffer({
  size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,
 });
 bindGroup=device.createBindGroup({
  layout:pipeline.getBindGroupLayout(0),
  entries:[{binding:0,resource:{buffer:uniformBuffer}}],
 });
 const validation=await device.popErrorScope();
 if(validation)throw Error('Pipeline validation: '+validation.message);
 if(isCI){await runCI();return;}
 context=canvas.getContext('webgpu');
 if(!context)throw Error('GPUCanvasContext unavailable');
 context.configure({device,format,alphaMode:'opaque'});
 resize();setStage('running','WebGPU rendering');
 requestAnimationFrame(renderFrame);
}
initialize().catch(fail);
