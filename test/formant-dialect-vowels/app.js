const V=['a','i','u','e','o'];
const PRESETS={
  standard:{name:'標準日本語・実測例',kind:'measured',note:'公開された日本語5母音の一話者のF1/F2測定例。比較の基準。',v:{a:[801,1159],i:[283,2353],u:[405,1550],e:[536,2018],o:[503,811]}},
  aizu:{name:'会津モデル（模式）',kind:'model',note:'研究で報告された /i/ と /e/ の接近を強調した探索用モデル。',v:{a:[801,1159],i:[430,2070],u:[405,1550],e:[515,1980],o:[503,811]}},
  tsugaru:{name:'津軽モデル（模式）',kind:'model',note:'古典的研究で見られる /i/–/e/ の重なり傾向を模式化。',v:{a:[790,1180],i:[410,2130],u:[400,1510],e:[505,2010],o:[500,830]}},
  izumo:{name:'出雲モデル（模式）',kind:'model',note:'報告されている /i/–/e/ と /u/–/o/ の接近傾向を両方強調。',v:{a:[790,1180],i:[405,2110],u:[440,1220],e:[505,2000],o:[500,980]}}
};
const $=s=>document.querySelector(s), canvas=$('#plot'),ctx=canvas.getContext('2d');
const els={a:$('#presetA'),b:$('#presetB'),f0:$('#f0'),f1:$('#f1'),f2:$('#f2'),f3:$('#f3'),f0o:$('#f0out'),f1o:$('#f1out'),f2o:$('#f2out'),f3o:$('#f3out'),label:$('#selectionLabel'),read:$('#readout'),buttons:$('#vowelButtons'),notes:$('#presetNotes')};
let state={group:'a',vowel:'a',manual:null};
for(const [k,p] of Object.entries(PRESETS)){for(const sel of [els.a,els.b]){const o=document.createElement('option');o.value=k;o.textContent=p.name;sel.append(o)}}
els.a.value='standard';els.b.value='aizu';
for(const v of V){const b=document.createElement('button');b.textContent='/'+v+'/';b.onclick=()=>selectVowel(v);els.buttons.append(b)}
els.notes.innerHTML=Object.values(PRESETS).map(p=>`<div class="presetNote"><strong>${p.name}</strong><span>${p.note}</span></div>`).join('');
function chosen(group){return PRESETS[group==='a'?els.a.value:els.b.value]}
function point(group,v){if(state.manual&&state.group===group&&state.vowel===v)return state.manual;return chosen(group).v[v]}
function xy(f1,f2){const pad=64,w=canvas.width-pad*2,h=canvas.height-pad*2;return [pad+(3000-f2)/(3000-600)*w,pad+(f1-200)/(1000-200)*h]}
function inv(x,y){const pad=64,w=canvas.width-pad*2,h=canvas.height-pad*2;return [Math.round(200+(y-pad)/h*800),Math.round(3000-(x-pad)/w*2400)]}
function draw(){const W=canvas.width,H=canvas.height,pad=64;ctx.clearRect(0,0,W,H);ctx.fillStyle='#12130f';ctx.fillRect(0,0,W,H);ctx.font='13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
  for(let f2=600;f2<=3000;f2+=400){const[x]=xy(200,f2);ctx.strokeStyle='#2d3028';ctx.beginPath();ctx.moveTo(x,pad);ctx.lineTo(x,H-pad);ctx.stroke();ctx.fillStyle='#777b6d';ctx.fillText(f2,x,H-28)}
  for(let f1=200;f1<=1000;f1+=100){const[,y]=xy(f1,600);ctx.strokeStyle='#2d3028';ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke();ctx.fillStyle='#777b6d';ctx.textAlign='right';ctx.fillText(f1,pad-12,y)}
  ctx.fillStyle='#9b9d90';ctx.textAlign='center';ctx.fillText('F2 (Hz)  ← 高い',W/2,H-9);ctx.save();ctx.translate(15,H/2);ctx.rotate(-Math.PI/2);ctx.fillText('F1 (Hz)  ← 低い',0,0);ctx.restore();
  [['a','#ebe0a1'],['b','#95c6bf']].forEach(([g,c])=>{const p=chosen(g);for(const v of V){const[f1,f2]=point(g,v),[x,y]=xy(f1,f2);ctx.globalAlpha=.3;ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,18,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f4f3ed';ctx.textAlign='left';ctx.fillText(v.toUpperCase(),x+12,y-11);if(state.group===g&&state.vowel===v){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,24,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1}}})
}
function selectVowel(v,group=state.group){state.vowel=v;state.group=group;state.manual=null;const[f1,f2]=point(group,v);els.f1.value=f1;els.f2.value=f2;els.f3.value=v==='i'||v==='e'?2900:2600;sync();}
function sync(){els.f0o.value=els.f0.value+' Hz';els.f1o.value=els.f1.value+' Hz';els.f2o.value=els.f2.value+' Hz';els.f3o.value=els.f3.value+' Hz';const name=state.group.toUpperCase(),p=chosen(state.group);els.label.textContent=`${name}: ${p.name} /${state.vowel}/`;els.read.textContent=`${name} /${state.vowel}/ — F1 ${els.f1.value} / F2 ${els.f2.value} Hz`;[...els.buttons.children].forEach((b,i)=>b.classList.toggle('active',V[i]===state.vowel));draw()}
for(const e of [els.f1,els.f2])e.oninput=()=>{state.manual=[+els.f1.value,+els.f2.value];sync()};
els.f3.oninput=sync;els.f0.oninput=sync;els.a.onchange=()=>{state.group='a';selectVowel(state.vowel,'a')};els.b.onchange=()=>{state.group='b';selectVowel(state.vowel,'b')};
function audioCtx(){return window.__ctx||(window.__ctx=new (window.AudioContext||window.webkitAudioContext)())}
function playFormant(f1,f2,dur=.72){const ac=audioCtx(),t=ac.currentTime+.015,src=ac.createOscillator(),pre=ac.createGain(),sum=ac.createGain(),master=ac.createGain();src.type='sawtooth';src.frequency.value=+els.f0.value;pre.gain.value=.18;src.connect(pre);const fs=[[f1,8,1],[f2,10,.72],[+els.f3.value,12,.38]];for(const[f,q,g]of fs){const bp=ac.createBiquadFilter(),gn=ac.createGain();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;gn.gain.value=g;pre.connect(bp);bp.connect(gn);gn.connect(sum)}sum.connect(master);master.connect(ac.destination);master.gain.setValueAtTime(.0001,t);master.gain.exponentialRampToValueAtTime(.7,t+.035);master.gain.setValueAtTime(.7,t+dur-.08);master.gain.exponentialRampToValueAtTime(.0001,t+dur);src.start(t);src.stop(t+dur+.03)}
function playSelected(){playFormant(+els.f1.value,+els.f2.value)}
$('#playOne').onclick=playSelected;
$('#playSeq').onclick=async()=>{for(const v of V){for(const g of ['a','b']){state.group=g;selectVowel(v,g);playSelected();await new Promise(r=>setTimeout(r,800))}await new Promise(r=>setTimeout(r,130))}};
function hit(e){const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*canvas.width/r.width,y=(e.clientY-r.top)*canvas.height/r.height;let best=null,bd=34;for(const g of ['a','b'])for(const v of V){const p=point(g,v),[px,py]=xy(...p),d=Math.hypot(x-px,y-py);if(d<bd){bd=d;best=[g,v]}}if(best){selectVowel(best[1],best[0]);playSelected();return}if(x>=64&&x<=canvas.width-64&&y>=64&&y<=canvas.height-64){const[f1,f2]=inv(x,y);state.manual=[Math.max(200,Math.min(1000,f1)),Math.max(600,Math.min(3000,f2))];els.f1.value=state.manual[0];els.f2.value=state.manual[1];sync();playSelected()}}
canvas.addEventListener('pointerdown',hit);
window.__formantLabTest=()=>({presets:Object.keys(PRESETS).length,vowels:V.length,standardA:PRESETS.standard.v.a,aizuI:PRESETS.aizu.v.i,selected:[+els.f1.value,+els.f2.value],ok:PRESETS.standard.v.i[1]>PRESETS.standard.v.e[1]&&PRESETS.aizu.v.i[0]>PRESETS.standard.v.i[0]});
selectVowel('a');