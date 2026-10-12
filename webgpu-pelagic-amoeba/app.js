import {createOcean} from './gpu.js';
const $=id=>document.getElementById(id);
const canvas=$('view'),status=$('status');
const params=new URLSearchParams(location.search);
const ci=params.has('ci');
const mobile=/Android|iPhone|iPad/i.test(navigator.userAgent);
const resolution=Number(params.get('quality')||(ci?128:(mobile?128:512)));
$('quality').value=String(resolution);
for(const name of ['sun','turbidity','wind','foam','amp','speed','mode','spray','lace','spheres','blend','ior','absorption','wobble','stretch','bounces','steps','emission','opacity']){
 if(params.has(name)) $(name).value=params.get(name);
}
let paused=false,angle=0.3,boatX=0,boatZ=0,boatY=2,boatRoll=0,boatPitch=0,orbitYaw=0.62,orbitPitch=0.21,orbitDist=39;
let lastClock=0,elapsed=0,frameCount=0,dragging=false,pointerX=0,pointerY=0,engine=null,busy=false,previousWater=0,previousBallY=2;
const pressed=new Set();
window.__oceanState={phase:'script-start'};
function report(phase){
 window.__oceanState.phase=phase;
 if(ci)status.textContent='CI: '+phase;
}
function fatal(err){
 const msg=String(err?.stack||err?.message||err);
 status.textContent='ERROR: '+msg;
 status.style.color='#ffc8a4';
 document.documentElement.dataset.test='error';
 window.__oceanState={phase:'error',error:msg};
 console.error(err);
}
function norm(v){let d=Math.hypot(...v);return v.map(a=>a/(d||1));}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function viewProjection(eye,look,aspect){
 const f=norm(look.map((a,i)=>a-eye[i])),s=norm(cross(f,[0,1,0])),u=cross(s,f);
 const view=new Float32Array([
 s[0],u[0],-f[0],0,s[1],u[1],-f[1],0,s[2],u[2],-f[2],0,
 -dot(s,eye),-dot(u,eye),dot(f,eye),1
 ]);
 const near=0.15,far=7200,p=1/Math.tan(0.98/2);
 const proj=new Float32Array([p/aspect,0,0,0,0,p,0,0,0,0,far/(near-far),-1,0,0,far*near/(near-far),0]);
 const out=new Float32Array(16);
 for(let col=0;col<4;col++)for(let row=0;row<4;row++)
 for(let k=0;k<4;k++)out[col*4+row]+=proj[k*4+row]*view[col*4+k];
 return out;
}
function uniforms(speed){
 const theta=angle+orbitYaw+Math.PI;
 const eye=[boatX+Math.cos(theta)*orbitDist,boatY+Math.sin(orbitPitch)*orbitDist,
 boatZ+Math.sin(theta)*orbitDist];
 const looking=[boatX,boatY+1,boatZ];
 const aspect=ci?640/400:Math.max(0.3,canvas.clientWidth/canvas.clientHeight);
 const result=new Float32Array(36);
 result.set(viewProjection(eye,looking,aspect),0);
 result.set([elapsed,Number($('amp').value),Number($('wind').value),angle],16);
 result.set([boatX,boatY,boatZ,3.7],20);
 result.set([Number($('mode').value),boatRoll,boatPitch,speed],24);
 result.set([Number($('foam').value),Number($('sun').value)*Math.PI/180,Number($('turbidity').value),aspect],28);
 result.set([...eye,resolution],32);
 return result;
}
function amoebaOptions(){
 return {count:+$('spheres').value,blend:+$('blend').value,ior:+$('ior').value,
  absorption:+$('absorption').value,wobble:+$('wobble').value,stretch:+$('stretch').value,
  bounces:+$('bounces').value,steps:+$('steps').value,emission:+$('emission').value,
  opacity:+$('opacity').value};
}
function installUI(){
 $('toggle').onclick=()=>$('controls').classList.toggle('hide');
 for(const id of ['wind','amp','foam','speed','sun','turbidity','spray','lace','spheres','blend','ior','absorption','wobble','stretch','bounces','steps','emission','opacity']){
  const slider=$(id),out=$(id+'Out');
  const refresh=()=>out.textContent=slider.value+(id==='wind'||id==='speed'?' m/s':id==='sun'?'°':id==='foam'||id==='amp'||id==='spray'||id==='lace'?'×':'');
  slider.oninput=refresh;refresh();
 }
 $('quality').onchange=()=>{const query=new URLSearchParams(location.search);query.set('quality',$('quality').value);query.delete('ci');location.search=query.toString();};
 $('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'再開':'一時停止';};
 $('viewpoint').onchange=()=>{
  const selected=$('viewpoint').value;
  if(selected==='deck'){orbitDist=25;orbitPitch=0.065;orbitYaw=0.70;}
  else if(selected==='aerial'){orbitDist=150;orbitPitch=1.05;orbitYaw=0.38;}
  else{orbitDist=39;orbitPitch=0.21;orbitYaw=0.62;}
 };
 $('reset').onclick=()=>engine?.resetWake();
 window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();pressed.add(e.key.toLowerCase());});
 window.addEventListener('keyup',e=>pressed.delete(e.key.toLowerCase()));
 canvas.addEventListener('pointerdown',e=>{dragging=true;pointerX=e.clientX;pointerY=e.clientY;canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!dragging)return;orbitYaw-=(e.clientX-pointerX)*0.006;orbitPitch=Math.max(-0.03,Math.min(1.3,orbitPitch-(e.clientY-pointerY)*0.004));pointerX=e.clientX;pointerY=e.clientY;});
 canvas.addEventListener('pointerup',()=>dragging=false);
 canvas.addEventListener('pointercancel',()=>dragging=false);
 canvas.addEventListener('wheel',e=>{e.preventDefault();orbitDist=Math.max(12,Math.min(380,orbitDist*Math.exp(e.deltaY*0.001)));},{passive:false});
}
async function start(){
 installUI();
 try{
  report('script-start');
  engine=await createOcean(canvas,resolution,ci,report);
  if(ci){
   document.querySelector('.panel').style.display='none';
   let result;
   elapsed=14.0;
   for(let testFrame=0;testFrame<6;testFrame++){
    const speed=Number($('speed').value);
    boatX+=Math.cos(angle)*speed*0.10;
    boatZ+=Math.sin(angle)*speed*0.10;
    elapsed+=0.10;
    boatY+=(engine.height+1.7-boatY)*0.12;
    boatRoll+=(engine.roll-boatRoll)*0.18;
    boatPitch+=(engine.pitch-boatPitch)*0.18;
    result=await engine.step(uniforms(speed),0.08,{spray:Number($('spray').value),lace:Number($('lace').value),slam:0.85,amoeba:amoebaOptions()});
   }
   document.documentElement.dataset.test='ok';
   window.__oceanState={phase:'ok',resolution,cascades:5,mode:Number($('mode').value),sun:Number($('sun').value),turbidity:Number($('turbidity').value),spray:Number($('spray').value),lace:Number($('lace').value),amoeba:amoebaOptions(),result};
   status.textContent='ok / 5 FFT cascades / GPU submit + offscreen readback '+JSON.stringify(result);
   return;
  }
  async function loop(time){
   if(busy)return;
   busy=true;
   try{
    const dt=Math.min(0.05,Math.max(0,((time-lastClock)||16)/1000));
    lastClock=time;
    const speed=Number($('speed').value);
    if(!paused){
     elapsed+=dt;
     if(pressed.has('a')||pressed.has('arrowleft'))angle-=dt*0.65;
     if(pressed.has('d')||pressed.has('arrowright'))angle+=dt*0.65;
     const appliedSpeed=(pressed.has('s')||pressed.has('arrowdown'))?-speed:speed;
     boatX+=Math.cos(angle)*appliedSpeed*dt;
     boatZ+=Math.sin(angle)*appliedSpeed*dt;
    }
    // Asynchronous 27-point GPU buoyancy readback supplies a smoothed heave target.
    boatY+=(engine.height+1.7-boatY)*Math.min(1,dt*2.2);
    boatRoll+=(engine.roll-boatRoll)*Math.min(1,dt*2.4);
    boatPitch+=(engine.pitch-boatPitch)*Math.min(1,dt*2.4);
    const waveRise=(engine.height-previousWater)/Math.max(0.01,dt);
    const ballRise=(boatY-previousBallY)/Math.max(0.01,dt);
    const slam=Math.max(0.0,Math.min(2.8,(waveRise-ballRise)*0.65));
    previousWater=engine.height;previousBallY=boatY;
    await engine.step(uniforms(paused?0:speed),paused?0:dt,{
     spray:Number($('spray').value),lace:Number($('lace').value),slam:paused?0:slam,amoeba:amoebaOptions()
    });
    frameCount++;
    if(frameCount%25===0){
     const fps=(1/Math.max(dt,0.001)).toFixed(0);
     status.textContent='Pelagic Amoeba · FFT 5 × '+resolution+'² | '+engine.probes+'点 | '+fps+'fps\nアメーバ: '+boatX.toFixed(0)+', '+boatZ.toFixed(0)+' m / 波高 '+engine.height.toFixed(2)+'m / 傾き '+(engine.roll*180/Math.PI).toFixed(1)+'°';
     window.__oceanState={phase:'rendering',frames:frameCount,resolution,boatHeight:engine.height};
    }
   }catch(e){fatal(e);return;}
   finally{busy=false;}
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 }catch(e){fatal(e);}
}
start();