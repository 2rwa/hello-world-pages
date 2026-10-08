export const settings={mode:0,scene:'ribbon',resolution:'480x270',count:32,steps:24,density:1.2,scale:1,glass:1,auto:true};
export const state={yaw:.12,pitch:.13,distance:7.8,seed:20261008,dragging:false};
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=v=>{const m=Math.hypot(...v)||1;return v.map(x=>x/m);};
function rng(seed){let s=seed>>>0;return ()=>{s=(s+0x6d2b79f5)>>>0;let x=s;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
export function generate(count,scene,seed){
 const rand=rng(seed),raw=new Float32Array(count*16),positions=new Float32Array(count*3),tau=2*Math.PI;
 const palette=[[.12,.88,1.0],[.97,.30,.78],[1.0,.72,.25],[.32,.45,1.0]];
 for(let i=0;i<count;i++){
  const r=rand(),t=rand()*tau,p=(i+.5)/count,rr=Math.sqrt(rand());
  let x,y,z;
  if(scene==='ribbon'){x=(p*2-1)*3.7+(rand()-.5)*.75;y=Math.sin(x*1.8)*.8+Math.sin(x*4)*.16+(rand()-.5)*.85;z=-1.65+Math.cos(x*1.35)*.5+(rand()-.5)*1.7;}
  else if(scene==='halo'){const angle=t,radius=2.05+(rand()-.5)*.95;x=Math.cos(angle)*radius;y=Math.sin(angle)*radius*.82;z=-1.65+(rand()-.5)*1.25;}
  else {const phi=t,zz=rand()*2-1,k=Math.sqrt(1-zz*zz),radius=2.0+(rand()-.5)*.48;x=radius*k*Math.cos(phi);y=radius*zz;z=radius*k*Math.sin(phi)-1.6;}
  const o=i*16,s=.22+rand()*.25,angle=rand()*tau;
  const sx=s*(.8+rand()*.85),sy=s*(.65+rand()*.6),sz=s*(.55+rand()*.85);
  const c=palette[i%4],m=.7+.3*rand();
  raw.set([x,y,z,0,sx,sy,sz,0,0,0,Math.sin(angle*.5),Math.cos(angle*.5),c[0]*m,c[1]*m,c[2]*m,.5+rand()*.42],o);
  positions.set([x,y,z],i*3);
 }
 return {raw,positions};
}
export function camera(){
 const {yaw,pitch,distance}=state;
 const eye=[distance*Math.sin(yaw)*Math.cos(pitch),distance*Math.sin(pitch),distance*Math.cos(yaw)*Math.cos(pitch)];
 const front=normalize(eye.map(v=>-v)),right=normalize(cross(front,[0,1,0])),up=normalize(cross(right,front));
 return {eye,right,up,front};
}
