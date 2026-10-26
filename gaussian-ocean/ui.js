const $ = (id) => document.getElementById(id);
const canvas = $('ocean');
const status = $('gpuStatus');
const ciMode = new URLSearchParams(location.search).has('ci');
const RES = 192, PACKETS = 24, COUNT = PACKETS*PACKETS;
const sliders = ['seaState','chop','wind','foam','sun','cameraHeight'];
const state = { seaState:1, chop:1.25, wind:1, foam:0.7, sun:0.3, cameraHeight:4.5,
  yaw:0.13, pitch:0.15, paused:false, gaussianView:false, simTime:0, frame:0, splashX:10000, splashZ:10000, splashAge:1000 };
const mark = (message, phase='boot') => { status.textContent=message; status.dataset.state=phase; document.documentElement.dataset.phase=message; };
function fail(error) { const message=error?.stack||error?.message||String(error); console.error(error); mark('ERROR','error'); $('fatal').hidden=false; $('fatal').textContent='WebGPU initialization / validation failed:\n'+message; }
for (const name of sliders) {
  const control=$(name), output=$(name+'Val');
  control.addEventListener('input',()=>{state[name]=Number(control.value);output.textContent=Number(control.value).toFixed(name==='cameraHeight'?1:2);});
}
$('gaussianView').addEventListener('change',e=>{state.gaussianView=e.target.checked;});
$('pause').addEventListener('click',()=>{state.paused=!state.paused;$('pause').textContent=state.paused?'RESUME':'PAUSE';});
$('togglePanel').addEventListener('click',()=>{const closed=$('panel').classList.toggle('closed');$('togglePanel').setAttribute('aria-expanded',String(!closed));});
function seeded(seed) { let s=seed|0; return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;}; }
function makePackets() {
  const rand=seeded(73561), data=new Float32Array(COUNT*12);
  for (let z=0;z<PACKETS;z++) for(let x=0;x<PACKETS;x++) {
    const i=(z*PACKETS+x)*12;
    const angle=-Math.PI/2 + (rand()-.5)*1.5;
    data[i+0]=(x+0.5+(rand()-.5)*0.44)*4-48;
    data[i+1]=(z+0.5+(rand()-.5)*0.44)*4-48;
    data[i+2]=Math.cos(angle); data[i+3]=Math.sin(angle);
    data[i+4]=0.08+rand()*0.13; data[i+5]=3.9+rand()*2.6;
    data[i+6]=2.6+rand()*2.0; data[i+7]=0.60+rand()*0.65;
    data[i+8]=0.75+rand()*1.2; data[i+9]=rand()*Math.PI*2;
    data[i+10]=0.45+rand()*0.65; data[i+11]=0;
  }
  return data;
}
function cameraRay(nx,ny,aspect) {
  const yaw=state.yaw, pitch=state.pitch;
  const forward=[Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
  const right=[Math.cos(yaw),0,Math.sin(yaw)];
  const up=[Math.sin(yaw)*Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw)*Math.sin(pitch)];
  const fov=Math.tan(58*Math.PI/360);
  return [0,1,2].map(i=>forward[i]+right[i]*nx*aspect*fov+up[i]*ny*fov);
}
let drag=null;
canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,atX:e.clientX,atY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
  if(Math.hypot(e.clientX-drag.atX,e.clientY-drag.atY)>7)drag.moved=true;
  if(drag.moved){state.yaw+=dx*0.0045;state.pitch=Math.max(-0.15,Math.min(0.62,state.pitch+dy*0.0035));}
});
canvas.addEventListener('pointerup',e=>{if(!drag)return;
  if(!drag.moved){const rect=canvas.getBoundingClientRect();const nx=(e.clientX-rect.left)/rect.width*2-1;
    const ny=1-(e.clientY-rect.top)/rect.height*2;const ray=cameraRay(nx,ny,rect.width/rect.height);
    if(ray[1]<-0.008){const distance=-state.cameraHeight/ray[1];if(distance<500){state.splashX=ray[0]*distance;state.splashZ=ray[2]*distance;state.splashAge=0;}}
  }
  drag=null;
});
canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.cameraHeight=Math.max(1.5,Math.min(15,state.cameraHeight+Math.sign(e.deltaY)*0.5));$('cameraHeight').value=state.cameraHeight;$('cameraHeightVal').textContent=state.cameraHeight.toFixed(1);},{passive:false});


export {$,canvas,ciMode,state,mark,fail,makePackets};
