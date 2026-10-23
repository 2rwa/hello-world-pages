// Device coordinates: +x screen right, +y screen top, +z out of the screen.
// Low frequency accelerationIncludingGravity controls tilt; high frequency linear
// acceleration applies inertia. A short impulsive shake gets an extra burst.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function rotateXY(x,y){
 const angle=((Math.round(Number(screen.orientation?.angle??window.orientation??0)/90)*90)%360+360)%360;
 if(angle===90)return [y,-x];
 if(angle===180)return [-x,-y];
 if(angle===270)return [-y,x];
 return [x,y];
}
export function makeMotionSensor(status){
 let listening=false,received=false,method='none',lastMotion=0,lastBurst=-1e8;
 let gravityLP=null,gravity=[0,-9.81,0],current=[0,0,0],burst=0;
 function normalizeGravity(v){
  const len=Math.hypot(...v);
  return len>0.01?v.map(x=>x*9.81/len):gravity;
 }
 function consumeMotion(event){
  const raw=event.accelerationIncludingGravity;
  const validRaw=raw&&[raw.x,raw.y,raw.z].every(Number.isFinite);
  if(validRaw){
   const v=[raw.x,raw.y,raw.z];
   if(!gravityLP)gravityLP=v.slice();
   else for(let i=0;i<3;i++)gravityLP[i]=gravityLP[i]*0.88+v[i]*0.12;
   const [gx,gy]=rotateXY(-gravityLP[0],-gravityLP[1]);
   gravity=normalizeGravity([gx,gy,-gravityLP[2]]);
  }
  const a=event.acceleration;
  let linear;
  if(a&&[a.x,a.y,a.z].every(Number.isFinite)){
   linear=[a.x,a.y,a.z];method='linear';
  }else if(validRaw){
   linear=[raw.x-gravityLP[0],raw.y-gravityLP[1],raw.z-gravityLP[2]];
   method='high-pass';
  }else return;
  const [ax,ay]=rotateXY(-linear[0],-linear[1]);
  const impulse=[ax,ay,-linear[2]];
  for(let i=0;i<3;i++)current[i]=current[i]*0.36+clamp(impulse[i],-45,45)*0.64;
  const magnitude=Math.hypot(...impulse);
  const now=performance.now();
  if(magnitude>10&&now-lastBurst>240){
   burst=Math.max(burst,clamp((magnitude-7)*0.17,0.8,2.7));
   lastBurst=now;
  }
  lastMotion=now;received=true;
 }
 function consumeOrientation(event){
  if(gravityLP||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return;
  const beta=event.beta*Math.PI/180,gamma=event.gamma*Math.PI/180;
  const vx=-Math.sin(gamma),vy=-Math.sin(beta)*Math.cos(gamma);
  const vz=-Math.cos(beta)*Math.cos(gamma);
  const [x,y]=rotateXY(vx,vy);
  gravity=normalizeGravity([x,y,vz]);
  received=true;method='orientation';
 }
 async function activate(){
  if(typeof DeviceMotionEvent==='undefined'&&typeof DeviceOrientationEvent==='undefined')
   throw Error('このブラウザはモーションセンサーに非対応です');
  // iOS requires both requests to start within the same user gesture.
  const permissions=[];
  if(typeof DeviceMotionEvent!=='undefined'&&typeof DeviceMotionEvent.requestPermission==='function')
   permissions.push(DeviceMotionEvent.requestPermission());
  if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function')
   permissions.push(DeviceOrientationEvent.requestPermission());
  const decisions=await Promise.all(permissions);
  if(decisions.some(decision=>decision!=='granted'))
   throw Error('端末のモーション・傾きセンサーを許可してください');
  if(!listening){
   window.addEventListener('devicemotion',consumeMotion,{passive:true});
   window.addEventListener('deviceorientation',consumeOrientation,{passive:true});
   listening=true;
  }
  status('センサーON：傾けると重力が変化・振ると球が跳ねます');
 }
 function sample(dt){
  if(performance.now()-lastMotion>350){
   const decay=Math.exp(-8*dt);
   for(let i=0;i<3;i++)current[i]*=decay;
  }
  return current.slice();
 }
 function consumeBurst(){const v=burst;burst=0;return v;}
 return {activate,sample,consumeBurst,inject:consumeMotion,injectOrientation:consumeOrientation,
  get gravity(){return gravity.slice()},get received(){return received},
  get listening(){return listening},get method(){return method},
  get intensity(){return Math.hypot(...current)}};
}
