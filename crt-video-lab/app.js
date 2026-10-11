import {createRenderer} from './gpu.js';
import {buildUi} from './ui.js';
const $ = id => document.getElementById(id);
const canvas=$('screen'), video=$('sourceVideo'), message=$('message');
const diagnostic=window.__crtLab={phase:'script-start',ok:false,frames:0,lastError:'',input:'none'};
let renderer=null, demoFrameId=0, fileUrl='', recorder=null, recordChunks=[];
let mediaAudioSource=null, audioContext=null, mediaOutput=null;
let currentUi=null, busy=false, frameScheduler=0;
const showError=error=>{
const msg=error instanceof Error?error.message:String(error);
diagnostic.lastError=msg;diagnostic.phase='error';message.textContent=msg;
$('status').textContent='ERROR: '+msg;console.error('[CRT Video Lab]',error);
};
const status=phase=>{diagnostic.phase=phase;$('status').textContent='WebGPU · '+phase;};
const notify=text=>{message.textContent=text;};
const timeText=sec=>{
if(!Number.isFinite(sec))return '--:--';
const n=Math.max(0,Math.floor(sec));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
};
function updateTime(){
const duration=video.duration;
$('timeLabel').textContent=timeText(video.currentTime)+' / '+timeText(duration);
if(Number.isFinite(duration)&&duration>0&&!$('seek').matches(':active')){
$('seek').value=String(Math.round(video.currentTime/duration*1000));
}
}
function drawFrame(force=false){
if(renderer?.offline&&renderer.frames>=3&&!force)return;
if(!renderer||busy||video.readyState<2)return;
try{
busy=true;
const didDraw=renderer.render(currentUi.config);
if(didDraw){
diagnostic.frames=renderer.frames;
diagnostic.ok=!renderer.fault;
if(renderer.fault)showError(renderer.fault);
else if(diagnostic.frames%24===1) $('status').textContent='WebGPU '+canvas.width+'×'+canvas.height+' · '+diagnostic.frames+' frames'+(renderer.offline?' · CI offscreen':'');
}
updateTime();
}catch(error){showError(error);}finally{busy=false;}
}
function scheduleFrame(){
if(typeof video.requestVideoFrameCallback==='function'){
const cb=()=>{drawFrame();scheduleFrame();};
frameScheduler=video.requestVideoFrameCallback(cb);
}else{
const cb=()=>{if(!video.paused)drawFrame();frameScheduler=requestAnimationFrame(cb);};
frameScheduler=requestAnimationFrame(cb);
}
}
function stopScheduling(){
if(!frameScheduler)return;
if(typeof video.cancelVideoFrameCallback==='function')video.cancelVideoFrameCallback(frameScheduler);
else cancelAnimationFrame(frameScheduler);
frameScheduler=0;
}
function clearDemo(){
if(demoFrameId)cancelAnimationFrame(demoFrameId);
demoFrameId=0;
if(video.srcObject){for(const track of video.srcObject.getTracks())track.stop();video.srcObject=null;}
}
function paintTestCard(ctx,w,h,clock){
const gradient=ctx.createLinearGradient(0,0,w,h);
gradient.addColorStop(0,'#101929');gradient.addColorStop(1,'#303957');
ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
ctx.lineWidth=1;ctx.strokeStyle='#ffffff23';
for(let x=0;x<w;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
for(let y=0;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
const bars=['#f4f4f4','#f9e400','#08e5ed','#0ce145','#d400df','#fa2d3f','#2639ec'];
bars.forEach((color,index)=>{ctx.fillStyle=color;ctx.fillRect(index*w/7,28,w/7,80);});
const speed=clock/600;
ctx.fillStyle='#081020';ctx.fillRect(35,137,570,165);
ctx.font='bold 36px monospace';ctx.fillStyle='#eaf4ff';ctx.fillText('CRT  VIDEO  LAB',65,185);
ctx.font='20px monospace';ctx.fillStyle='#77eecc';ctx.fillText('480p / 240p / VHS',65,226);
ctx.fillStyle='#a0add0';ctx.font='14px monospace';ctx.fillText('LIVE TEST PATTERN  '+(clock/1000).toFixed(1)+'s',65,266);
const x=510+Math.sin(speed)*40, y=207+Math.cos(speed*1.3)*35;
ctx.shadowColor='#69eeff';ctx.shadowBlur=22;ctx.fillStyle='#83eeff';
ctx.beginPath();ctx.arc(x,y,24,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
ctx.fillStyle='#fff';ctx.fillRect((clock*.2)%w,324,70,12);
}
async function startDemo(){
stopScheduling();video.pause();clearDemo();if(fileUrl){URL.revokeObjectURL(fileUrl);fileUrl='';}
video.removeAttribute('src');video.load();
const sourceCanvas=document.createElement('canvas');sourceCanvas.width=640;sourceCanvas.height=360;
const sourceCtx=sourceCanvas.getContext('2d',{alpha:false});
if(!sourceCtx||!sourceCanvas.captureStream)throw new Error('テスト動画の作成に対応していません');
const redraw=clock=>{paintTestCard(sourceCtx,640,360,clock);demoFrameId=requestAnimationFrame(redraw);};
redraw(0);
video.srcObject=sourceCanvas.captureStream(30);video.loop=true;video.muted=true;diagnostic.input='demo';
await video.play();
scheduleFrame();notify('テストパターンを再生中。自分の動画もドラッグ＆ドロップで読み込めます。');
$('play').textContent='⏸ 一時停止';
drawFrame();
}
async function loadFile(file){
if(!file||!file.type.startsWith('video/')){notify('動画形式のファイルを選択してください');return;}
if(recorder&&recorder.state!=='inactive')recorder.stop();
stopScheduling();video.pause();clearDemo();if(fileUrl)URL.revokeObjectURL(fileUrl);
fileUrl=URL.createObjectURL(file);video.srcObject=null;video.muted=false;
video.src=fileUrl;video.load();diagnostic.input='file:'+file.name;
await new Promise((resolve,reject)=>{
video.addEventListener('loadedmetadata',resolve,{once:true});
video.addEventListener('error',()=>reject(new Error('動画を読み込めません。このブラウザのコーデック対応を確認してください')),{once:true});
});
await video.play();scheduleFrame();$('play').textContent='⏸ 一時停止';
notify(file.name+' · '+video.videoWidth+'×'+video.videoHeight);
drawFrame();
}
async function togglePlaying(){
if(video.readyState<2){await startDemo();return;}
if(video.paused){await video.play();$('play').textContent='⏸ 一時停止';}
else{video.pause();$('play').textContent='▶ 再生';}
drawFrame();
}
function saveBlob(blob,name){
const link=document.createElement('a'),href=URL.createObjectURL(blob);
link.href=href;link.download=name;document.body.append(link);link.click();link.remove();
setTimeout(()=>URL.revokeObjectURL(href),10000);
}
async function savePng(){
drawFrame();
await new Promise(resolve=>requestAnimationFrame(resolve));
canvas.toBlob(blob=>{
if(blob&&blob.size>0)saveBlob(blob,'crt-frame-'+Date.now()+'.png');
else notify('静止画を取り出せませんでした。ブラウザによってはWebGPU canvasのキャプチャが制限されます。');
},'image/png');
}
async function setupAudioRecording(){
if(!window.AudioContext&&!window.webkitAudioContext)return null;
if(!audioContext){
audioContext=new (window.AudioContext||window.webkitAudioContext)();
mediaAudioSource=audioContext.createMediaElementSource(video);
mediaOutput=audioContext.createMediaStreamDestination();
mediaAudioSource.connect(mediaOutput);
mediaAudioSource.connect(audioContext.destination);
}
await audioContext.resume();
return mediaOutput.stream.getAudioTracks();
}
async function toggleRecording(){
if(recorder&&recorder.state!=='inactive'){recorder.stop();return;}
if(!canvas.captureStream||!window.MediaRecorder)throw new Error('このブラウザは録画に未対応です');
const canvasStream=canvas.captureStream(30);
let audioTracks=[];
try{if(diagnostic.input.startsWith('file:'))audioTracks=await setupAudioRecording()||[];}
catch(error){console.warn('Audio capture unavailable:',error);notify('音声トラックなしで録画します');}
const stream=new MediaStream([...canvasStream.getVideoTracks(),...audioTracks]);
const types=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4','video/webm'];
const mimeType=types.find(type=>MediaRecorder.isTypeSupported(type))||'';
recorder=new MediaRecorder(stream,mimeType?{mimeType,videoBitsPerSecond:8_000_000}:{videoBitsPerSecond:8_000_000});
recordChunks=[];
recorder.ondataavailable=event=>{if(event.data.size)recordChunks.push(event.data);};
recorder.onerror=event=>showError(event.error||'録画処理エラー');
recorder.onstop=()=>{
if(recordChunks.length){
const extension=(recorder.mimeType||mimeType).includes('mp4')?'mp4':'webm';
saveBlob(new Blob(recordChunks,{type:recorder.mimeType||mimeType}),'crt-video-'+Date.now()+'.'+extension);
}
canvasStream.getTracks().forEach(track=>track.stop());
$('record').classList.remove('active');$('record').textContent='● 録画';
notify('録画ファイルを保存しました');
};
recorder.start(1000);$('record').classList.add('active');$('record').textContent='■ 録画停止';
notify('録画中: '+(recorder.mimeType||'自動選択'));
}
async function main(){
currentUi=buildUi(()=>drawFrame(true));
video.volume=Number($('volume').value);
$('volume').addEventListener('input',e=>{video.volume=Number(e.target.value);});
$('videoFile').addEventListener('change',e=>{loadFile(e.target.files?.[0]).catch(showError);});
$('demo').addEventListener('click',()=>startDemo().catch(showError));
$('play').addEventListener('click',()=>togglePlaying().catch(showError));
$('restart').addEventListener('click',()=>{if(Number.isFinite(video.duration))video.currentTime=0;drawFrame();});
$('seek').addEventListener('input',e=>{
if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=Number(e.target.value)/1000*video.duration;
});
video.addEventListener('seeked',drawFrame);video.addEventListener('ended',()=>{
$('play').textContent='▶ 再生';if(recorder&&recorder.state==='recording')recorder.stop();
});
$('snapshot').addEventListener('click',()=>savePng().catch(showError));
$('record').addEventListener('click',()=>toggleRecording().catch(showError));
const stage=$('stage');
for(const name of ['dragenter','dragover'])stage.addEventListener(name,event=>{event.preventDefault();stage.classList.add('dropping');});
stage.addEventListener('dragleave',event=>{if(!stage.contains(event.relatedTarget))stage.classList.remove('dropping');});
stage.addEventListener('drop',event=>{event.preventDefault();stage.classList.remove('dropping');loadFile(event.dataTransfer?.files?.[0]).catch(showError);});
renderer=await createRenderer(canvas,video,status);
window.__crtProbe=async()=>({...await renderer.probe(),state:{...diagnostic},config:{...currentUi.config}});
await startDemo();status('done');
}
main().catch(showError);
