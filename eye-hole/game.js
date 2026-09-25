const CI_MODE = new URLSearchParams(location.search).get('ci') === '1';
const canvas = document.getElementById('gameCanvas');
const statsNode = document.getElementById('stats');
const alertFill = document.getElementById('alertFill');
const alertText = document.getElementById('alertText');
const energyFill = document.getElementById('energyFill');
const energyText = document.getElementById('energyText');
const messageNode = document.getElementById('message');
const startOverlay = document.getElementById('startOverlay');
const endOverlay = document.getElementById('endOverlay');
const endTitle = document.getElementById('endTitle');
const endText = document.getElementById('endText');
const ciStatus = document.getElementById('ciStatus');

const WORLD_RADIUS = 24.0;
const PLAYER_RADIUS = 0.52;
const MAX_DIGS = 32;
const DIG_RADIUS = 2.25;
const EXIT_POSITION = [0, 0, -18.2];
const wallBoxes = [
  {c:[0,0,8.0], h:[24.0,24.0,0.72]},
  {c:[0,0,1.0], h:[24.0,24.0,0.72]},
  {c:[0,0,-7.0], h:[24.0,24.0,0.72]}
];
const eyePositions = [
  [-6.2, 3.2, 8.85], [0.0, 4.0, 8.85], [6.1, 2.8, 8.85], [-3.2,-3.4,8.85], [4.1,-2.8,8.85],
  [-7.0, 2.4, 1.85], [-1.8,-3.7,1.85], [4.4,3.4,1.85], [7.3,-1.7,1.85],
  [-5.5,3.6,-6.15], [0.7,-3.8,-6.15], [5.9,2.6,-6.15]
];

let cameraPos = [0, 0, 15.5];
let cameraYaw = -Math.PI * 0.5;
let cameraPitch = 0;
let alertLevel = 0;
let drillEnergy = 8;
let scanStrength = 0;
let digSpheres = [];
let finishedState = null;
let watchedEyes = 0;
let visibleEyes = 0;
let gpuDevice = null;
let gpuPipeline = null;
let gpuBindGroup = null;
let frameUniformBuffer = null;
let digStorageBuffer = null;
let outputFormat = 'rgba8unorm';
let canvasContext = null;
let ciTexture = null;
let lastFrameTime = performance.now();
let fpsSmooth = 60;
const keyState = new Set();

function setCiStage(stage, detail='') {
  document.documentElement.dataset.webgpuStage = stage;
  ciStatus.textContent = detail ? `${stage}: ${detail}` : stage;
}

function vecAdd(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
function vecSub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function vecScale(a,s){return[a[0]*s,a[1]*s,a[2]*s]}
function vecDot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function vecLength(a){return Math.hypot(a[0],a[1],a[2])}
function vecNormalize(a){const l=Math.max(vecLength(a),1e-8);return[a[0]/l,a[1]/l,a[2]/l]}
function vecCross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function clamp(v,a,b){return Math.min(b,Math.max(a,v))}

function cameraBasis(){
  const cp=Math.cos(cameraPitch), sp=Math.sin(cameraPitch), cy=Math.cos(cameraYaw), sy=Math.sin(cameraYaw);
  const forward=vecNormalize([cy*cp,sp,sy*cp]);
  const right=vecNormalize(vecCross(forward,[0,1,0]));
  const up=vecNormalize(vecCross(right,forward));
  return{forward,right,up};
}

function sdSphereJs(point,center,radius){return vecLength(vecSub(point,center))-radius}
function sdBoxJs(point,center,halfSize){
  const q=[Math.abs(point[0]-center[0])-halfSize[0],Math.abs(point[1]-center[1])-halfSize[1],Math.abs(point[2]-center[2])-halfSize[2]];
  const outside=Math.hypot(Math.max(q[0],0),Math.max(q[1],0),Math.max(q[2],0));
  return outside+Math.min(Math.max(q[0],Math.max(q[1],q[2])),0);
}
function wallDistanceJs(point,wall){
  let d=sdBoxJs(point,wall.c,wall.h);
  for(const dig of digSpheres){d=Math.max(d,-sdSphereJs(point,dig.c,dig.r));}
  return d;
}
function sceneFieldJs(point){
  let bestDistance=WORLD_RADIUS-vecLength(point), materialId=1;
  for(const wall of wallBoxes){const d=wallDistanceJs(point,wall);if(d<bestDistance){bestDistance=d;materialId=2;}}
  return{distance:bestDistance,materialId};
}
function canOccupy(point){return sceneFieldJs(point).distance>PLAYER_RADIUS}

function rayMarchJs(origin,direction,maxDistance=50){
  let travel=0;
  for(let i=0;i<120;i++){
    const point=vecAdd(origin,vecScale(direction,travel));
    const field=sceneFieldJs(point);
    if(Math.abs(field.distance)<0.035||field.distance<0){return{hit:true,point,materialId:field.materialId,distance:travel};}
    travel+=Math.max(field.distance*0.72,0.025);
    if(travel>maxDistance)break;
  }
  return{hit:false};
}

function isLineClear(from,to){
  const delta=vecSub(to,from);const total=vecLength(delta);if(total<0.1)return true;
  const direction=vecScale(delta,1/total);let travel=0.78;
  for(let i=0;i<60&&travel<total-0.65;i++){
    const point=vecAdd(from,vecScale(direction,travel));
    const distance=sceneFieldJs(point).distance;
    if(distance<0.08)return false;
    travel+=Math.max(distance*0.7,0.09);
  }
  return true;
}

function resetGame(){
  cameraPos=[0,0,15.5];cameraYaw=-Math.PI*.5;cameraPitch=0;alertLevel=0;drillEnergy=8;scanStrength=0;digSpheres=[];finishedState=null;watchedEyes=0;visibleEyes=0;
  endOverlay.classList.add('hidden');updateDigBuffer();
}

function performDig(){
  if(finishedState||drillEnergy<1)return;
  const {forward}=cameraBasis();
  const hit=rayMarchJs(cameraPos,forward,42);
  if(!hit.hit||hit.materialId!==2){messageNode.textContent='DRILL: wall required';return;}
  const center=vecAdd(hit.point,vecScale(forward,1.15));
  digSpheres.push({c:center,r:DIG_RADIUS});
  if(digSpheres.length>MAX_DIGS)digSpheres.shift();
  drillEnergy-=1;alertLevel=clamp(alertLevel+4,0,100);updateDigBuffer();
  messageNode.textContent=`DRILL: cavity ${digSpheres.length}/${MAX_DIGS}`;
}

function finishGame(state){
  if(finishedState)return;finishedState=state;document.exitPointerLock?.();
  if(state==='win'){
    endTitle.textContent='ESCAPED';endTitle.className='ok';endText.textContent='出口へ到達しました。掘削痕はリスタートまで保持されています。';
  }else{
    endTitle.textContent='SEEN';endTitle.className='warn';endText.textContent='警戒値が100%に到達しました。目玉を見返す、遮蔽物を作る、素早く掘り進む、の組み合わせが必要です。';
  }
  endOverlay.classList.remove('hidden');
}

let gazeAccumulator=0;
function updateGaze(dt){
  gazeAccumulator+=dt;if(gazeAccumulator<0.12)return;const sampleDt=gazeAccumulator;gazeAccumulator=0;
  const {forward}=cameraBasis();visibleEyes=0;watchedEyes=0;
  for(const eye of eyePositions){
    if(!isLineClear(eye,cameraPos))continue;
    visibleEyes++;
    const toEye=vecNormalize(vecSub(eye,cameraPos));
    if(vecDot(forward,toEye)>0.91)watchedEyes++;
  }
  const unwatched=Math.max(0,visibleEyes-watchedEyes);
  if(unwatched>0)alertLevel+=sampleDt*(2.7+unwatched*1.35);
  else alertLevel-=sampleDt*8.0;
  alertLevel=clamp(alertLevel,0,100);
  if(alertLevel>=100)finishGame('lose');
}

function updateMovement(dt){
  if(finishedState)return;
  const {forward,right}=cameraBasis();
  const planarForward=vecNormalize([forward[0],0,forward[2]]);
  let movement=[0,0,0];
  if(keyState.has('KeyW'))movement=vecAdd(movement,planarForward);
  if(keyState.has('KeyS'))movement=vecSub(movement,planarForward);
  if(keyState.has('KeyD'))movement=vecAdd(movement,right);
  if(keyState.has('KeyA'))movement=vecSub(movement,right);
  if(keyState.has('Space'))movement[1]+=1;
  if(keyState.has('KeyC'))movement[1]-=1;
  const length=vecLength(movement);
  if(length>0){
    movement=vecScale(movement,1/length);const speed=(keyState.has('ShiftLeft')||keyState.has('ShiftRight'))?9.2:5.4;
    const delta=vecScale(movement,speed*dt);
    const tryX=[cameraPos[0]+delta[0],cameraPos[1],cameraPos[2]];if(canOccupy(tryX))cameraPos=tryX;
    const tryY=[cameraPos[0],cameraPos[1]+delta[1],cameraPos[2]];if(canOccupy(tryY))cameraPos=tryY;
    const tryZ=[cameraPos[0],cameraPos[1],cameraPos[2]+delta[2]];if(canOccupy(tryZ))cameraPos=tryZ;
  }
  drillEnergy=clamp(drillEnergy+dt*0.12,0,8);
  scanStrength=Math.max(0,scanStrength-dt*0.8);
  if(vecLength(vecSub(cameraPos,EXIT_POSITION))<1.65)finishGame('win');
}

let shaderSource='';

function updateDigBuffer(){
  if(!gpuDevice||!digStorageBuffer)return;
  const values=new Float32Array(MAX_DIGS*4);
  digSpheres.forEach((dig,index)=>{values[index*4]=dig.c[0];values[index*4+1]=dig.c[1];values[index*4+2]=dig.c[2];values[index*4+3]=dig.r;});
  gpuDevice.queue.writeBuffer(digStorageBuffer,0,values);
}

function writeFrameUniforms(width,height,timeSeconds){
  const {forward,right,up}=cameraBasis();
  const values=new Float32Array(24);
  values[0]=width;values[1]=height;values[2]=timeSeconds;values[3]=digSpheres.length;
  values.set([cameraPos[0],cameraPos[1],cameraPos[2],0],4);
  values.set([forward[0],forward[1],forward[2],0],8);
  values.set([right[0],right[1],right[2],0],12);
  values.set([up[0],up[1],up[2],0],16);
  values.set([alertLevel/100,scanStrength,finishedState==='win'?1:0,0],20);
  gpuDevice.queue.writeBuffer(frameUniformBuffer,0,values);
}

function encodeFrame(targetView,width,height,timeSeconds){
  writeFrameUniforms(width,height,timeSeconds);
  const encoder=gpuDevice.createCommandEncoder({label:'eye-hole-frame-encoder'});
  const renderPass=encoder.beginRenderPass({colorAttachments:[{view:targetView,clearValue:{r:0.002,g:0.004,b:0.008,a:1},loadOp:'clear',storeOp:'store'}]});
  renderPass.setPipeline(gpuPipeline);renderPass.setBindGroup(0,gpuBindGroup);renderPass.draw(3,1,0,0);renderPass.end();
  gpuDevice.queue.submit([encoder.finish()]);
}

function resizeCanvas(){
  const dpr=Math.min(devicePixelRatio||1,1.5);const width=Math.max(1,Math.floor(innerWidth*dpr));const height=Math.max(1,Math.floor(innerHeight*dpr));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
}

function updateHud(){
  alertFill.style.width=`${alertLevel}%`;alertText.textContent=`${Math.round(alertLevel)}%`;
  energyFill.style.width=`${drillEnergy/8*100}%`;energyText.textContent=drillEnergy.toFixed(1);
  statsNode.innerHTML=`FPS ${fpsSmooth.toFixed(0)} &nbsp; DIG ${digSpheres.length}/${MAX_DIGS}<br>EYES visible ${visibleEyes} / watched ${watchedEyes}<br>POS ${cameraPos.map(v=>v.toFixed(1)).join(' · ')}`;
  if(document.pointerLockElement===canvas){messageNode.textContent=scanStrength>0.05?'SCAN ACTIVE':'LMB DRILL · RMB SCAN · ESC RELEASE';}else if(!finishedState){messageNode.textContent='Click to capture mouse';}
}

function frame(now){
  const dt=Math.min((now-lastFrameTime)/1000,0.05);lastFrameTime=now;fpsSmooth=fpsSmooth*.92+(1/Math.max(dt,.001))*.08;
  if(document.pointerLockElement===canvas){updateMovement(dt);updateGaze(dt);}
  resizeCanvas();
  const targetTexture=canvasContext.getCurrentTexture();encodeFrame(targetTexture.createView(),canvas.width,canvas.height,now/1000);updateHud();requestAnimationFrame(frame);
}

async function initializeWebGpu(){
  try{
    setCiStage('script-start');
    if(!navigator.gpu)throw new Error('navigator.gpu is unavailable');
    setCiStage('request-adapter');
    const gpuAdapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!gpuAdapter)throw new Error('requestAdapter returned null');
    setCiStage('request-device');
    gpuDevice=await gpuAdapter.requestDevice();
    gpuDevice.lost.then(info=>{document.documentElement.dataset.webgpuLost=`${info.reason}:${info.message}`;if(!CI_MODE)statsNode.textContent=`GPU LOST: ${info.reason} ${info.message}`;});
    setCiStage('shader-fetch');
    const shaderResponse=await fetch('./shader.wgsl',{cache:'no-store'});if(!shaderResponse.ok)throw new Error(`shader fetch failed: ${shaderResponse.status}`);
    shaderSource=await shaderResponse.text();
    setCiStage('shader-compilation-info');
    const shaderModule=gpuDevice.createShaderModule({label:'eye-hole-shader',code:shaderSource});
    const compilationInfo=await shaderModule.getCompilationInfo();
    const compilationErrors=compilationInfo.messages.filter(message=>message.type==='error');
    if(compilationErrors.length)throw new Error(compilationErrors.map(message=>`${message.lineNum}:${message.linePos} ${message.message}`).join('\n'));
    gpuDevice.pushErrorScope('validation');
    setCiStage('create-pipeline');
    gpuPipeline=gpuDevice.createRenderPipeline({label:'eye-hole-pipeline',layout:'auto',vertex:{module:shaderModule,entryPoint:'vertexMain'},fragment:{module:shaderModule,entryPoint:'fragmentMain',targets:[{format:outputFormat}]},primitive:{topology:'triangle-list'}});
    frameUniformBuffer=gpuDevice.createBuffer({label:'eye-hole-frame-uniforms',size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    digStorageBuffer=gpuDevice.createBuffer({label:'eye-hole-dig-storage',size:MAX_DIGS*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    gpuBindGroup=gpuDevice.createBindGroup({label:'eye-hole-bind-group',layout:gpuPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:frameUniformBuffer}},{binding:1,resource:{buffer:digStorageBuffer}}]});
    updateDigBuffer();
    if(CI_MODE){
      const ciWidth=320,ciHeight=180;
      ciTexture=gpuDevice.createTexture({label:'eye-hole-ci-target',size:[ciWidth,ciHeight,1],format:outputFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
      setCiStage('validation-scope');encodeFrame(ciTexture.createView(),ciWidth,ciHeight,0.5);
      setCiStage('submitted-work-wait');await gpuDevice.queue.onSubmittedWorkDone();
      const validationError=await gpuDevice.popErrorScope();if(validationError)throw validationError;
      setCiStage('done','ok');document.documentElement.dataset.webgpuStatus='ok';ciStatus.textContent='ok';return;
    }
    canvasContext=canvas.getContext('webgpu');if(!canvasContext)throw new Error('webgpu canvas context unavailable');
    canvasContext.configure({device:gpuDevice,format:outputFormat,alphaMode:'opaque'});
    const validationError=await gpuDevice.popErrorScope();if(validationError)throw validationError;
    setCiStage('done','interactive');requestAnimationFrame(frame);
  }catch(error){
    console.error(error);document.documentElement.dataset.webgpuStatus='error';document.documentElement.dataset.webgpuError=String(error?.message||error);setCiStage('error',String(error?.message||error));statsNode.textContent=`WebGPU ERROR: ${error?.message||error}`;
    if(!CI_MODE){startOverlay.classList.remove('hidden');document.getElementById('startButton').disabled=true;document.getElementById('startButton').textContent='WEBGPU INITIALIZATION FAILED';}
  }
}

window.addEventListener('keydown',event=>{keyState.add(event.code);if(event.code==='KeyR')resetGame();if(['Space','KeyW','KeyA','KeyS','KeyD'].includes(event.code))event.preventDefault();});
window.addEventListener('keyup',event=>keyState.delete(event.code));
canvas.addEventListener('click',()=>{if(document.pointerLockElement!==canvas&&!finishedState)canvas.requestPointerLock();});
canvas.addEventListener('mousedown',event=>{if(document.pointerLockElement!==canvas)return;if(event.button===0)performDig();if(event.button===2){scanStrength=1;alertLevel=clamp(alertLevel+1.5,0,100);}});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
window.addEventListener('mousemove',event=>{if(document.pointerLockElement!==canvas||finishedState)return;cameraYaw+=event.movementX*0.0021;cameraPitch=clamp(cameraPitch-event.movementY*0.0021,-1.45,1.45);});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas)startOverlay.classList.add('hidden');});
document.getElementById('startButton').addEventListener('click',()=>canvas.requestPointerLock());
document.getElementById('restartButton').addEventListener('click',()=>{resetGame();canvas.requestPointerLock();});
if(CI_MODE){startOverlay.classList.add('hidden');document.getElementById('hud').classList.add('hidden');ciStatus.classList.remove('hidden');}
initializeWebGpu();
