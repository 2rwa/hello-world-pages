export const CAPACITY=32;
export function rand(seed){let x=(seed|0)||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
export const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export class MarblePhysics{
 constructor(state){this.s=state;this.marbles=[];this.clock=0;this.contacts=0;this.reset();}
 reset(){
  const s=this.s,rnd=rand(s.seed);this.clock=0;this.contacts=0;this.marbles=[];
  for(let i=0;i<CAPACITY;i++){
   const r=s.radius*(1+(rnd()*2-1)*s.variance);
   // three intentionally overlapping clusters visibly merge when smoothing is enabled.
   const cluster=i%3,angle=cluster*Math.PI*2/3;
   let x=Math.sin(angle)*.39+(rnd()-.5)*.36;
   let y=(rnd()-.5)*.7;
   let z=Math.cos(angle)*.39+(rnd()-.5)*.36;
   const length=Math.hypot(x,y,z)||1;
   const maxDist=Math.max(.25,1-s.wallGap-r-.045);
   const ratio=Math.min(1,maxDist/length)*(s.spread/.65);
   x*=ratio;y*=ratio;z*=ratio;
   const len=Math.hypot(x,y,z)||1;
   if(len>maxDist){x*=maxDist/len;y*=maxDist/len;z*=maxDist/len;}
   this.marbles.push({x,y,z,vx:(rnd()-.5)*.24,vy:(rnd()-.5)*.24,vz:(rnd()-.5)*.24,r,seed:rnd()*6.2831853,hue:rnd(),contact:0});
  }
  this.contain();
 }
 contain(){
  for(const p of this.marbles){
   const limit=Math.max(.2,1-this.s.wallGap-p.r-.015);
   const dist=Math.hypot(p.x,p.y,p.z);
   if(dist>limit){const q=limit/dist;p.x*=q;p.y*=q;p.z*=q;}
  }
 }
 stir(){
  const r=rand(this.s.seed+Math.trunc(this.clock*10000)+903);
  for(let i=0;i<this.s.count;i++){const p=this.marbles[i];p.vx+=(r()-.5)*.7;p.vy+=(r()-.5)*.7;p.vz+=(r()-.5)*.7;}
 }
 step(delta){
  const s=this.s,dt=Math.min(.04,Math.max(0,delta))*s.speed;
  this.clock+=dt;this.contacts=0;if(dt===0)return;
  const n=Math.min(CAPACITY,Math.max(1,Math.round(s.count)));
  const fx=new Float32Array(n),fy=new Float32Array(n),fz=new Float32Array(n);
  for(let i=0;i<n;i++){
   const a=this.marbles[i];
   for(let j=i+1;j<n;j++){
    const b=this.marbles[j],dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;
    const r=a.r+b.r,d=Math.max(.0001,Math.hypot(dx,dy,dz));
    if(d>r*2.1)continue;
    const overlap=Math.max(0,r*1.22-d);
    if(overlap>.001)this.contacts++;
    const rep=s.repulsion*overlap*1.7;
    const attract=s.cohesion*Math.max(0,1-Math.abs(d-r*1.7)/(r*1.7))*.11;
    const f=(rep-attract)/d;
    fx[i]+=dx*f;fy[i]+=dy*f;fz[i]+=dz*f;
    fx[j]-=dx*f;fy[j]-=dy*f;fz[j]-=dz*f;
   }
  }
  const damping=Math.exp(-s.damping*dt);
  for(let i=0;i<n;i++){
   const p=this.marbles[i],phase=p.seed;
   fx[i]+=-p.z*s.swirl*.28+s.turbulence*Math.sin(p.y*4.1+this.clock*.7+phase)*.23;
   fy[i]+=s.buoyancy+s.turbulence*Math.sin(p.z*3.9-this.clock*.8+phase)*.19;
   fz[i]+=p.x*s.swirl*.28+s.turbulence*Math.cos(p.x*4.3+this.clock*.67+phase)*.23;
   p.vx=(p.vx+fx[i]*dt)*damping;p.vy=(p.vy+fy[i]*dt)*damping;p.vz=(p.vz+fz[i]*dt)*damping;
   const speed=Math.hypot(p.vx,p.vy,p.vz);
   if(speed>1.9){const z=1.9/speed;p.vx*=z;p.vy*=z;p.vz*=z;}
   p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
   const dist=Math.hypot(p.x,p.y,p.z),limit=Math.max(.2,1-s.wallGap-p.r-.015);
   if(dist>limit){
    const nx=p.x/dist,ny=p.y/dist,nz=p.z/dist;
    p.x=nx*limit;p.y=ny*limit;p.z=nz*limit;
    const outward=p.vx*nx+p.vy*ny+p.vz*nz;
    if(outward>0){
     p.vx-=(1+s.wallBounce)*outward*nx;
     p.vy-=(1+s.wallBounce)*outward*ny;
     p.vz-=(1+s.wallBounce)*outward*nz;
    }
   }
   p.contact*=Math.exp(-2*dt);
  }
 }
 validate(){
  for(let i=0;i<this.s.count;i++){
   const p=this.marbles[i];
   if(!p||![p.x,p.y,p.z,p.vx,p.vy,p.vz,p.r].every(Number.isFinite))throw Error('Nonfinite marble '+i);
   const limit=1-this.s.wallGap-p.r-.015;
   if(Math.hypot(p.x,p.y,p.z)>limit+.00001)throw Error('Marble outside glass shell '+i);
  }
 }
 packed(){
  const data=new Float32Array(this.s.count*8);
  for(let i=0;i<this.s.count;i++){
   const p=this.marbles[i];data.set([p.x,p.y,p.z,p.r,p.vx,p.vy,p.hue,p.seed],i*8);
  }return data;
 }
}
