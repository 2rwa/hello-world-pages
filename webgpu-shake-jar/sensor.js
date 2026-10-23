// Shake input: acceleration without gravity is the primary input.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function rotate2(x,y){
 const raw=screen.orientation?.angle??window.orientation??0;
 const angle=((Math.round(Number(raw)/90)*90)%360+360)%360;
 if(angle===90)return [y,-x];
 if(angle===180)return [-x,-y];
 if(angle===270)return [-y,x];
 return [x,y];
}
export function makeMotionSensor(status){
 let listening=false,received=false,method='none',lastMotion=0;
 let gravityLP=null;
 let current=[0,0,0],intensity=0;
 function consumeMotion(event){
  let x,y,z;
  const a=event.acceleration;
  if(a && [a.x,a.y,a.z].every(Number.isFinite)){
   [x,y,z]=[a.x,a.y,a.z];method='linear';
  }else{
   const g=event.accelerationIncludingGravity;
   if(!g || ![g.x,g.y,g.z].every(Number.isFinite))return;
   if(!gravityLP)gravityLP=[g.x,g.y,g.z];
   const raw=[g.x,g.y,g.z];
   // Slow gravity estimate: shake responds to fast changes, static tilt does not.
   for(let i=0;i<3;i++)gravityLP[i]=gravityLP[i]*0.975+raw[i]*0.025;
   [x,y,z]=raw.map((v,i)=>v-gravityLP[i]);method='high-pass';
  }
  const [sx,sy]=rotate2(x,y);
  // Coordinate convention: screen right = x+, screen top = y+.
  // Opposite acceleration is the apparent inertia of beads in the jar.
  const target=[-sx,-sy,-z];
  for(let i=0;i<3;i++)current[i]=current[i]*0.42+clamp(target[i],-36,36)*0.58;
  intensity=Math.hypot(...current);
  received=true;lastMotion=performance.now();
 }
 async function activate(){
  if(typeof DeviceMotionEvent==='undefined')throw Error('モーションセンサーが使えません');
  if(typeof DeviceMotionEvent.requestPermission==='function'){
   const result=await DeviceMotionEvent.requestPermission();
   if(result!=='granted')throw Error('センサーの許可がありません');
  }
  if(!listening){window.addEventListener('devicemotion',consumeMotion,{passive:true});listening=true;}
  received=false;gravityLP=null;
  status('センサー待機中。スマホを軽く左右に振ってください');
 }
 function sample(dt){
  if(performance.now()-lastMotion>300){
   for(let i=0;i<3;i++)current[i]*=Math.exp(-8*dt);
   intensity=Math.hypot(...current);
  }
  return current.slice();
 }
 return {activate,sample,get received(){return received},get listening(){return listening},
  get intensity(){return intensity},get method(){return method},inject:consumeMotion};
}
