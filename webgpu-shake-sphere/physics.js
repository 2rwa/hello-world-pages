// Three-dimensional spheres confined by an actual spherical wall.
export const MAX_BALLS=50;
export const SHELL_RADIUS=3.65;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const radiusForCount=n=>Math.min(0.66,Math.max(0.38,0.86/Math.cbrt(Math.max(1,n)/5)));
export function makeBalls(count){
 const radius=radiusForCount(count);
 const spacing=radius*2.22;
 const positions=[];
 for(let x=-6;x<=6;x++)for(let y=-6;y<=6;y++)for(let z=-6;z<=6;z++){
  const px=(x+(Math.abs(y)%2)*0.48)*spacing;
  const py=(y+(Math.abs(z)%2)*0.28)*spacing*.94;
  const pz=z*spacing*.94;
  if(Math.hypot(px,py,pz)<SHELL_RADIUS-radius-0.18)
   positions.push([px,py,pz]);
 }
 positions.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
 if(positions.length<count)throw Error('Not enough room for '+count+' spheres');
 return positions.slice(0,count).map(([x,y,z],i)=>({
  x,y,z,vx:0,vy:0,vz:0,id:i
 }));
}
export function overlapStats(balls,radius){
 const n=balls.length,perBall=new Float32Array(n),projected=new Uint16Array(n);
 let penetrationPairs=0,maxPenetration=0,projectedPairs=0;
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  const a=balls[i],b=balls[j],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
  const gap=Math.hypot(dx,dy,dz);
  const penetration=Math.max(0,2*radius-gap);
  if(penetration>1e-5){
   penetrationPairs++;maxPenetration=Math.max(maxPenetration,penetration);
   perBall[i]=Math.max(perBall[i],penetration);
   perBall[j]=Math.max(perBall[j],penetration);
  }
  if(Math.hypot(dx,dy)<2*radius){
   projectedPairs++;projected[i]++;projected[j]++;
  }
 }
 return {penetrationPairs,maxPenetration,projectedPairs,perBall,projected};
}
function confine(b,radius){
 const allowed=SHELL_RADIUS-radius-0.015;
 const length=Math.hypot(b.x,b.y,b.z);
 if(length>allowed){
  const nx=b.x/length,ny=b.y/length,nz=b.z/length;
  b.x=nx*allowed;b.y=ny*allowed;b.z=nz*allowed;
  const radial=b.vx*nx+b.vy*ny+b.vz*nz;
  if(radial>0){
   b.vx-=(1+0.77)*radial*nx;
   b.vy-=(1+0.77)*radial*ny;
   b.vz-=(1+0.77)*radial*nz;
  }
 }
}
export function step(balls,radius,seconds,force,iterations,friction,gravityOn){
 const dt=clamp(seconds,0,0.027);
 const damping=Math.exp(-friction*dt*0.32);
 for(const b of balls){
  b.vx=clamp((b.vx+clamp(force[0],-48,48)*dt)*damping,-13,13);
  b.vy=clamp((b.vy+clamp(force[1],-48,48)*dt)*damping,-13,13);
  b.vz=clamp((b.vz+(clamp(force[2],-48,48)-(gravityOn?9.81:0))*dt)*damping,-13,13);
  b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
  confine(b,radius);
 }
 const count=balls.length;
 for(let pass=0;pass<iterations;pass++){
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
   const a=balls[i],b=balls[j];
   let dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
   const minDist=2*radius,distSq=dx*dx+dy*dy+dz*dz;
   if(distSq>=minDist*minDist)continue;
   const d=Math.sqrt(distSq);
   // Stable fallback normal when centres coincide.
   const nx=d>1e-6?dx/d:1,ny=d>1e-6?dy/d:0,nz=d>1e-6?dz/d:0;
   const correction=(minDist-d)*0.5;
   a.x-=nx*correction;a.y-=ny*correction;a.z-=nz*correction;
   b.x+=nx*correction;b.y+=ny*correction;b.z+=nz*correction;
   const approach=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny+(b.vz-a.vz)*nz;
   if(approach<0){
    const bounce=-(1+0.72)*approach/2;
    a.vx-=bounce*nx;a.vy-=bounce*ny;a.vz-=bounce*nz;
    b.vx+=bounce*nx;b.vy+=bounce*ny;b.vz+=bounce*nz;
   }
  }
  for(let i=0;i<count;i++)confine(balls[i],radius);
 }
 return overlapStats(balls,radius);
}
export function shake(balls,strength=1){
 // Sudden jar motion, not a simultaneous identical acceleration of every ball.
 const sx=(Math.random()-.5)*11*strength;
 const sy=(Math.random()-.5)*11*strength;
 const sz=(Math.random()-.5)*11*strength;
 for(const b of balls){
  b.vx+=(sx+(Math.random()-.5)*6)*strength;
  b.vy+=(sy+(Math.random()-.5)*6)*strength;
  b.vz+=(sz+(Math.random()-.5)*6)*strength;
 }
}
export function compress(balls,factor=0.57){
 // Diagnostic experiment, deliberately make genuine 3D penetration.
 for(const b of balls){b.x*=factor;b.y*=factor;b.z*=factor;}
}
export function kineticEnergy(balls){
 if(!balls.length)return 0;
 let sum=0;
 for(const b of balls)sum+=b.vx*b.vx+b.vy*b.vy+b.vz*b.vz;
 return sum/(2*balls.length);
}
