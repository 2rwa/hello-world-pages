// Procedural SDF unit: +Y up, +Z front.
export const MAX_PARTS=128;
export const TYPES={SPHERE:0,CAPSULE:1,TORUS:2,BOX:3};
export const DEFAULTS={pose:.28,halo:1,armor:1,cannon:1};
export const rotation=(axis,angle)=>{const len=Math.hypot(...axis)||1,s=Math.sin(angle/2)/len;return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(angle/2)];};
export function builder(){
 const parts=[],I=[0,0,0,1];
 const add=(kind,mat,a,b=[0,0,0,0],q=I)=>{
  if(parts.length>=MAX_PARTS)throw Error('Primitive count exceeds MAX_PARTS');
  parts.push({a,b,c:[kind,mat,0,0],d:q});
 };
 return {parts,
  sphere:(x,y,z,r,m=0)=>add(0,m,[x,y,z,r]),
  capsule:(p,q,r,m=0)=>add(1,m,[...p,r],[...q,0]),
  torus:(c,n,r,t,m=0)=>add(2,m,[...c,r],[...n,t]),
  box:(c,h,r=.03,m=0,q=I)=>add(3,m,[...c,r],[...h,0],q)
 };
}
export function packScene(parts){
 const f=new Float32Array(MAX_PARTS*16);
 for(let i=0;i<parts.length;i++){
  const k=i*16,p=parts[i];f.set(p.a,k);f.set(p.b,k+4);f.set(p.c,k+8);f.set(p.d,k+12);
 }
 return f;
}
import {addTorso} from './torso.js';
import {addLimbs} from './limbs.js';
export function buildScene(raw={}){
 const options={...DEFAULTS,...raw},b=builder();
 addTorso(b,options);addLimbs(b,options);
 return b.parts;
}
