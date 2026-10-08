export const settings = {scene:'galaxy', count:4000, size:1, opacity:.55, points:false, auto:true};
export const state = {yaw:.12,pitch:.18,distance:9.4,dirty:true,seed:1234, dragging:false};
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const normalize=v=>{const s=Math.hypot(...v)||1;return v.map(x=>x/s);};
const colorMix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function makeRandom(seed){let x=seed>>>0;return ()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function makeData(count,scene,seed){
 const rand=makeRandom(seed), normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-8,rand())))*Math.cos(2*Math.PI*rand());
 const raw=new Float32Array(count*16), positions=new Float32Array(count*3), pi=Math.PI;
 const palettes={galaxy:[[.21,.78,1],[.94,.24,.76],[1,.74,.35]],torus:[[.19,.91,.95],[.43,.52,1],[1,.47,.76]],flower:[[1,.34,.54],[1,.73,.47],[.68,.41,1]],shell:[[.17,.82,.99],[.35,.56,1],[1,.71,.41]]};
 for(let i=0;i<count;i++){
   let x=0,y=0,z=0,sx=.08,sy=.08,sz=.04,angle=rand()*2*pi;
   if(scene==='galaxy'){
     const arm=i%4, r=Math.sqrt(rand())*2.65;
     const t=arm*pi/2+r*1.55+normal()*.22;
     x=Math.cos(t)*r+normal()*.10;y=Math.sin(t)*r*.83+normal()*.10;z=normal()*(.12+.11*(1-r/2.65));
     sx=.045+rand()*.085;sy=.025+rand()*.055;sz=.022+rand()*.055;angle=t+pi/2;
   } else if(scene==='torus'){
     const a=rand()*2*pi,b=rand()*2*pi,minor=.55+normal()*.06;
     x=(1.85+minor*Math.cos(b))*Math.cos(a);y=(1.85+minor*Math.cos(b))*Math.sin(a);z=minor*Math.sin(b);
     sx=.055+rand()*.08;sy=.025+rand()*.065;sz=.035+rand()*.05;angle=a+b*.3;
   } else if(scene==='flower'){
     const petal=i%7, along=Math.pow(rand(),.6), across=normal()*.23*along;
     const a=petal*2*pi/7;
     x=Math.cos(a)*2.45*along-Math.sin(a)*across;
     y=Math.sin(a)*2.45*along+Math.cos(a)*across;
     z=.24*Math.sin(along*pi)+.37*along*along+normal()*.05;
     sx=.055+rand()*.095;sy=.027+rand()*.065;sz=.023+rand()*.026;angle=a;
   } else {
     const t=rand()*2*pi,v=2*rand()-1,p=Math.sqrt(1-v*v),r=1.93+normal()*.055;
     x=r*p*Math.cos(t);y=r*p*Math.sin(t);z=r*v;
     sx=.045+rand()*.095;sy=.025+rand()*.07;sz=.015+rand()*.045;angle=t;
   }
   const o=i*16;
   raw.set([x,y,z,0,sx,sy,sz,0],o);
   // Rotate the anisotropic footprint. Shell orientations are approximated via z-axis alignment.
   let q=[0,0,Math.sin(angle/2),Math.cos(angle/2)];
   if(scene==='shell'){
     const n=normalize([x,y,z]);
     if(n[2]<-.999)q=[1,0,0,0];
     else {const d=Math.sqrt(2*(1+n[2]));q=[-n[1]/d,n[0]/d,0,d/2];}
   }
   raw.set(q,o+8);
   const p1=palettes[scene], bias=rand();let c=colorMix(p1[i%3],p1[(i+1)%3],bias);
   if(scene==='galaxy'){
     const warm=Math.max(0,1-Math.hypot(x,y)/2.7);c=colorMix(c,[1,.84,.54],warm*.65);
   }
   const light=.65+rand()*.35;
   raw.set([c[0]*light,c[1]*light,c[2]*light,.32+rand()*.58],o+12);
   positions.set([x,y,z],i*3);
 }
 return {raw,positions};
}
export function getCamera(){
 const {yaw,pitch,distance}=state;
 const eye=[distance*Math.sin(yaw)*Math.cos(pitch),distance*Math.sin(pitch),distance*Math.cos(yaw)*Math.cos(pitch)];
 const front=normalize(eye.map(v=>-v));const right=normalize(cross(front,[0,1,0]));
 const up=normalize(cross(right,front));return {eye,front,right,up};
}