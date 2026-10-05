const VOWELS={
 a:{f1:801,f2:1159,f3:2600},i:{f1:283,f2:2353,f3:3000},u:{f1:405,f2:1550,f3:2500},e:{f1:536,f2:2018,f3:2900},o:{f1:503,f2:811,f3:2500}
};
const $=s=>document.querySelector(s),canvas=$('#plot'),ctx=canvas.getContext('2d');
const el={start:$('#start'),end:$('#end'),duration:$('#duration'),durationOut:$('#durationOut'),f0:$('#f0'),f0Out:$('#f0Out'),timing:$('#timing'),play:$('#play'),now:$('#now'),startRead:$('#startRead'),controlRead:$('#controlRead'),endRead:$('#endRead'),swap:$('#swap'),reset:$('#reset'),selftest:$('#selftest')};
for(const v of Object.keys(VOWELS)){for(const s of [el.start,el.end]){const o=document.createElement('option');o.value=v;o.textContent='/'+v+'/';s.append(o)}}
el.start.value='a';el.end.value='i';
const state={control:{f1:0,f2:0},route:'direct',drag:false,playT:null,raf:null};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const midpoint=()=>({f1:(VOWELS[el.start.value].f1+VOWELS[el.end.value].f1)/2,f2:(VOWELS[el.start.value].f2+VOWELS[el.end.value].f2)/2});
function setRoute(route){state.route=route;if(route==='direct')state.control=midpoint();else if(route==='e')state.control={f1:VOWELS.e.f1,f2:VOWELS.e.f2};else if(route==='u')state.control={f1:VOWELS.u.f1,f2:VOWELS.u.f2};else state.control={f1:600,f2:1800};sync()}
function pathPoint(t){const a=VOWELS[el.start.value],b=state.control,c=VOWELS[el.end.value],q=1-t;return{f1:q*q*a.f1+2*q*t*b.f1+t*t*c.f1,f2:q*q*a.f2+2*q*t*b.f2+t*t*c.f2,f3:a.f3+(c.f3-a.f3)*t}}
function warp(t){if(el.timing.value==='ease')return t*t*(3-2*t);if(el.timing.value==='late')return t*t*t;if(el.timing.value==='early')return 1-Math.pow(1-t,3);return t}
function xy(f1,f2){const p=62,w=canvas.width-p*2,h=canvas.height-p*2;return[p+(3000-f2)/(3000-600)*w,p+(f1-200)/(1000-200)*h]}
function inv(x,y){const p=62,w=canvas.width-p*2,h=canvas.height-p*2;return{f1:clamp(Math.round(200+(y-p)/h*800),200,1000),f2:clamp(Math.round(3000-(x-p)/w*2400),600,3000)}}
function draw(){const W=canvas.width,H=canvas.height,p=62;ctx.clearRect(0,0,W,H);ctx.fillStyle='#0d1110';ctx.fillRect(0,0,W,H);ctx.font='12px system-ui';ctx.textBaseline='middle';
 for(let f2=600;f2<=3000;f2+=400){const[x]=xy(200,f2);ctx.strokeStyle='#26302a';ctx.beginPath();ctx.moveTo(x,p);ctx.lineTo(x,H-p);ctx.stroke();ctx.fillStyle='#758078';ctx.textAlign='center';ctx.fillText(f2,x,H-28)}
 for(let f1=200;f1<=1000;f1+=100){const[,y]=xy(f1,600);ctx.strokeStyle='#26302a';ctx.beginPath();ctx.moveTo(p,y);ctx.lineTo(W-p,y);ctx.stroke();ctx.fillStyle='#758078';ctx.textAlign='right';ctx.fillText(f1,p-10,y)}
 ctx.fillStyle='#89948d';ctx.textAlign='center';ctx.fillText('F2 (Hz)  ← 高い',W/2,H-9);ctx.save();ctx.translate(15,H/2);ctx.rotate(-Math.PI/2);ctx.fillText('F1 (Hz)  ← 低い',0,0);ctx.restore();
 for(const [v,d] of Object.entries(VOWELS)){const[x,y]=xy(d.f1,d.f2);ctx.fillStyle='#6d7871';ctx.globalAlpha=.45;ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#aeb7b0';ctx.textAlign='left';ctx.fillText('/'+v+'/',x+10,y-11)}
 ctx.lineWidth=4;ctx.strokeStyle='#b7d7cb';ctx.beginPath();for(let i=0;i<=90;i++){const t=i/90,pn=pathPoint(t),[x,y]=xy(pn.f1,pn.f2);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();ctx.lineWidth=1;
 const a=VOWELS[el.start.value],b=state.control,c=VOWELS[el.end.value];
 [[a,'#9bc9bc',10],[b,'#ffffff',12],[c,'#e5c28e',10]].forEach(([d,color,r])=>{const[x,y]=xy(d.f1,d.f2);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()});
 if(state.playT!==null){const d=pathPoint(warp(state.playT)),[x,y]=xy(d.f1,d.f2);ctx.fillStyle='#f2e84b';ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();el.now.textContent='F1 '+Math.round(d.f1)+' / F2 '+Math.round(d.f2)+' Hz'}else el.now.textContent='F1 — / F2 —';
}
function fmt(d){return 'F1 '+Math.round(d.f1)+' / F2 '+Math.round(d.f2)+' Hz'}
function sync(){el.durationOut.value=(+el.duration.value).toFixed(1)+' s';el.f0Out.value=el.f0.value+' Hz';el.startRead.textContent='/'+el.start.value+'/  '+fmt(VOWELS[el.start.value]);el.controlRead.textContent=fmt(state.control);el.endRead.textContent='/'+el.end.value+'/  '+fmt(VOWELS[el.end.value]);document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===state.route));draw()}
function audioCtx(){return window.__vowelAC||(window.__vowelAC=new(window.AudioContext||window.webkitAudioContext)())}
function play(){const ac=audioCtx(),dur=+el.duration.value,t0=ac.currentTime+.035,src=ac.createOscillator(),pre=ac.createGain(),master=ac.createGain();src.type='sawtooth';src.frequency.value=+el.f0.value;pre.gain.value=.14;src.connect(pre);const banks=[[8,1],[10,.72],[12,.34]].map(([q,g])=>{const f=ac.createBiquadFilter(),gain=ac.createGain();f.type='bandpass';f.Q.value=q;gain.gain.value=g;pre.connect(f);f.connect(gain);gain.connect(master);return f});const first=pathPoint(warp(0));[first.f1,first.f2,first.f3].forEach((v,i)=>banks[i].frequency.setValueAtTime(v,t0));for(let i=1;i<=64;i++){const raw=i/64,p=pathPoint(warp(raw)),tt=t0+raw*dur;[p.f1,p.f2,p.f3].forEach((v,j)=>banks[j].frequency.linearRampToValueAtTime(v,tt))}master.connect(ac.destination);master.gain.setValueAtTime(.0001,t0);master.gain.exponentialRampToValueAtTime(.52,t0+.035);master.gain.setValueAtTime(.52,t0+Math.max(.06,dur-.08));master.gain.exponentialRampToValueAtTime(.0001,t0+dur);src.start(t0);src.stop(t0+dur+.04);const visualStart=performance.now()+35;if(state.raf)cancelAnimationFrame(state.raf);const tick=now=>{state.playT=clamp((now-visualStart)/(dur*1000),0,1);draw();if(state.playT<1)state.raf=requestAnimationFrame(tick);else{state.playT=null;draw()}};state.raf=requestAnimationFrame(tick)}
function pointerPos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
canvas.addEventListener('pointerdown',e=>{const p=pointerPos(e),[cx,cy]=xy(state.control.f1,state.control.f2);state.drag=Math.hypot(p.x-cx,p.y-cy)<34;const inside=p.x>=62&&p.x<=canvas.width-62&&p.y>=62&&p.y<=canvas.height-62;if(!state.drag&&inside){state.control=inv(p.x,p.y);state.route='custom';sync()}else if(state.drag)canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!state.drag)return;const p=pointerPos(e);state.control=inv(p.x,p.y);state.route='custom';sync()});
canvas.addEventListener('pointerup',()=>state.drag=false);canvas.addEventListener('pointercancel',()=>state.drag=false);
el.start.onchange=()=>setRoute('direct');el.end.onchange=()=>setRoute('direct');el.duration.oninput=sync;el.f0.oninput=sync;el.timing.onchange=sync;el.play.onclick=play;
document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>setRoute(b.dataset.route));
el.swap.onclick=()=>{const s=el.start.value;el.start.value=el.end.value;el.end.value=s;setRoute('direct')};el.reset.onclick=()=>setRoute('direct');
window.__vowelTransitionLab={pathPoint,setRoute,getState:()=>({start:el.start.value,end:el.end.value,control:{...state.control},route:state.route})};
window.__vowelTransitionLabTest=()=>{const controlsOk=!!(el.start&&el.end&&el.play&&canvas);el.start.value='a';el.end.value='i';setRoute('direct');const m=pathPoint(.5),straight=midpoint(),curveOk=Math.abs(m.f1-straight.f1)<1&&Math.abs(m.f2-straight.f2)<1;setRoute('e');const eMid=pathPoint(.5),viaEOk=eMid.f2<straight.f2+400&&state.control.f2===VOWELS.e.f2;const before=state.control.f2;state.control={f1:620,f2:1700};state.route='custom';sync();const customOk=state.control.f2!==before&&el.controlRead.textContent.includes('1700');return{ok:controlsOk&&curveOk&&viaEOk&&customOk,controlsOk,curveOk,viaEOk,customOk}};
setRoute('direct');
if(new URLSearchParams(location.search).has('selftest')){const r=window.__vowelTransitionLabTest();el.selftest.hidden=false;el.selftest.dataset.selftest=r.ok?'pass':'fail';el.selftest.textContent=JSON.stringify(r)}
