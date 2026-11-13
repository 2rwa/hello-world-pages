const $=id=>document.getElementById(id),canvas=$('view'),viewport=$('viewport'),ci=new URLSearchParams(location.search).has('ci');
const MAX=24,TAU=Math.PI*2;
const cfg={count:8,radius:.48,shell:2.8,speed:1,gravity:1.2,bounce:.92,refraction:1.12,quality:.85};
const specs=[['count','目玉の個数',1,24,1],['radius','目玉の半径',.22,.65,.01],['shell','外殻の半径',2.2,3.8,.05],['speed','再生速度',0,2.5,.05],['gravity','重力',0,6,.1],['bounce','反発係数',.4,1,.01],['refraction','屈折率',1,1.33,.01],['quality','描画解像度',.4,1,.05]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,k)=>a.map(x=>x*k),mag=a=>Math.hypot(...a),unit=a=>{const n=mag(a);return n>1e-8?mul(a,1/n):[0,0,1]},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),rnd=(a,b)=>a+Math.random()*(b-a);
const randDir=()=>{const z=rnd(-1,1),a=rnd(0,TAU),r=Math.sqrt(1-z*z);return [r*Math.cos(a),z,r*Math.sin(a)]};
const state={balls:[],time:0,hits:0,wallHits:0,pairHits:0,paused:false,yaw:.12,pitch:.12,hitDir:[0,1,0],hitAge:10,aim:null,accum:0};
function status(s,label=s){$('status').dataset.state=s;$('status').textContent=label}
function fail(e){status('error','WEBGPU ERROR');$('error').hidden=false;$('error').textContent=String(e);console.error(e)}
function effectiveRadius(){return Math.min(cfg.radius,cfg.shell/(cfg.count>19?4.7:cfg.count>7?4.0:2.6))}
function radiusFor(i){return effectiveRadius()*(.84+.16*Math.sin(i*2.31+1)**2)}
function spawn(){state.balls=[];const cells=[];const effective=effectiveRadius(),spacing=effective*2.02,extent=Math.ceil(cfg.shell/spacing);
for(let x=-extent;x<=extent;x++)for(let y=-extent;y<=extent;y++)for(let z=-extent;z<=extent;z++){const p=[x*spacing,y*spacing,z*spacing];if(mag(p)<=cfg.shell-effective-.025)cells.push(p)}
cells.sort((a,b)=>mag(a)-mag(b));let candidates=cells.slice(0,Math.min(cells.length,Math.max(cfg.count*3,35)));
for(let i=0;i<cfg.count;i++){const r=radiusFor(i);let p=null;for(let attempt=0;attempt<1800;attempt++){const q=mul(randDir(),Math.cbrt(Math.random())*(cfg.shell-r-.02));if(state.balls.every(b=>mag(sub(b.p,q))>=r+b.r+.025)){p=q;break}}if(!p){p=candidates.find(q=>mag(q)<=cfg.shell-r&&state.balls.every(b=>mag(sub(b.p,q))>=r+b.r+.005))}if(!p){ // Restart on the regular lattice if random placement becomes jammed.
state.balls=[];for(let j=0;j<cfg.count;j++){const q=cells[j];if(!q)break;state.balls.push(makeEye(j,q,radiusFor(j)))}break}state.balls.push(makeEye(i,p,r))}
state.hits=state.wallHits=state.pairHits=0;state.hitAge=10;state.accum=0;const rOut=$('radius')?.previousElementSibling?.querySelector('output');if(rOut)rOut.textContent=effective<cfg.radius-.001?cfg.radius.toFixed(2)+' → '+effective.toFixed(2):cfg.radius.toFixed(2)}
function makeEye(i,p,r){return {p:p.slice(),v:mul(randDir(),rnd(1.7,3.2)),r,g:unit(add([0,.12,1],mul(randDir(),.45))),hue:i*.61803398875%1,phase:i*2.3}}
function boundary(b,record=true){const d=mag(b.p),lim=cfg.shell-b.r;if(d<=lim)return;const n=unit(b.p);b.p=mul(n,lim-.0005);const vn=dot(b.v,n);if(vn>0){b.v=sub(b.v,mul(n,(1+cfg.bounce)*vn));if(record&&vn>.08){state.hits++;state.wallHits++;state.hitDir=n;state.hitAge=0}}}
function pairs(){for(let i=0;i<state.balls.length;i++)for(let j=i+1;j<state.balls.length;j++){const a=state.balls[i],b=state.balls[j],d=sub(b.p,a.p),l=mag(d),sum=a.r+b.r;if(l>=sum)continue;const n=l>1e-7?mul(d,1/l):[1,0,0],ia=1/(a.r**3),ib=1/(b.r**3),corr=(sum-l+.0005)/(ia+ib);a.p=sub(a.p,mul(n,corr*ia));b.p=add(b.p,mul(n,corr*ib));const vn=dot(sub(b.v,a.v),n);if(vn<0){const jv=-(1+cfg.bounce)*vn/(ia+ib);a.v=sub(a.v,mul(n,jv*ia));b.v=add(b.v,mul(n,jv*ib));if(vn<-.08){state.hits++;state.pairHits++}}}}
function step(dt){state.time+=dt;state.hitAge+=dt;
for(const b of state.balls){let accel=[0,-cfg.gravity,0];if($('energy').checked){const sp=mag(b.v);if(sp<2.3)accel=add(accel,mul(sp>.04?unit(b.v):randDir(),(2.3-sp)*2.4));accel[0]+=.28*Math.sin(state.time*1.4+b.phase);accel[2]+=.32*Math.cos(state.time*1.1+b.phase)}b.v=add(b.v,mul(accel,dt));if(mag(b.v)>8)b.v=mul(unit(b.v),8);b.p=add(b.p,mul(b.v,dt));boundary(b);
if($('gaze').checked){const cameraDir=unit(sub(camera().pos,b.p)),drift=add(mul(unit(b.v),.44),[.17*Math.sin(state.time*1.3+b.phase),.12*Math.cos(state.time*1.6+b.phase),0]),desired=state.aim?unit(sub(state.aim,b.p)):unit(add(cameraDir,drift));b.g=unit(add(mul(b.g,Math.exp(-dt*5)),mul(desired,1-Math.exp(-dt*5))))}else b.g=unit(sub(camera().pos,b.p))}
if($('collide').checked)for(let iter=0;iter<4;iter++){pairs();for(const b of state.balls)boundary(b)}
}
function stir(){for(const b of state.balls)b.v=add(mul(b.v,.45),mul(randDir(),rnd(3.8,6.4)))}
function camera(){const c=Math.cos(state.pitch),dir=[Math.sin(state.yaw)*c,Math.sin(state.pitch),Math.cos(state.yaw)*c],pos=mul(dir,cfg.shell*2.72),forward=mul(dir,-1),right=unit(cross(forward,[0,1,0])),up=cross(right,forward);return {pos,forward,right,up}}
function pointerRay(e){const r=viewport.getBoundingClientRect(),x=(2*(e.clientX-r.left)-r.width)/r.height,y=(r.height-2*(e.clientY-r.top))/r.height,c=camera(),dir=unit(add(add(mul(c.forward,1.72),mul(c.right,x)),mul(c.up,y)));return {o:c.pos,d:dir,c}}
function rayHit(o,d,p,r){const q=sub(o,p),b=dot(q,d),h=b*b-dot(q,q)+r*r;return h<0?Infinity:-b-Math.sqrt(h)}
function pick(e){const {o,d}=pointerRay(e);let origin=o,dir=d;const t=rayHit(o,d,[0,0,0],cfg.shell);if(Number.isFinite(t)&&t>0){origin=add(o,mul(d,t+.003));if($('water').checked){const n=unit(add(o,mul(d,t))),eta=1/cfg.refraction,cos=-dot(n,d),k=1-eta*eta*(1-cos*cos);if(k>=0)dir=unit(add(mul(d,eta),mul(n,eta*cos-Math.sqrt(k))))}}let chosen=null,best=Infinity;for(const b of state.balls){const v=rayHit(origin,dir,b.p,b.r);if(v>0&&v<best){chosen=b;best=v}}if(chosen){chosen.v=add(chosen.v,add(mul(dir,4.5),[0,2,0]));state.aim=add(origin,mul(dir,best))}else stir()}
let drag=null;canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw:state.yaw,pitch:state.pitch,moved:false};canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;if(drag.moved){state.yaw=drag.yaw-dx*.008;state.pitch=clamp(drag.pitch+dy*.008,-1.35,1.35)}});canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved)pick(e);drag=null});canvas.addEventListener('pointercancel',()=>drag=null);
$('stir').onclick=stir;$('pause').onclick=()=>{state.paused=!state.paused;$('pause').textContent=state.paused?'PLAY':'PAUSE'};$('reset').onclick=()=>{state.time=0;state.yaw=.12;state.pitch=.12;state.aim=null;spawn()};$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(viewport.requestFullscreen)await viewport.requestFullscreen();else await document.documentElement.requestFullscreen()}catch(e){console.warn(e)}};window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLButtonElement)return;if(e.code==='Space'){e.preventDefault();stir()}if(e.key==='p')$('pause').click()});
function resize(){const r=viewport.getBoundingClientRect(),s=Math.min(devicePixelRatio,1.5,1000/r.width,850/r.height)*cfg.quality;canvas.width=Math.max(1,Math.round(r.width*s));canvas.height=Math.max(1,Math.round(r.height*s))}
for(const [key,label,min,max,stepSize] of specs){const el=document.createElement('label');el.className='control';el.innerHTML='<span>'+label+'<output></output></span><input type="range">';const inp=el.querySelector('input'),out=el.querySelector('output');inp.id=key;inp.min=min;inp.max=max;inp.step=stepSize;inp.value=cfg[key];function show(){out.textContent=key==='count'?String(cfg[key]):cfg[key].toFixed(2)}show();inp.oninput=()=>{cfg[key]=+inp.value;show();if(['count','radius','shell'].includes(key)){state.aim=null;spawn()}if(key==='quality')resize()};$('controls').append(el)}
new ResizeObserver(resize).observe(viewport);resize();spawn();
const shader=`
struct EyeData { centerRadius:vec4<f32>, gazeHue:vec4<f32> }
struct SceneData { screenTime:vec4<f32>, cameraPos:vec4<f32>, cameraForward:vec4<f32>, cameraUp:vec4<f32>, shellParams:vec4<f32>, impactData:vec4<f32>, eyes:array<EyeData,24> }
@group(0) @binding(0) var<uniform> sceneData:SceneData;
@vertex fn vsMain(@builtin(vertex_index) vertexIndex:u32)->@builtin(position) vec4<f32>{
 let vertices=array<vec2<f32>,3>(vec2<f32>(-1.,-1.),vec2<f32>(3.,-1.),vec2<f32>(-1.,3.));
 return vec4<f32>(vertices[vertexIndex],0.,1.);
}
fn sphereInterval(rayOrigin:vec3<f32>,rayDir:vec3<f32>,centerPos:vec3<f32>,sphereRadius:f32)->vec2<f32>{
 let offsetPos=rayOrigin-centerPos;let rayB=dot(offsetPos,rayDir);
 let disc=rayB*rayB-dot(offsetPos,offsetPos)+sphereRadius*sphereRadius;
 if(disc<0.){return vec2<f32>(1.e5,-1.);}
 let rootDisc=sqrt(disc);return vec2<f32>(-rayB-rootDisc,-rayB+rootDisc);
}
struct SurfaceHit { travel:f32, eyeIndex:i32 }
fn eyeSdf(samplePos:vec3<f32>)->SurfaceHit{
 var nearestDist=1.e5;var nearestIndex=-1;
 for(var eyeIndex=0u;eyeIndex<24u;eyeIndex+=1u){
  if(eyeIndex>=u32(sceneData.screenTime.w)){break;}
  let eyeData=sceneData.eyes[eyeIndex].centerRadius;
  let eyeDist=length(samplePos-eyeData.xyz)-eyeData.w;
  if(eyeDist<nearestDist){nearestDist=eyeDist;nearestIndex=i32(eyeIndex);}
 }
 return SurfaceHit(nearestDist,nearestIndex);
}
fn marchEyes(rayOrigin:vec3<f32>,rayDir:vec3<f32>,endT:f32)->SurfaceHit{
 // Exact union of sphere SDFs; a conservative analytic bound skips empty space.
 var startT=endT;var lastT=0.;
 for(var eyeIndex=0u;eyeIndex<24u;eyeIndex+=1u){
  if(eyeIndex>=u32(sceneData.screenTime.w)){break;}
  let eyeData=sceneData.eyes[eyeIndex].centerRadius;
  let interval=sphereInterval(rayOrigin,rayDir,eyeData.xyz,eyeData.w+.012);
  if(interval.y>0. && interval.x<endT){startT=min(startT,max(0.,interval.x));lastT=max(lastT,min(endT,interval.y));}
 }
 var rayT=startT;
 for(var stepIndex=0u;stepIndex<48u;stepIndex+=1u){
  if(rayT>lastT || rayT>=endT){break;}
  let hitData=eyeSdf(rayOrigin+rayDir*rayT);
  if(hitData.travel<.0015){return SurfaceHit(rayT,hitData.eyeIndex);}
  rayT+=max(.001,hitData.travel*.92);
 }
 return SurfaceHit(endT,-1);
}
fn palette(hueValue:f32)->vec3<f32>{return vec3<f32>(.52)+.43*cos(6.283185*(hueValue+vec3<f32>(0.,.67,.33)));}
fn environment(rayDir:vec3<f32>)->vec3<f32>{
 let sky=vec3<f32>(.022,.056,.091)+vec3<f32>(.022,.061,.085)*max(rayDir.y,0.);
 let lightA=pow(max(dot(rayDir,normalize(vec3<f32>(-.55,.75,.45))),0.),38.);
 let lightB=pow(max(dot(rayDir,normalize(vec3<f32>(.7,.2,.55))),0.),85.);
 let bands=pow(max(0.,1.-abs(rayDir.y+.18)*5.),4.);
 return sky+vec3<f32>(.32,.69,.9)*lightA+vec3<f32>(.65,.45,.8)*lightB+vec3<f32>(.016,.065,.075)*bands;
}
fn shadeEye(hitPos:vec3<f32>,rayDir:vec3<f32>,eyeIndex:u32)->vec3<f32>{
 let eyeData=sceneData.eyes[eyeIndex];let surfaceNormal=normalize(hitPos-eyeData.centerRadius.xyz);
 let gazeDir=normalize(eyeData.gazeHue.xyz);
 let axisBase=select(vec3<f32>(0.,1.,0.),vec3<f32>(1.,0.,0.),abs(gazeDir.y)>.95);
 let irisRight=normalize(cross(axisBase,gazeDir));let irisUp=cross(gazeDir,irisRight);
 let irisUv=vec2<f32>(dot(surfaceNormal,irisRight),dot(surfaceNormal,irisUp));
 let irisRadius=length(irisUv);let irisAngle=atan2(irisUv.y,irisUv.x);
 let frontFace=dot(surfaceNormal,gazeDir);
 let timeValue=sceneData.screenTime.z;
 var baseColor=vec3<f32>(.87,.92,.90);
 let veins=pow(abs(sin(irisAngle*13.+sin(irisRadius*22.+eyeData.gazeHue.w*5.)*1.2+sin(irisAngle*3.)*.8)),23.);
 let branches=pow(abs(sin(irisAngle*29.-irisRadius*15.+sin(irisAngle*8.)*1.2)),30.);
 let veinAmount=(veins*.75+branches*.25)*smoothstep(.64,.98,irisRadius);
 baseColor-=vec3<f32>(.035,.22,.19)*veinAmount;
 if(frontFace>0. && irisRadius<.64){
  let irisHue=eyeData.gazeHue.w;let fibers=.62+.24*sin(irisAngle*49.+sin(irisRadius*27.)*3.1)+.12*sin(irisAngle*91.-irisRadius*19.)+.07*sin(irisAngle*147.+irisRadius*33.);
  let irisTint=palette(irisHue)*.72+vec3<f32>(.025,.075,.08);
  let pupilRadius=.245+.025*sin(timeValue*1.6+irisHue*12.);
  baseColor=irisTint*fibers*(.73+.27*smoothstep(.22,.48,irisRadius));
  baseColor=mix(baseColor,vec3<f32>(.015,.028,.036),smoothstep(.54,.64,irisRadius));
  baseColor=mix(vec3<f32>(.005,.009,.015),baseColor,smoothstep(pupilRadius-.008,pupilRadius+.008,irisRadius));
 }
 let lightDir=normalize(vec3<f32>(-.55,.86,.7));let fillDir=normalize(vec3<f32>(.8,.1,-.35));
 let diffuse=max(dot(surfaceNormal,lightDir),0.);let fill=max(dot(surfaceNormal,fillDir),0.);
 let rim=pow(1.-max(dot(surfaceNormal,-rayDir),0.),3.);
 let gloss=pow(max(dot(surfaceNormal,normalize(lightDir-rayDir)),0.),95.);
 let gloss2=pow(max(dot(surfaceNormal,normalize(vec3<f32>(.8,.25,.7)-rayDir)),0.),180.);
 let refl=environment(reflect(rayDir,surfaceNormal));
 return baseColor*(.29+.73*diffuse+.21*fill)+vec3<f32>(.8,.93,1.)*gloss*1.55+vec3<f32>(.55,.77,.9)*gloss2*.8+refl*(.15+.6*rim);
}
@fragment fn fsMain(@builtin(position) pixelPos:vec4<f32>)->@location(0) vec4<f32>{
 let screenSize=sceneData.screenTime.xy;let uvPos=vec2<f32>((2.*pixelPos.x-screenSize.x)/screenSize.y,(screenSize.y-2.*pixelPos.y)/screenSize.y);
 let rayOrigin=sceneData.cameraPos.xyz;let forwardDir=sceneData.cameraForward.xyz;let upDir=sceneData.cameraUp.xyz;let rightDir=normalize(cross(forwardDir,upDir));
 let rayDir=normalize(forwardDir*1.72+rightDir*uvPos.x+upDir*uvPos.y);
 let shellRadius=sceneData.shellParams.x;let iorValue=sceneData.shellParams.y;let waterFlag=sceneData.shellParams.z;
 let timeValue=sceneData.screenTime.z;
 var finalColor=vec3<f32>(.013,.027,.05)+vec3<f32>(.033,.062,.085)*exp(-dot(uvPos,uvPos)*1.1);
 let shellHit=sphereInterval(rayOrigin,rayDir,vec3<f32>(0.),shellRadius);
 if(shellHit.x>0. && shellHit.y>shellHit.x){
  let entryPos=rayOrigin+rayDir*shellHit.x;let entryNormal=normalize(entryPos);
  let refractedDir=refract(rayDir,entryNormal,1./iorValue);
  let insideDir=normalize(select(rayDir,refractedDir,waterFlag>.5));
  let insideOrigin=entryPos+insideDir*.004;
  let exitHit=sphereInterval(insideOrigin,insideDir,vec3<f32>(0.),shellRadius);
  let endT=max(.005,exitHit.y);
  let exitPos=insideOrigin+insideDir*endT;
  let exitNormal=normalize(exitPos);
  let exiting=refract(insideDir,-exitNormal,iorValue);
  let backDir=normalize(select(reflect(insideDir,exitNormal),exiting,length(exiting)>.0001));
  let cosEntry=max(dot(-rayDir,entryNormal),0.);
  let fresnel=.025+.90*pow(1.-cosEntry,4.5);
  let hitData=marchEyes(insideOrigin,insideDir,endT);
  let opticalDepth=hitData.travel;
  var insideColor=environment(select(insideDir,backDir,waterFlag>.5))*.72;
  let caustic=pow(max(0.,sin(exitPos.x*8.+sin(exitPos.z*5.+timeValue)*2.)*sin(exitPos.y*9.+sin(exitPos.x*4.-timeValue*.8)*2.)),7.);
  insideColor+=vec3<f32>(.025,.16,.19)*caustic;
  if(hitData.eyeIndex>=0){
   insideColor=shadeEye(insideOrigin+insideDir*hitData.travel,insideDir,u32(hitData.eyeIndex));
  }
  let transmission=exp(-opticalDepth*vec3<f32>(.075,.023,.016)*waterFlag);
  insideColor=insideColor*transmission+vec3<f32>(.015,.115,.14)*(vec3<f32>(1.)-transmission)*2.;
  let reflectColor=environment(reflect(rayDir,entryNormal));
  let stripe=pow(max(dot(entryNormal,normalize(vec3<f32>(-.65,.75,.35))),0.),28.);
  let stripe2=pow(max(dot(entryNormal,normalize(vec3<f32>(.8,.28,.5))),0.),65.);
  let rim=pow(1.-cosEntry,3.);
  let rippleAge=sceneData.impactData.w;
  let rippleDistance=acos(clamp(dot(entryNormal,sceneData.impactData.xyz),-1.,1.));
  let rippleOffset=(rippleDistance-rippleAge*2.5)*17.;let rippleOffset2=(rippleDistance-rippleAge*2.5+.22)*13.;
  let ripple=exp(-rippleOffset*rippleOffset-rippleAge*2.6);
  let ripple2=exp(-rippleOffset2*rippleOffset2-rippleAge*3.3);
  finalColor=mix(insideColor,reflectColor,fresnel*.83)+vec3<f32>(.15,.61,.74)*rim*.65+vec3<f32>(.36,.65,.75)*stripe*.48+vec3<f32>(.42,.33,.65)*stripe2*.48+vec3<f32>(.17,.75,.95)*(ripple+ripple2*.4)*.65;
 }
 finalColor=pow(max(finalColor,vec3<f32>(0.)),vec3<f32>(.83));
 return vec4<f32>(clamp(finalColor,vec3<f32>(0.),vec3<f32>(1.)),1.);
}
`;
let device,context,pipeline,bindGroup,uniformBuffer,format;
const data=new Float32Array(24+MAX*8);
function fillData(w,h){const c=camera();data.fill(0);data.set([w,h,state.time,state.balls.length],0);data.set([...c.pos,0],4);data.set([...c.forward,0],8);data.set([...c.up,0],12);data.set([cfg.shell,cfg.refraction,+$('water').checked,0],16);data.set([...state.hitDir,state.hitAge],20);state.balls.forEach((b,i)=>{data.set([...b.p,b.r,...b.g,b.hue],24+i*8)});device.queue.writeBuffer(uniformBuffer,0,data)}
function draw(texture,w,h,readBuffer=null,stride=0){fillData(w,h);const encoder=device.createCommandEncoder();const pass=encoder.beginRenderPass({colorAttachments:[{view:texture.createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.draw(3);pass.end();if(readBuffer)encoder.copyTextureToBuffer({texture},{buffer:readBuffer,bytesPerRow:stride,rowsPerImage:h},[w,h,1]);device.queue.submit([encoder.finish()])}
async function renderTest(){const w=320,h=240,stride=Math.ceil(w*4/256)*256;const tex=device.createTexture({size:[w,h],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});const buffer=device.createBuffer({size:stride*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});device.pushErrorScope('validation');draw(tex,w,h,buffer,stride);await device.queue.onSubmittedWorkDone();const error=await device.popErrorScope();if(error){tex.destroy();buffer.destroy();throw new Error(error.message)}await buffer.mapAsync(GPUMapMode.READ);const pixels=new Uint8Array(buffer.getMappedRange());let bright=0,white=0,hash=2166136261;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*stride+x*4,a=pixels[i],b=pixels[i+1],c=pixels[i+2];if(a+b+c>330)bright++;if(Math.min(a,b,c)>140)white++;hash=Math.imul(hash^a,16777619);hash=Math.imul(hash^b,16777619);hash=Math.imul(hash^c,16777619)}buffer.unmap();buffer.destroy();tex.destroy();return {bright,white,hash:hash>>>0}}
async function init(){if(!navigator.gpu)throw new Error('WebGPU非対応のブラウザです。Chrome / Edgeなどで開いてください。');status('request-adapter');const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error('GPU adapter unavailable');status('request-device');device=await adapter.requestDevice();device.lost.then(info=>fail('GPU lost: '+info.reason+' '+info.message));device.addEventListener('uncapturederror',e=>fail(e.error.message));format=ci?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();if(!ci){context=canvas.getContext('webgpu');context.configure({device,format,alphaMode:'opaque'})}status('shader-compilation-info');const module=device.createShaderModule({code:shader});const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw new Error(errors.map(m=>m.lineNum+': '+m.message).join('\n'));status('create-pipeline');device.pushErrorScope('validation');pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vsMain'},fragment:{module,entryPoint:'fsMain',targets:[{format}]},primitive:{topology:'triangle-list'}});uniformBuffer=device.createBuffer({size:data.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});bindGroup=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniformBuffer}}]});const validation=await device.popErrorScope();if(validation)throw new Error(validation.message);status('submitted-work-wait');const first=await renderTest();if(first.bright<20)throw new Error('Pixel readback is unexpectedly dark');status('ok','WEBGPU / LIVE');window.ocularGlobe={state,cfg,step,spawn,stir,renderTest,boundary};if(!ci)requestAnimationFrame(frame)}
let last=0,fpsStart=0,frames=0,fps=0;function frame(now){const dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(!state.paused){state.accum+=dt*cfg.speed;let n=0;while(state.accum>=1/120&&n<20){step(1/120);state.accum-=1/120;n++}if(n===20)state.accum=0}if(context)draw(context.getCurrentTexture(),canvas.width,canvas.height);frames++;if(now-fpsStart>500){fps=Math.round(frames*1000/(now-fpsStart));frames=0;fpsStart=now;$('stats').textContent='EYES '+String(state.balls.length).padStart(2,'0')+' / '+fps+' FPS';$('hits').textContent='COLLISIONS '+state.hits}requestAnimationFrame(frame)}
init().catch(fail);
