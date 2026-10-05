import { PROFILES, cloneProfile } from './data.mjs';
import { classifyVowel, estimateFormants, summarizeCalibration, clamp } from './dsp.mjs';
import { drawVowelMap } from './plot.mjs';

const $=id=>document.getElementById(id);
const el={
  mic:$('micBtn'),clear:$('clearBtn'),symbol:$('symbol'),word:$('word'),ipa:$('ipa'),confidence:$('confidence'),
  f1:$('f1'),f2:$('f2'),f3:$('f3'),quality:$('quality'),level:$('level'),levelBar:$('levelBar'),status:$('status'),
  canvas:$('vowelMap'),profile:$('profile'),calGrid:$('calGrid'),calInfo:$('calInfo'),refs:$('refs'),
  reset:$('resetCalBtn'),threshold:$('threshold'),thresholdOut:$('thresholdOut')
};
let profileName='adult',refs=loadSaved()||cloneProfile(profileName);
let audio=null,analyser=null,stream=null,timeData=null,raf=0,running=false,lastAt=0;
let sf1=null,sf2=null,sf3=null,trail=[],votes=[],calibration=null,currentKey='';

function loadSaved(){
  try{
    const x=JSON.parse(localStorage.getItem('english-vowel-listener-v1')||'null');
    if(!x||!PROFILES[x.profile])return null;
    profileName=x.profile; el?.profile&&(el.profile.value=profileName);
    const base=cloneProfile(profileName);
    for(const k of Object.keys(base))if(x.refs?.[k]&&['f1','f2','f3'].every(p=>Number.isFinite(x.refs[k][p]))){
      Object.assign(base[k],{f1:x.refs[k].f1,f2:x.refs[k].f2,f3:x.refs[k].f3});
    }
    return base;
  }catch{return null}
}
function save(){
  try{localStorage.setItem('english-vowel-listener-v1',JSON.stringify({profile:profileName,refs}))}catch{}
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function setStatus(s){el.status.innerHTML=s}
function renderCalibration(){
  el.calGrid.replaceChildren(...Object.entries(refs).map(([key,r])=>{
    const b=document.createElement('button');b.type='button';b.className='calBtn';b.dataset.vowel=key;b.disabled=!running;
    b.innerHTML='<span class="big">'+r.label+'</span><span class="wordSm">'+r.word+' '+r.ipa+'</span>';return b;
  }));
  el.refs.replaceChildren(...Object.entries(refs).map(([key,r])=>{
    const d=document.createElement('div');d.className='ref';
    d.innerHTML='<b>'+r.label+' '+r.ipa+'</b>'+r.word+'<br>F1 '+Math.round(r.f1)+'<br>F2 '+Math.round(r.f2)+'<br>F3 '+Math.round(r.f3);
    return d;
  }));
}
function draw(){drawVowelMap(el.canvas,refs,trail,currentKey)}
function stableVote(a){
  const m=new Map();for(const v of a)m.set(v,(m.get(v)||0)+1);
  return [...m].sort((x,y)=>y[1]-x[1])[0]?.[0]||a.at(-1);
}
function updateLevel(v){
  const db=v>0?20*Math.log10(v):-80;el.level.textContent=Math.round(db)+' dB';
  el.levelBar.style.width=clamp((db+60)/55*100,0,100)+'%';
}
function noDetection(msg){
  el.symbol.textContent='—';el.word.textContent='waiting';el.ipa.textContent='/—/';el.confidence.textContent=msg;
  el.f1.textContent=el.f2.textContent=el.f3.textContent=el.quality.textContent='—';votes.length=0;currentKey='';draw();
}
function showDetection(c,f1,f2,f3,q,confidence){
  el.symbol.textContent=c.label;el.word.textContent=c.word;el.ipa.textContent=c.ipa;
  el.confidence.textContent='confidence '+Math.round(confidence)+'%';
  el.f1.textContent=Math.round(f1);el.f2.textContent=Math.round(f2);el.f3.textContent=Number.isFinite(f3)?Math.round(f3):'—';
  el.quality.textContent=Math.round(q*100)+'%';currentKey=c.key;
}
async function startMic(){
  if(running){stopMic();return}
  if(!navigator.mediaDevices?.getUserMedia){setStatus('<strong>Microphone API unavailable.</strong> Open this page over HTTPS in Safari or Chrome.');return}
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}});
    audio=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();
    const src=audio.createMediaStreamSource(stream);analyser=audio.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=0;src.connect(analyser);
    timeData=new Float32Array(analyser.fftSize);running=true;el.mic.textContent='Stop microphone';el.mic.classList.remove('primary');el.mic.classList.add('stop');el.clear.disabled=false;
    renderCalibration();setStatus('<strong>Listening</strong> · '+audio.sampleRate.toLocaleString()+' Hz input · sustain one vowel at a time.');raf=requestAnimationFrame(loop);
  }catch(err){setStatus('<strong>Could not start microphone.</strong> '+escapeHtml(err?.message||err))}
}
function stopMic(){
  running=false;cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());audio?.close().catch(()=>{});
  audio=analyser=stream=timeData=null;calibration=null;el.mic.textContent='Start microphone';el.mic.classList.add('primary');el.mic.classList.remove('stop');
  renderCalibration();setStatus('Stopped.');currentKey='';draw();
}
function loop(t){
  if(!running||!analyser)return;raf=requestAnimationFrame(loop);if(t-lastAt<70)return;lastAt=t;
  analyser.getFloatTimeDomainData(timeData);
  const r=estimateFormants(timeData,audio.sampleRate,{minRms:Number(el.threshold.value)});updateLevel(r.rms||0);
  if(!r.voiced||!Number.isFinite(r.f1)||!Number.isFinite(r.f2)){noDetection(r.voiced?'formants not stable':'waiting for voice');return}
  const a=.36;sf1=sf1==null?r.f1:sf1+a*(r.f1-sf1);sf2=sf2==null?r.f2:sf2+a*(r.f2-sf2);
  sf3=Number.isFinite(r.f3)?(sf3==null?r.f3:sf3+a*(r.f3-sf3)):sf3;
  const plausible=sf1>=200&&sf1<=1150&&sf2>=650&&sf2<=3200&&sf2>sf1+180;
  const c=plausible?classifyVowel(sf1,sf2,sf3,refs):null;if(!c){noDetection('waiting for a vowel-like formant pattern');return}
  votes.push(c.key);if(votes.length>7)votes.shift();const key=stableVote(votes),base=refs[key];
  const shown={...c,key,label:base.label,ipa:base.ipa,word:base.word},conf=key===c.key?c.confidence:c.confidence*.72;
  showDetection(shown,sf1,sf2,sf3,r.quality,conf);
  trail.push({f1:sf1,f2:sf2,t:performance.now()});if(trail.length>100)trail.shift();draw();collectCalibration(sf1,sf2,sf3);
}
function beginCalibration(key,b){
  if(!running||calibration)return;calibration={key,samples:[],until:performance.now()+1400,button:b};b.classList.add('recording');
  el.calInfo.textContent='Hold '+refs[key].word+' '+refs[key].ipa+' steadily…';
}
function collectCalibration(f1,f2,f3){
  if(!calibration||!Number.isFinite(f3))return;calibration.samples.push({f1,f2,f3});if(performance.now()<calibration.until)return;
  const {key,samples,button}=calibration,s=summarizeCalibration(samples);button.classList.remove('recording');
  if(s&&samples.length>=5){Object.assign(refs[key],{f1:Math.round(s.f1),f2:Math.round(s.f2),f3:Math.round(s.f3)});save();renderCalibration();draw();
    el.calInfo.textContent='Saved '+refs[key].word+': F1 '+refs[key].f1+', F2 '+refs[key].f2+', F3 '+refs[key].f3+' Hz ('+samples.length+' frames).';
  }else el.calInfo.textContent='Not enough stable F1/F2/F3 frames. Try again with a steady, slightly louder vowel.';
  calibration=null;
}
el.mic.addEventListener('click',startMic);
el.clear.addEventListener('click',()=>{trail=[];draw()});
el.calGrid.addEventListener('click',e=>{const b=e.target.closest('button[data-vowel]');if(b)beginCalibration(b.dataset.vowel,b)});
el.reset.addEventListener('click',()=>{refs=cloneProfile(profileName);save();renderCalibration();draw();el.calInfo.textContent='Reset to '+PROFILES[profileName].name+'.'});
el.profile.addEventListener('change',()=>{profileName=el.profile.value;refs=cloneProfile(profileName);save();renderCalibration();trail=[];votes=[];currentKey='';draw();el.calInfo.textContent='Loaded '+PROFILES[profileName].name+'. Custom calibration was reset.'});
el.threshold.addEventListener('input',()=>{el.thresholdOut.textContent=Number(el.threshold.value).toFixed(3)});
window.addEventListener('resize',draw);window.addEventListener('pagehide',()=>{if(running)stopMic()});
el.profile.value=profileName;renderCalibration();draw();

if(new URLSearchParams(location.search).has('selftest')){
  const report={};
  try{
    report.cards=el.calGrid.children.length===12;report.refs=el.refs.children.length===12;
    el.profile.value='men';el.profile.dispatchEvent(new Event('change',{bubbles:true}));report.profileSwitch=Math.round(refs.iy.f1)===342;
    el.threshold.value='.012';el.threshold.dispatchEvent(new Event('input',{bubbles:true}));report.threshold=el.thresholdOut.textContent==='0.012';
    report.canvas=el.canvas.width>0&&el.canvas.height>0;
  }catch(e){report.error=String(e?.stack||e)}
  const pass=Object.values(report).every(Boolean);document.documentElement.dataset.selftest=pass?'pass':'fail';
  const pre=document.createElement('pre');pre.id='selftest';pre.hidden=true;pre.textContent=JSON.stringify(report);document.body.append(pre);
}
