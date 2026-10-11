import {createRenderer} from './gpu.js';
import {buildUi} from './ui.js';
import {createSources} from './sources.js';
import {createCapture} from './capture.js';

const $=id=>document.getElementById(id);
const video=$('sourceVideo'),canvas=$('screen');
const diagnostic=window.__crtLab={phase:'script-start',ok:false,frames:0,lastError:'',
  input:'none',cameraActive:false,cameraError:'',renderFps:0};
let renderer=null,ui=null,source=null,capture=null,frameScheduler=0,busy=false;
let lastTime=0,framesInWindow=0,lastFpsUpdate=performance.now(),sourceSwitch=0;
const status=phase=>{diagnostic.phase=phase;$('status').textContent='WebGPU · '+phase;};
const notify=value=>{$('message').textContent=value;};
function fatal(error){
  const detail=error?.message||String(error);
  diagnostic.lastError=detail;diagnostic.phase='error';diagnostic.ok=false;
  $('status').textContent='ERROR: '+detail;
  notify(detail);console.error('[CRT Video Lab]',error);
}
function cameraError(error){
  const detail=error?.message||String(error);diagnostic.cameraError=detail;
  notify('カメラ: '+detail);console.warn('[camera]',detail);
}
function formatTime(time){
  if(!Number.isFinite(time))return '--:--';
  const sec=Math.max(0,Math.floor(time));
  return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
}
function updateTime(){
  const duration=video.duration,live=source?.kind==='camera'||source?.kind==='demo';
  $('seek').disabled=live||!Number.isFinite(duration)||duration<=0;
  $('restart').disabled=live||!Number.isFinite(duration)||duration<=0;
  $('timeLabel').textContent=live?'LIVE '+video.videoWidth+'×'+video.videoHeight:
    formatTime(video.currentTime)+' / '+formatTime(duration);
  if(!$('seek').disabled&&!$('seek').matches(':active')){
    $('seek').value=String(Math.round(video.currentTime/duration*1000));
  }
}
function settings(){
  return {...ui.config,mirror:$('mirror').checked?1:0};
}
function drawFrame(force=false){
  if(!renderer||!ui||busy||video.readyState<2||!video.videoWidth)return;
  if(renderer.offline&&renderer.frames>=3&&!force)return;
  const stamp=performance.now(),maxFps=Number($('fpsLimit').value)||30;
  if(!force&&stamp-lastTime<1000/maxFps-2)return;
  try{
    busy=true;lastTime=stamp;
    if(renderer.render(settings())){
      diagnostic.frames=renderer.frames;diagnostic.ok=!renderer.fault;
      diagnostic.input=source?.kind||'none';
      framesInWindow++;
      if(stamp-lastFpsUpdate>1300){
        diagnostic.renderFps=Math.round(framesInWindow*10000/(stamp-lastFpsUpdate))/10;
        $('performance').textContent=canvas.width+'×'+canvas.height+' / '+diagnostic.renderFps+' FPS';
        framesInWindow=0;lastFpsUpdate=stamp;
      }
      if(renderer.fault)fatal(new Error(renderer.fault));
      else if(diagnostic.frames%30===1)$('status').textContent=
        'WebGPU · '+canvas.width+'×'+canvas.height+(renderer.offline?' · CI':'');
    }
    updateTime();
  }catch(error){fatal(error);}
  finally{busy=false;}
}
function stopScheduling(){
  if(!frameScheduler)return;
  if(typeof video.cancelVideoFrameCallback==='function')video.cancelVideoFrameCallback(frameScheduler);
  else cancelAnimationFrame(frameScheduler);
  frameScheduler=0;
}
function scheduleFrames(){
  stopScheduling();
  if(typeof video.requestVideoFrameCallback==='function'){
    const next=()=>{drawFrame();frameScheduler=video.requestVideoFrameCallback(next);};
    frameScheduler=video.requestVideoFrameCallback(next);
  }else{
    const next=()=>{if(!video.paused)drawFrame();frameScheduler=requestAnimationFrame(next);};
    frameScheduler=requestAnimationFrame(next);
  }
}
function setSourceState(detail){
  diagnostic.input=detail.type;
  diagnostic.cameraActive=detail.type==='camera';
  diagnostic.cameraError='';
  $('sourceName').textContent=detail.label;
  $('cameraOff').disabled=detail.type!=='camera';
  $('mirror').checked=detail.type==='camera'&&detail.facing==='user';
  $('play').textContent='⏸ 一時停止';
  video.muted=detail.type!=='file';
  renderer?.resetHistory();
  framesInWindow=0;lastFpsUpdate=performance.now();lastTime=0;
  scheduleFrames();drawFrame(true);
  updateTime();
  notify(detail.type==='camera'?'📷 カメラ映像 '+detail.width+'×'+detail.height+
    (detail.stream?.getAudioTracks().length?' + マイク':' / マイクOFF'):
    detail.label+' · '+detail.width+'×'+detail.height);
}
function onSourceStop(){
  stopScheduling();capture?.stop();
  diagnostic.cameraActive=false;diagnostic.input='none';
  $('cameraOff').disabled=true;$('sourceName').textContent='停止中';
  $('play').textContent='▶ 再生';updateTime();
}
async function refreshCameras(){
  if(!source)return;
  const choices=await source.listDevices();
  const select=$('cameraDevice'),selected=select.value;
  select.replaceChildren();
  const auto=document.createElement('option');auto.value='';auto.textContent='自動 (前面/背面)';select.append(auto);
  choices.forEach((camera,index)=>{
    const option=document.createElement('option');option.value=camera.id;
    option.textContent=camera.name||'カメラ '+(index+1);select.append(option);
  });
  if(choices.some(item=>item.id===selected))select.value=selected;
  else select.value='';
  diagnostic.availableCameras=choices.length;
}
async function openCamera(){
  if(!source)return;
  const requested=++sourceSwitch;
  $('cameraStart').disabled=true;notify('カメラのアクセス権限を確認しています…');
  const resolution=$('cameraResolution').value.split('x').map(Number);
  try{
    const opened=await source.camera({
      deviceId:$('cameraDevice').value,facingMode:$('cameraFacing').value,
      width:resolution[0],height:resolution[1],microphone:$('cameraMic').checked
    });
    if(requested===sourceSwitch&&opened){
      await refreshCameras();
      const track=source.stream?.getVideoTracks()[0];
      const cameraId=track?.getSettings()?.deviceId;
      if(cameraId&&[...$('cameraDevice').options].some(x=>x.value===cameraId))
        $('cameraDevice').value=cameraId;
    }
  }catch(error){if(requested===sourceSwitch)cameraError(error);}
  finally{if(requested===sourceSwitch)$('cameraStart').disabled=false;}
}
async function switchDemo(){
  sourceSwitch++;$('cameraStart').disabled=false;
  await source.demo();
}
async function openFile(file){
  if(!file)return;sourceSwitch++;$('cameraStart').disabled=false;
  await source.file(file);$('videoFile').value='';
}
async function togglePlay(){
  if(video.readyState<2){await switchDemo();return;}
  if(video.paused){await video.play();$('play').textContent='⏸ 一時停止';}
  else {video.pause();$('play').textContent='▶ 再生';}
  drawFrame(true);
}
function connectControls(){
  $('videoFile').addEventListener('change',event=>openFile(event.target.files?.[0]).catch(fatal));
  $('cameraStart').addEventListener('click',()=>openCamera());
  $('cameraOff').addEventListener('click',()=>switchDemo().catch(fatal));
  $('cameraFacing').addEventListener('change',()=>{$('cameraDevice').value='';if(source.kind==='camera')openCamera();});
  $('cameraResolution').addEventListener('change',()=>{if(source.kind==='camera')openCamera();});
  $('cameraDevice').addEventListener('change',()=>{if(source.kind==='camera')openCamera();});
  $('demo').addEventListener('click',()=>switchDemo().catch(fatal));
  $('play').addEventListener('click',()=>togglePlay().catch(fatal));
  $('restart').addEventListener('click',()=>{
    if(Number.isFinite(video.duration))video.currentTime=0;
    drawFrame(true);
  });
  $('seek').addEventListener('input',event=>{
    if(Number.isFinite(video.duration)&&video.duration>0)
      video.currentTime=video.duration*Number(event.target.value)/1000;
  });
  $('mirror').addEventListener('change',()=>drawFrame(true));
  $('volume').addEventListener('input',event=>{video.volume=Number(event.target.value);});
  $('fpsLimit').addEventListener('change',()=>drawFrame(true));
  $('snapshot').addEventListener('click',async()=>{
    try{drawFrame(true);await new Promise(requestAnimationFrame);await capture.snapshot();}
    catch(error){notify(error.message);}
  });
  $('record').addEventListener('click',()=>capture.record({
    fps:Number($('fpsLimit').value),audio:$('recordAudio').checked
  }).catch(error=>notify(error.message)));
  video.addEventListener('seeked',()=>drawFrame(true));
  video.addEventListener('ended',()=>{
    $('play').textContent='▶ 再生';capture?.stop();
  });
  const stage=$('stage');
  for(const type of ['dragenter','dragover'])
    stage.addEventListener(type,event=>{event.preventDefault();stage.classList.add('dropping');});
  stage.addEventListener('dragleave',event=>{
    if(!stage.contains(event.relatedTarget))stage.classList.remove('dropping');
  });
  stage.addEventListener('drop',event=>{
    event.preventDefault();stage.classList.remove('dropping');
    openFile(event.dataTransfer?.files?.[0]).catch(fatal);
  });
  navigator.mediaDevices?.addEventListener?.('devicechange',()=>{
    refreshCameras().catch(error=>console.warn('enumerateDevices',error));
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)drawFrame(true);});
  window.addEventListener('pagehide',()=>{
    stopScheduling();capture?.destroy();source?.destroy();renderer?.dispose();
  },{once:true});
}
async function main(){
  ui=buildUi(()=>drawFrame(true));
  source=createSources(video,{onReady:setSourceState,onStop:onSourceStop,onNotice:notify});
  capture=createCapture({canvas,video,getSource:()=>source,onNotice:notify,onError:fatal});
  video.volume=Number($('volume').value);
  connectControls();updateTime();
  renderer=await createRenderer(canvas,video,status);
  window.__crtProbe=async()=>({...await renderer.probe(),
    state:{...diagnostic},config:settings(),cameraTracks:source.stream?.getTracks()
      .map(track=>({kind:track.kind,readyState:track.readyState,muted:track.muted}))||[]});
  window.__crtTest={get source(){return source.kind},get video(){return video},
    get stream(){return source.stream}};
  await switchDemo();status('done');
  await refreshCameras().catch(()=>{});
}
main().catch(fatal);
