import {createEngine} from './engine.js';
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
const ci=query.has('ci'),mobile=/Android|iPhone|iPad/i.test(navigator.userAgent);
const canvas=$('view'),status=$('status'),performanceText=$('perf');
const sliders=['ballCount','bounces','spread','distance','ballSize','ior','float','tint','radius','amp','wind','foam','sun','altitude'];
const options=['mode','quality','meniscus','renderScale'];
for(const id of [...sliders,...options])if(query.has(id))$(id).value=query.get(id);
if(!query.has('quality'))$('quality').value=ci||mobile?'128':'256';
if(!query.has('renderScale'))$('renderScale').value=mobile&&!ci?'0.75':'1';
const resolution=Number($('quality').value);
let yaw=0.07,elapsed=0,prevTime=0,paused=false,busy=false,frames=0,engine;
let fpsWindowStart=0,fpsFrames=0,fps=0;
window.__glassDemo={phase:'script-start'};
function report(phase){window.__glassDemo.phase=phase;if(ci)status.textContent='CI: '+phase;}
function oceanRadius(){return Math.pow(10,Number($('radius').value));}
function updateLabels(){
 $('renderScaleOut').textContent=$('renderScale').value+'×';
 const unit={ballCount:' 個',bounces:' 回',spread:' m',distance:' m',ballSize:' m',ior:'',float:' × R',tint:'×',amp:'×',wind:' m/s',foam:'×',sun:'°',altitude:' m'};
 $('radiusOut').textContent=Math.round(oceanRadius()).toLocaleString()+' m';
 for(const id of sliders.filter(x=>x!=='radius'))$(id+'Out').textContent=$(id).value+unit[id];
}
sliders.forEach(id=>$(id).addEventListener('input',updateLabels));
$('renderScale').addEventListener('change',updateLabels);
$('quality').addEventListener('change',()=>{
 const q=new URLSearchParams(location.search);
 q.set('quality',$('quality').value);q.delete('ci');
 location.search=q.toString();
});
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'再開':'一時停止';};
$('reset').onclick=()=>{yaw=0.07;$('altitude').value=10;$('distance').value=35;updateLabels();};
$('hidePanel').onclick=()=>document.body.classList.add('folded');
$('showPanel').onclick=()=>document.body.classList.remove('folded');
let dragging=false,lastX=0;
function glassOptions(){return {count:Number($('ballCount').value),bounces:Number($('bounces').value),spread:Number($('spread').value),drift:1,meniscus:$('meniscus').value==='1'};}
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!dragging)return;yaw+=(e.clientX-lastX)*0.006;lastX=e.clientX;});
canvas.addEventListener('pointerup',()=>dragging=false);
canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('wheel',e=>{
 e.preventDefault();$('distance').value=Math.min(240,Math.max(20,Number($('distance').value)*Math.exp(e.deltaY*.0016)));
 updateLabels();
},{passive:false});
updateLabels();
// A render-scale of 2 means 2 physical render pixels per CSS pixel on either axis.
// Unlike FFT quality, it can change without rebuilding compute pipelines.
function renderDimensions(cssWidth,cssHeight){
 const requestedScale=Number($('renderScale').value)||1;
 const maxSize=engine?.maxTextureDimension2D||8192;
 const desiredPixels=cssWidth*cssHeight*requestedScale*requestedScale;
 const pixelBudget=12000000;
 const sizeLimit=maxSize/(Math.max(cssWidth,cssHeight)*requestedScale);
 const pixelLimit=Math.sqrt(pixelBudget/Math.max(1,desiredPixels));
 const scale=requestedScale*Math.min(1,sizeLimit,pixelLimit);
 const width=Math.max(1,Math.floor(cssWidth*scale));
 const height=Math.max(1,Math.floor(cssHeight*scale));
 return {width,height,scale,requestedScale};
}
function uniforms(w,h){
 const distance=Number($('distance').value);
 const eye=[Math.sin(yaw)*distance,Number($('altitude').value),-Math.cos(yaw)*distance];
 const look=[0,2.5,0];
 const values=new Float32Array(36);
 // Exact struct layout shared with the 5-cascade FFT implementation.
 values.set([elapsed,Number($('amp').value),Number($('wind').value),0.45],16);
 values.set([Number($('ballSize').value),Number($('ior').value),Number($('float').value),oceanRadius()],20);
 values.set([...look,Number($('mode').value)],24);
 values.set([Number($('sun').value)*Math.PI/180,Number($('foam').value),Number($('tint').value),w/h],28);
 values.set([...eye,h],32);
 return values;
}
function fail(error){
 const detail=String(error?.stack||error?.message||error);
 status.textContent='ERROR: '+detail;status.style.color='#ffb6a4';console.error(error);
 document.documentElement.dataset.test='error';
 window.__glassDemo={phase:'error',error:detail};
}
async function start(){
 try{
  engine=await createEngine(canvas,resolution,ci,report);
  if(ci){
   document.body.classList.add('folded');
   elapsed=18.5;
   async function renderOnce(){
    const {width:w,height:h,scale,requestedScale}=renderDimensions(480,300);
    document.documentElement.dataset.test='pending';
    const result=await engine.render(uniforms(w,h),w,h,glassOptions());
    window.__glassDemo={
     phase:'ok',resolution,result,mode:Number($('mode').value),
     renderWidth:w,renderHeight:h,renderScale:requestedScale,actualRenderScale:scale,
     ballSize:Number($('ballSize').value),ior:Number($('ior').value),
     float:Number($('float').value),tint:Number($('tint').value),
     radius:oceanRadius(),elapsed,count:Number($('ballCount').value),
     bounces:Number($('bounces').value),spread:Number($('spread').value),meniscus:$('meniscus').value==='1'
    };
    document.documentElement.dataset.test='ok';
    performanceText.textContent='GPU render verified · '+$('ballCount').value+' balls · '+$('bounces').value+' bounces';
    status.textContent='OK · 5 FFT cascades + refractive glass spheres · GPU pixels';
    return window.__glassDemo;
   }
   window.__renderOnce=renderOnce;
   await renderOnce();
   return;
  }
  function frame(now){
   if(busy)return;
   busy=true;
   const dt=Math.min(.05,Math.max(0,(now-prevTime||16)/1000));
   prevTime=now;
   if(!paused)elapsed+=dt;
   const {width:w,height:h,scale,requestedScale}=renderDimensions(canvas.clientWidth,canvas.clientHeight);
   engine.render(uniforms(w,h),w,h,glassOptions()).then(()=>{
    busy=false;frames++;fpsFrames++;
    const frameEnd=performance.now();
    if(!fpsWindowStart)fpsWindowStart=frameEnd;
    if(frameEnd-fpsWindowStart>=600){
     fps=1000*fpsFrames/(frameEnd-fpsWindowStart);
     fpsFrames=0;fpsWindowStart=frameEnd;
     performanceText.textContent='FPS '+fps.toFixed(1)+' · '+$('ballCount').value+' balls · '+$('bounces').value+' bounces · '+w+'×'+h;
     window.__glassDemo={phase:'rendering',frames,fps,count:Number($('ballCount').value),bounces:Number($('bounces').value)};
    }
    if(frames%30===0){
     status.textContent='GPU FFT: 5 × '+resolution+'² · raymarch + glass refraction\n'+
      '球 '+$('ballCount').value+' 個 · メニスカス '+($('meniscus').value==='1'?'ON':'OFF')+' · IOR '+$('ior').value+' · '+w+'×'+h+'（描画'+scale.toFixed(2)+'× / 指定'+requestedScale+'×）';
     window.__glassDemo={phase:'rendering',frames,fps,resolution,count:Number($('ballCount').value),bounces:Number($('bounces').value)};
    }
    requestAnimationFrame(frame);
   }).catch(fail);
  }
  requestAnimationFrame(frame);
 }catch(error){fail(error);}
}
start();
