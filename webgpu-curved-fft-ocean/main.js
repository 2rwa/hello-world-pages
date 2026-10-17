import {createEngine} from './engine.js';
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
const ci=query.has('ci'),mobile=/Android|iPhone|iPad/i.test(navigator.userAgent);
const canvas=$('view'),status=$('status');
const ids=['radius','amp','wind','sun','altitude','pitch','foam','quality','mode'];
for(const key of ids)if(query.has(key))$(key).value=query.get(key);
if(!query.has('quality'))$('quality').value=ci?'128':mobile?'128':'256';
const resolution=Number($('quality').value);
let elapsed=0,lastTime=0,paused=false,yaw=0.03,busy=false,frames=0,engine;
window.__curvedOceanState={phase:'script-start'};
function report(phase){window.__curvedOceanState.phase=phase;if(ci)status.textContent='CI: '+phase;}
function radiusValue(){return Math.pow(10,Number($('radius').value));}
function updateLabels(){
 $('radiusOut').textContent=Math.round(radiusValue()).toLocaleString()+' m';
 for(const id of ['amp','wind','sun','altitude','pitch','foam']){
  const units={amp:'×',wind:' m/s',sun:'°',altitude:' m',pitch:'°',foam:'×'};
  $(id+'Out').textContent=$(id).value+units[id];
 }
}
for(const id of ids)$(id).addEventListener('input',updateLabels);
$('quality').addEventListener('change',()=>{query.set('quality',$('quality').value);query.delete('ci');location.search=query.toString();});
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'再開':'一時停止';};
$('reset').onclick=()=>{yaw=0.03;$('altitude').value=26;$('pitch').value=3;updateLabels();};
$('close').onclick=()=>document.body.classList.add('folded');
$('open').onclick=()=>document.body.classList.remove('folded');
let dragging=false,lastX=0;
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!dragging)return;yaw+=(e.clientX-lastX)*0.006;lastX=e.clientX;});
canvas.addEventListener('pointerup',()=>dragging=false);
canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('wheel',e=>{
 e.preventDefault();
 $('altitude').value=Math.max(3,Math.min(130,Number($('altitude').value)*Math.exp(e.deltaY*.002)));
 updateLabels();
},{passive:false});
updateLabels();
function uniforms(width,height){
 const radius=radiusValue(),altitude=Number($('altitude').value);
 const pitch=Number($('pitch').value)*Math.PI/180;
 const eye=[Math.sin(yaw)*90,altitude,-Math.cos(yaw)*90];
 const aim=[eye[0]+Math.sin(yaw)*800,altitude-Math.tan(pitch)*800,eye[2]+Math.cos(yaw)*800];
 const values=new Float32Array(36);
 values.set([elapsed,Number($('amp').value),Number($('wind').value),.45],16);
 values.set([0,0,0,radius],20);
 values.set([...aim,Number($('mode').value)],24);
 values.set([Number($('sun').value)*Math.PI/180,Number($('foam').value),.5,width/height],28);
 values.set([...eye,height],32);
 return values;
}
function fatal(e){
 const message=String(e?.stack||e?.message||e);
 status.textContent='ERROR: '+message;
 status.style.color='#ffb7a3';
 console.error(e);document.documentElement.dataset.test='error';
 window.__curvedOceanState={phase:'error',error:message};
}
async function start(){
 try{
  engine=await createEngine(canvas,resolution,ci,report);
  if(ci){
   document.body.classList.add('folded');
   elapsed=18.5;
   const w=480,h=300;
   const result=await engine.render(uniforms(w,h),w,h);
   window.__curvedOceanState={phase:'ok',radius:radiusValue(),resolution,mode:Number($('mode').value),result};
   document.documentElement.dataset.test='ok';
   status.textContent='OK: FFT ×5 → curved raymarch → GPU pixels';
   return;
  }
  function frame(now){
   if(busy)return;busy=true;
   const dt=Math.min(.05,Math.max(0,(now-lastTime||16)/1000));lastTime=now;
   if(!paused)elapsed+=dt;
   const dpr=Math.min(devicePixelRatio||1,1.35);
   const multiplier=Math.min(dpr,Math.sqrt(800000/Math.max(1,canvas.clientWidth*canvas.clientHeight)));
   const w=Math.max(1,Math.round(canvas.clientWidth*multiplier));
   const h=Math.max(1,Math.round(canvas.clientHeight*multiplier));
   engine.render(uniforms(w,h),w,h).then(()=>{
    busy=false;frames++;
    if(frames%35===0)status.textContent='WebGPU · 5 × '+resolution+'² FFT · R='+Math.round(radiusValue())+'m\n'+
      'Raymarch 88 + bisection 7 · '+w+'×'+h+' · frame '+frames;
    requestAnimationFrame(frame);
   }).catch(fatal);
  }
  requestAnimationFrame(frame);
 }catch(e){fatal(e);}
}
start();
