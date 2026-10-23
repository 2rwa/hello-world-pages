// Simple physically-inspired 3D marble dynamics in a sealed cylindrical jar.
// The CPU handles inertia/collisions; WebGPU only draws the resulting positions.
export const MAX_BALLS=50;
export const JAR_RADIUS=3.65;
export const JAR_HEIGHT=1.75;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function marbleRadius(count){
 return Math.min(0.49,Math.max(0.26,1.10/Math.sqrt(Math.max(1,count)/3)));
}
export function makeMarbles(count){
 const radius=marbleRadius(count);
 const candidates=[];
 const dx=2.12*radius,dy=1.84*radius;
 for(let row=-12;row<=12;row++)for(let col=-12;col<=12;col++){
  const x=(col+(row&1)*0.5)*dx,y=row*dy;
  if(Math.hypot(x,y)<JAR_RADIUS-radius-0.32)
   candidates.push([x,y]);
 }
 // Order centre-out, stable, avoiding initial overlaps or out-of-jar marbles.
 candidates.sort((a,b)=>(a[0]*a[0]+a[1]*a[1])-(b[0]*b[0]+b[1]*b[1]));
 if(candidates.length<count)throw Error('Not enough room in jar for '+count+' balls');
 return candidates.slice(0,count).map(([x,y],i)=>({
  x,y,z:radius,vx:0,vy:0,vz:0,q:[0,0,0,1],seed:i*2.399963
 }));
}
function multiplyQuat(a,b){
 return [
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[0]-a[1]*b[2]+a[2]*b[0]+a[0]*b[1], // overridden below
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
 ];
}
export function measureEnergy(balls){
 if(!balls.length)return 0;
 let sum=0;
 for(const b of balls)sum+=b.vx*b.vx+b.vy*b.vy+b.vz*b.vz;
 return Math.sqrt(sum/balls.length);
}
export function shakeImpulse(balls,amplitude=1){
 for(const b of balls){
  const angle=Math.random()*Math.PI*2;
  b.vx+=Math.cos(angle)*3.3*amplitude;
  b.vy+=Math.sin(angle)*3.3*amplitude;
  b.vz+=Math.random()*3.2*amplitude;
 }
}
export function integrate(balls,radius,dt,force,surfaceDrag=1.0){
 const time=clamp(dt,0,0.028);
 const maxXY=JAR_RADIUS-radius-0.11;
 const ceiling=JAR_HEIGHT-radius-0.06;
 const resistance=Math.exp(-0.22*time);
 const floorFriction=Math.exp(-surfaceDrag*1.05*time);
 const previous=balls.map(b=>[b.x,b.y,b.z]);
 for(const b of balls){
  b.vx=clamp((b.vx+clamp(force[0],-50,50)*time)*resistance,-15,15);
  b.vy=clamp((b.vy+clamp(force[1],-50,50)*time)*resistance,-15,15);
  b.vz=clamp((b.vz+(clamp(force[2],-45,45)-9.81)*time)*resistance,-15,15);
  if(b.z<=radius+0.02){b.vx*=floorFriction;b.vy*=floorFriction;}
  b.x+=b.vx*time;b.y+=b.vy*time;b.z+=b.vz*time;
  if(b.z<radius){b.z=radius;b.vz=Math.abs(b.vz)*0.54;if(b.vz<0.17)b.vz=0;}
  if(b.z>ceiling){b.z=ceiling;b.vz=-Math.abs(b.vz)*0.64;}
  const d=Math.hypot(b.x,b.y);
  if(d>maxXY){
   const nx=b.x/d,ny=b.y/d,normal=b.vx*nx+b.vy*ny;
   b.x=nx*maxXY;b.y=ny*maxXY;
   if(normal>0){b.vx-=(1+0.72)*normal*nx;b.vy-=(1+0.72)*normal*ny;}
  }
 }
 // Iterative 3D sphere-sphere collision solver, including floor + jar walls.
 for(let pass=0;pass<3;pass++){
  for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
   const a=balls[i],b=balls[j];
   const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
   const distSq=dx*dx+dy*dy+dz*dz,diameter=radius*2;
   if(distSq>=diameter*diameter)continue;
   const distance=Math.sqrt(distSq);
   const nx=distance>1e-6?dx/distance:1;
   const ny=distance>1e-6?dy/distance:0;
   const nz=distance>1e-6?dz/distance:0;
   const penetration=diameter-distance;
   a.x-=nx*penetration*0.5;a.y-=ny*penetration*0.5;a.z-=nz*penetration*0.5;
   b.x+=nx*penetration*0.5;b.y+=ny*penetration*0.5;b.z+=nz*penetration*0.5;
   const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny+(b.vz-a.vz)*nz;
   if(relative<0){
    const impulse=-(1+0.83)*relative*0.5;
    a.vx-=impulse*nx;a.vy-=impulse*ny;a.vz-=impulse*nz;
    b.vx+=impulse*nx;b.vy+=impulse*ny;b.vz+=impulse*nz;
   }
  }
  for(const b of balls){
   b.z=clamp(b.z,radius,ceiling);
   const d=Math.hypot(b.x,b.y);
   if(d>maxXY){b.x*=maxXY/d;b.y*=maxXY/d;}
  }
 }
 for(let i=0;i<balls.length;i++){
  const b=balls[i],old=previous[i];
  const dx=b.x-old[0],dy=b.y-old[1];
  const len=Math.hypot(dx,dy);
  if(len>0.0001){
   const half=len/(radius*2),s=Math.sin(half);
   const rotation=[-dy/len*s,dx/len*s,0,Math.cos(half)];
   const q=multiplyQuat(rotation,b.q);
   const magnitude=Math.hypot(...q);
   if(magnitude>0)b.q=q.map(v=>v/magnitude);
  }
 }
}
