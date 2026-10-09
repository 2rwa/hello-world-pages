import {makeKeyboard,runScope} from './ui.js';
const $=id=>document.getElementById(id);
const state={mode:'rcm',fmIndex:3.7,pcmDepth:3.8,ratio:2,blend:.24,pcmTone:8500,cutoff:9000,resonance:.13,attack:.015,decay:.34,sustain:.6,release:.4,volume:.6};
const defs=[
 ['fmIndex','FM Index',0,12,.1,'通常FMの変調深度'],
 ['pcmDepth','PCM → FM',0,10,.1,'RCMモードでのみ有効'],
 ['ratio','Modulator ratio',.5,9,.5,'FM変調器の周波数比'],
 ['blend','PCM Mix',0,1,.01,'RCM / Layer の加算比率'],
 ['pcmTone','PCM Pre-filter',100,16000,50,'FMへ入る前のPCM帯域'],
 ['cutoff','Output LPF',100,18000,50,'最終段ローパス'],
 ['resonance','Resonance',0,.95,.01,'フィルター共振'],
 ['attack','Attack',.005,1,.005,'立ち上がり時間（秒）'],
 ['decay','Decay',.02,2,.01,'減衰時間（秒）'],
 ['sustain','Sustain',0,1,.01,'押鍵中の持続レベル'],
 ['release','Release',.03,3,.01,'離鍵時の減衰時間（秒）'],
 ['volume','Master',0,1,.01,'出力レベル']
];
const presets={
 'Glass Bell':{wave:'bell',fmIndex:6,pcmDepth:6.2,ratio:3.5,blend:.16,pcmTone:13500,cutoff:13000,resonance:.1,attack:.008,decay:.28,sustain:.22,release:1.1,volume:.56},
 'Dream Pad':{wave:'strings',fmIndex:2,pcmDepth:2.9,ratio:1.5,blend:.45,pcmTone:2900,cutoff:2800,resonance:.14,attack:.42,decay:.8,sustain:.75,release:1.4,volume:.75},
 'Digital Brass':{wave:'organ',fmIndex:5.1,pcmDepth:4,ratio:2,blend:.12,pcmTone:9500,cutoff:6400,resonance:.36,attack:.025,decay:.3,sustain:.78,release:.17,volume:.6},
 'Electric Piano':{wave:'pluck',fmIndex:3.1,pcmDepth:3.2,ratio:3,blend:.25,pcmTone:6900,cutoff:8400,resonance:.08,attack:.006,decay:.43,sustain:.18,release:.65,volume:.65},
 'Vocal Alloy':{wave:'vowel',fmIndex:3.5,pcmDepth:7.2,ratio:1,blend:.33,pcmTone:4100,cutoff:6900,resonance:.52,attack:.06,decay:.38,sustain:.7,release:.4,volume:.53}
};
let ctx,node,analyser,sample=null,initializing=null,customSample=false;
let playing=false,sequenceTimer=null,offTimers=[],position=0,keyboard;
const held=new Map();
function formatVal(k,v){
 if(k==='pcmTone'||k==='cutoff')return v>=1000?(v/1000).toFixed(2)+'kHz':v+'Hz';
 if(['attack','decay','release'].includes(k))return Number(v).toFixed(2)+'s';
 if(['blend','sustain','resonance','volume'].includes(k))return Math.round(v*100)+'%';
 return Number(v).toFixed(2).replace(/\.00$/,'');
}
function sendParams(){node?.port.postMessage({type:'params',params:{...state}})}
function initUI(){
 for(const [k,label,min,max,step,desc] of defs){
  const d=document.createElement('div');d.className='control';
  const h=document.createElement('div');h.className='control-head';
  const title=document.createElement('span');title.textContent=label;
  const output=document.createElement('output');output.id='o-'+k;output.textContent=formatVal(k,state[k]);h.append(title,output);
  const input=document.createElement('input');input.id='p-'+k;input.type='range';input.min=min;input.max=max;input.step=step;input.value=state[k];input.setAttribute('aria-label',label);
  input.addEventListener('input',()=>{state[k]=Number(input.value);output.textContent=formatVal(k,state[k]);sendParams();$('preset').value='custom'});
  const hint=document.createElement('div');hint.className='control-note';hint.textContent=desc;
  d.append(h,input,hint);$('controls').append(d);
 }
 for(const name of Object.keys(presets))$('preset').add(new Option(name,name));
 $('preset').add(new Option('Custom','custom'));
 $('preset').addEventListener('change',()=>{const p=presets[$('preset').value];if(p)applyPreset(p)});
 $('wave').addEventListener('change',()=>{customSample=false;updateWave();$('preset').value='custom'});
 for(const b of document.querySelectorAll('.mode'))b.addEventListener('click',()=>setMode(b.dataset.mode));
 $('start').addEventListener('click',()=>enable());
 $('panic').addEventListener('click',panic);
 $('demo').addEventListener('click',toggleDemo);
 $('audiofile').addEventListener('change',loadFile);
 keyboard=makeKeyboard(onNote,offNote);runScope(()=>analyser);
 $('preset').value='Glass Bell';applyPreset(presets['Glass Bell']);
}
function setMode(mode){
 state.mode=mode;sendParams();
 for(const b of document.querySelectorAll('.mode'))b.classList.toggle('is-active',b.dataset.mode===mode);
 const route={rcm:'PCM → FM OP2 → FILTER → OUT',fm:'FM OP2 → OP1 → OUT',pcm:'PCM → FILTER → OUT',layer:'PCM + FM → FILTER → OUT'};
 $('signal-route').textContent=route[mode];
}
function applyPreset(p){
 for(const [k] of defs)if(k in p){state[k]=p[k];$('p-'+k).value=p[k];$('o-'+k).textContent=formatVal(k,p[k])}
 $('wave').value=p.wave;customSample=false;updateWave();sendParams();
}
function makeWave(name){
 const n=2048,w=new Float32Array(n);
 const harmonics={
  bell:[[1,1],[2,.16],[3,.62],[5,.35],[8,.14],[11,.07]],
  strings:Array.from({length:20},(_,i)=>[i+1,1/Math.pow(i+1,1.16)]),
  pluck:Array.from({length:22},(_,i)=>[i+1,1/Math.pow(i+1,1.6)]),
  organ:[[1,1],[2,.7],[3,.35],[4,.25],[5,.13],[6,.1],[8,.07]],
  vowel:Array.from({length:26},(_,i)=>{const h=i+1,band=(f,c,s)=>Math.exp(-Math.pow((f-c)/s,2));return[h,.05/h+.36*band(h,3,1.25)+.8*band(h,8,2.3)+.37*band(h,14,3)]})
 }[name]||[[1,1]];
 let peak=0;
 for(let i=0;i<n;i++){
  let val=0,x=2*Math.PI*i/n;
  for(let j=0;j<harmonics.length;j++){const [h,a]=harmonics[j];val+=a*Math.sin(h*x+(name==='bell'?j*.43:name==='pluck'?j*.12:0))}
  w[i]=val;peak=Math.max(peak,Math.abs(val));
 }
 for(let i=0;i<n;i++)w[i]/=peak||1;
 return w;
}
function updateWave(){
 if(customSample)return;
 sample={data:makeWave($('wave').value),wavetable:true,rate:48000,baseMidi:60};
 $('sample-info').textContent='内蔵 '+$('wave').selectedOptions[0].text+' / 2048 PCM samples';
 sendSample();
}
function sendSample(){
 if(!node||!sample)return;
 const copy=new Float32Array(sample.data);
 node.port.postMessage({type:'sample',data:copy,wavetable:sample.wavetable,rate:sample.rate,baseMidi:sample.baseMidi},[copy.buffer]);
}
async function enable(){
 if(initializing)return initializing;
 initializing=(async()=>{
  try{
   if(!ctx){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio||!window.AudioWorkletNode)throw new Error('AudioWorkletに対応したブラウザが必要です');
    ctx=new Audio();const resumed=ctx.resume();
    await ctx.audioWorklet.addModule(new URL('./synth-worklet.js',import.meta.url));
    node=new AudioWorkletNode(ctx,'rcm-voice-processor',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    analyser=ctx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.74;
    node.connect(analyser);analyser.connect(ctx.destination);
    sendParams();sendSample();await resumed;
   }else await ctx.resume();
   $('start').textContent='● AUDIO ON';$('start').classList.add('ready');
   $('status').textContent='AudioWorklet / '+ctx.sampleRate+' Hz';
  }catch(err){$('status').textContent='音声起動エラー: '+err.message;console.error(err);throw err}
  finally{initializing=null}
 })();
 return initializing;
}
async function loadFile(e){
 const file=e.target.files?.[0];if(!file)return;
 try{
  await enable();
  const buf=await ctx.decodeAudioData(await file.arrayBuffer());
  const length=Math.min(buf.length,Math.floor(buf.sampleRate*2));
  if(length<128)throw new Error('音声が短すぎます');
  const pcm=new Float32Array(length);
  for(let ch=0;ch<buf.numberOfChannels;ch++){
   const src=buf.getChannelData(ch);
   for(let i=0;i<length;i++)pcm[i]+=src[i]/buf.numberOfChannels;
  }
  let peak=0;for(const v of pcm)peak=Math.max(peak,Math.abs(v));
  const fade=Math.min(256,Math.floor(length/8));
  for(let i=0;i<length;i++){const edge=Math.min(1,i/fade,(length-1-i)/fade);pcm[i]=peak?pcm[i]*edge/peak:0}
  sample={data:pcm,wavetable:false,rate:buf.sampleRate,baseMidi:60};
  customSample=true;sendSample();
  $('sample-info').textContent=file.name+' / '+(length/buf.sampleRate).toFixed(2)+'s / C4基準';
  $('preset').value='custom';
 }catch(err){$('sample-info').textContent='読み込み失敗: '+err.message;console.error(err)}
}
function onNote(note,source){
 held.set(source,note);keyboard.setPressed(note,true);updateNotes();
 enable().then(()=>{if(held.get(source)===note)node?.port.postMessage({type:'on',note,velocity:.9})}).catch(()=>{});
}
function offNote(source){
 const note=held.get(source);if(note===undefined)return;
 held.delete(source);
 if(![...held.values()].includes(note)){keyboard.setPressed(note,false);node?.port.postMessage({type:'off',note})}
 updateNotes();
}
function updateNotes(){
 $('voice-display').textContent=held.size+' keys';
 const all=[...held.values()];$('note-display').textContent=all.length?keyboard.noteName(all[all.length-1]):'--';
}
function panic(){
 keyboard.clear();held.clear();updateNotes();node?.port.postMessage({type:'panic'});stopDemo();
}
const melody=[60,64,67,71,69,67,62,65,69,72,71,69,67,64,60,67];
async function toggleDemo(){
 if(playing){stopDemo();return}
 await enable();playing=true;position=0;$('demo').classList.add('active');$('demo').textContent='■ 停止';
 const step=()=>{
  const n=melody[position%melody.length];offNote('demo');onNote(n,'demo');
  offTimers.push(setTimeout(()=>offNote('demo'),260));position++;
 };
 step();sequenceTimer=setInterval(step,345);
}
function stopDemo(){
 playing=false;clearInterval(sequenceTimer);for(const t of offTimers)clearTimeout(t);
 offTimers=[];offNote('demo');$('demo').classList.remove('active');$('demo').textContent='♫ デモ演奏';
}
window.addEventListener('blur',panic);
window.__rcmTest={getState:()=>({...state,enabled:!!node,voices:held.size}),onNote,offNote,setMode};
initUI();
