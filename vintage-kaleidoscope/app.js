const get=id=>document.getElementById(id);
const canvas=get('kaleido');
const ci=new URLSearchParams(location.search).has('ci');
const root=document.documentElement;
const state={elapsed:0,rotation:.13,magnification:1,pieceCount:18,glow:.8,paletteId:0,mirrorId:0,randomSeed:5.31,motion:0,speed:.26,paused:false};
let device,context,pipeline,uniform,group,format,last=0,lastDraw=0,fpsStart=0,count=0;
function stage(name,caption=name){root.dataset.webgpuStage=name;get('gpuStatus').textContent=caption;}
function failure(error){root.dataset.webgpuStatus='error';root.dataset.webgpuError=String(error?.stack||error);get('indicator').classList.add('error');get('gpuStatus').textContent='描画エラー';get('fatal').hidden=false;get('fatal').textContent=String(error?.message||error);console.error(error);}
function labels(){
  for(const [id,key] of [['mirror','mirrorId'],['palette','paletteId'],['pieces','pieceCount']])get(id).value=String(state[key]);
  get('zoom').value=String(Math.round(state.magnification*100));
  get('brightness').value=String(Math.round(state.glow*100));
  get('speed').value=String(Math.round(state.speed*100));
  get('piecesVal').textContent=String(state.pieceCount);
  get('zoomVal').textContent=state.magnification.toFixed(2)+'×';
  get('brightnessVal').textContent=Math.round(state.glow*100)+'%';
  get('speedVal').textContent=state.speed===0?'手動':state.speed<.4?'ゆっくり':state.speed<.75?'ふつう':'はやい';
  get('toggle').textContent=state.paused?'▷ 回転を再開':'Ⅱ 回転を止める';
}
function setup(){
  for(const [id,key] of [['mirror','mirrorId'],['palette','paletteId'],['pieces','pieceCount']]){
    get(id).addEventListener('input',e=>{state[key]=+e.target.value;labels();});
  }
  for(const [id,key] of [['zoom','magnification'],['brightness','glow'],['speed','speed']]){
    get(id).addEventListener('input',e=>{state[key]=+e.target.value/100;labels();});
  }
  get('shake').onclick=()=>{state.randomSeed=Math.random()*901+1;state.motion=1;state.rotation+=.25;};
  get('toggle').onclick=()=>{state.paused=!state.paused;labels();};
  get('reset').onclick=()=>{Object.assign(state,{elapsed:0,rotation:.13,magnification:1,pieceCount:18,glow:.8,paletteId:0,mirrorId:0,randomSeed:5.31,motion:0,speed:.26,paused:false});labels();};
  get('fullscreen').onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.viewer').requestFullscreen?.();};
  let pointer=null,lastX=0;
  canvas.onpointerdown=e=>{pointer=e.pointerId;lastX=e.clientX;canvas.setPointerCapture(pointer);};
  canvas.onpointermove=e=>{if(pointer!==e.pointerId)return;let dx=e.clientX-lastX;lastX=e.clientX;state.rotation+=dx*.012;state.motion=Math.max(state.motion,Math.min(1,Math.abs(dx)/28));};
  canvas.onpointerup=canvas.onpointercancel=()=>{pointer=null;};
  canvas.addEventListener('wheel',e=>{e.preventDefault();state.magnification=Math.max(.55,Math.min(1.8,state.magnification*(e.deltaY>0?1.05:.95)));labels();},{passive:false});
  labels();
}
function resize(){
  const rect=canvas.getBoundingClientRect();
  const ratio=Math.min(devicePixelRatio||1,1.3);
  const max=matchMedia('(max-width:750px)').matches?440:660;
  const w=Math.max(2,Math.min(max,Math.round(rect.width*ratio)));
  const h=Math.max(2,Math.min(max,Math.round(rect.height*ratio)));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
}
function draw(view,width,height,copyTexture,readBuffer){
  device.queue.writeBuffer(uniform,0,new Float32Array([width,height,state.elapsed,state.rotation,state.magnification,state.pieceCount,state.glow,state.paletteId,state.mirrorId,state.randomSeed,state.motion,0]));
  const encoder=device.createCommandEncoder();
  const pass=encoder.beginRenderPass({colorAttachments:[{view,loadOp:'clear',storeOp:'store',clearValue:{r:.01,g:.01,b:.01,a:1}}]});
  pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();
  if(copyTexture)encoder.copyTextureToBuffer({texture:copyTexture},{buffer:readBuffer,bytesPerRow:512,rowsPerImage:128},{width:128,height:128,depthOrArrayLayers:1});
  device.queue.submit([encoder.finish()]);
}
async function verify(){
  stage('offscreen-render','GPU描画試験中…');
  const texture=device.createTexture({size:[128,128],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  const buffer=device.createBuffer({size:128*128*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  state.elapsed=1.37;state.pieceCount=8;
  device.pushErrorScope('validation');
  draw(texture.createView(),128,128,texture,buffer);
  stage('submitted-work-wait','GPU完了を検証中…');
  await device.queue.onSubmittedWorkDone();
  const error=await device.popErrorScope();if(error)throw Error(error.message);
  stage('readback','画素の読み戻し中…');
  await buffer.mapAsync(GPUMapMode.READ);
  const pixels=new Uint8Array(buffer.getMappedRange());
  let minimum=255,maximum=0,colors=0,bright=0;
  for(let y=10;y<118;y+=3)for(let x=10;x<118;x+=3){
    const i=(y*128+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    minimum=Math.min(minimum,r,g,b);maximum=Math.max(maximum,r,g,b);
    if(Math.abs(r-g)+Math.abs(g-b)>16)colors++;
    if(r+g+b>140)bright++;
  }
  buffer.unmap();buffer.destroy();texture.destroy();
  if(maximum-minimum<30||colors<30||bright<30)throw Error('readback image lacks detail '+JSON.stringify({minimum,maximum,colors,bright}));
  root.dataset.webgpuStatistics=JSON.stringify({minimum,maximum,colors,bright});
  root.dataset.webgpuStatus='ok';stage('done','GPU描画 OK');get('indicator').classList.add('live');
}
function tick(now){
  const dt=last?Math.min((now-last)/1000,.1):0;last=now;
  if(!state.paused){state.elapsed+=dt;state.rotation+=dt*state.speed*.26;}
  state.motion*=Math.exp(-dt*2.2);
  if(now-lastDraw>1000/30){
    lastDraw=now;resize();
    try{draw(context.getCurrentTexture().createView(),canvas.width,canvas.height);}
    catch(error){failure(error);return;}
    count++;if(!fpsStart)fpsStart=now;
    if(now-fpsStart>1500){get('fps').textContent=Math.round(count*1000/(now-fpsStart))+' FPS';fpsStart=now;count=0;}
  }
  requestAnimationFrame(tick);
}
async function main(){
  root.dataset.webgpuStatus='starting';
  try{
    if(!navigator.gpu)throw Error('このブラウザはWebGPUに対応していません');
    stage('request-adapter');const adapter=await navigator.gpu.requestAdapter();
    if(!adapter)throw Error('WebGPUアダプタが取得できません');
    stage('request-device');device=await adapter.requestDevice();
    device.lost.then(info=>{root.dataset.webgpuLost=info.reason+': '+info.message;if(info.reason!=='destroyed')failure(Error('GPU lost: '+info.message));});
    format=ci?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
    if(!ci){context=canvas.getContext('webgpu');if(!context)throw Error('WebGPU canvas context unavailable');context.configure({device,format,alphaMode:'opaque'});}
    stage('shader-compilation-info');
    const response=await fetch('./shader.wgsl');if(!response.ok)throw Error('Shader HTTP '+response.status);
    const module=device.createShaderModule({code:await response.text()});
    const report=await module.getCompilationInfo();
    const errs=report.messages.filter(m=>m.type==='error');
    if(errs.length)throw Error('WGSL: '+errs.map(m=>m.lineNum+':'+m.message).join('\n'));
    uniform=device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}]});
    group=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:uniform}}]});
    stage('create-pipeline');
    pipeline=await device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),vertex:{module,entryPoint:'vsMain'},fragment:{module,entryPoint:'fsMain',targets:[{format}]},primitive:{topology:'triangle-list'}});
    if(ci)await verify();
    else{stage('done','GPU描画中');root.dataset.webgpuStatus='ok';get('indicator').classList.add('live');requestAnimationFrame(tick);}
  }catch(error){failure(error);}
}
setup();main();
