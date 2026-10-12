// CPU mirror of WGSL SDFs, used for mesh extraction.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function inverseRotation(v,q){
 const x=-q[0],y=-q[1],z=-q[2],w=q[3];
 const tx=2*(y*v[2]-z*v[1]),ty=2*(z*v[0]-x*v[2]),tz=2*(x*v[1]-y*v[0]);
 return [v[0]+w*tx+y*tz-z*ty,v[1]+w*ty+z*tx-x*tz,v[2]+w*tz+x*ty-y*tx];
}
export function partDistance(p,v){
 const a=v.a,b=v.b,k=v.c[0],d=[p[0]-a[0],p[1]-a[1],p[2]-a[2]];
 if(k===0)return Math.hypot(...d)-a[3];
 if(k===1){
  const s=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  const t=Math.max(0,Math.min(1,dot(d,s)/Math.max(1e-9,dot(s,s))));
  return Math.hypot(d[0]-t*s[0],d[1]-t*s[1],d[2]-t*s[2])-a[3];
 }
 if(k===2){
  const h=dot(d,b),r=Math.hypot(d[0]-h*b[0],d[1]-h*b[1],d[2]-h*b[2]);
  return Math.hypot(r-a[3],h)-b[3];
 }
 const x=inverseRotation(d,v.d),q=x.map((n,i)=>Math.abs(n)-b[i]);
 return Math.hypot(...q.map(n=>Math.max(n,0)))+Math.min(Math.max(...q),0)-a[3];
}
export function sceneDistance(p,parts){
 let distance=1e6,material=0;
 for(const part of parts){
  const n=partDistance(p,part);
  if(n<distance){distance=n;material=part.c[1];}
 }
 return {distance,material};
}
