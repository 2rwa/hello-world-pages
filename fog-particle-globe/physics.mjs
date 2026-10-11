export const MAX_PARTICLES=2400;
const PI=Math.PI;
export function rngFromSeed(seed){let value=(seed|0)>>>0;return()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return (value>>>0)/4294967296;};}
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export class FogSimulation{
 constructor(settings){this.s=settings;this.particles=[];this.clock=0;this.reset();}
 reset(){const s=this.s,rand=rngFromSeed(s.seed);this.particles=[];this.clock=0;for(let i=0;i<MAX_PARTICLES;i++){
  let x,y,z,radius;
  for(let attempt=0;attempt<100;attempt++){
   x=rand()*2-1;y=rand()*2-1;z=rand()*2-1;radius=Math.hypot(x,y,z);
   if(radius<.98&&radius>1e-5)break;
  }
  let factor=s.spread*(.25+.75*Math.cbrt(rand()));
  if(s.shape==='cloud')factor*=.35+.65*Math.abs(Math.sin((x*3+z*2)*1.1));
  if(s.shape==='shell')factor=.64+.29*rand();
  if(s.shape==='band'){y*=.23;factor=.95*factor;}
  let length=Math.hypot(x,y,z)||1;
  const particle={x:x/length*factor,y:y/length*factor,z:z/length*factor,
   vx:(rand()-.5)*.09,vy:(rand()-.5)*.09,vz:(rand()-.5)*.09,
   radius:1+(rand()-.5)*1.8*(s.sizeVariance??.58),alpha:.55+.8*rand(),hue:rand(),phase:rand()*2*PI};
  this.particles.push(particle);
 }}
 stir(){const rand=rngFromSeed(((this.clock*1000)|0)+this.s.seed+734);
 for(let i=0;i<this.s.count;i++){const p=this.particles[i];p.vx+=(rand()-.5)*.45;p.vy+=(rand()-.5)*.45;p.vz+=(rand()-.5)*.45;}}
 step(dt){const s=this.s;const realDt=dt*s.speed;this.clock+=realDt;
 const time=this.clock,decay=Math.exp(-s.damping*realDt),motion=s.flow*realDt;
 for(let i=0;i<s.count;i++){
  const p=this.particles[i];const wave=Math.sin(time*.77+p.phase);
  // Smooth curl-like flow: tangent swirl around Y + spatially varying vortices.
  const turbulence=s.turbulence*.18;
  const fx=-p.z*s.swirl*.24+turbulence*Math.sin(p.y*4.1+time*.83+p.phase);
  const fz=p.x*s.swirl*.24+turbulence*Math.cos(p.x*3.7-time*.66+p.phase);
  const fy=s.buoyancy+turbulence*.6*Math.sin(p.z*3.8+time*.42+p.phase*1.3);
  p.vx=(p.vx+(fx+s.windX+wave*.015)*realDt)*decay;
  p.vy=(p.vy+(fy+s.windY)*realDt)*decay;
  p.vz=(p.vz+(fz+s.windZ)*realDt)*decay;
  p.x+=p.vx*motion;p.y+=p.vy*motion;p.z+=p.vz*motion;
  const radius=Math.hypot(p.x,p.y,p.z),limit=.975;
  if(radius>limit){
   const nx=p.x/radius,ny=p.y/radius,nz=p.z/radius;
   p.x=nx*limit;p.y=ny*limit;p.z=nz*limit;
   const outward=p.vx*nx+p.vy*ny+p.vz*nz;
   if(outward>0){p.vx-=(1+s.bounce)*outward*nx;p.vy-=(1+s.bounce)*outward*ny;p.vz-=(1+s.bounce)*outward*nz;}
  }
 }}
 validate(){for(let i=0;i<this.s.count;i++){const p=this.particles[i];if(!Number.isFinite(p.x+p.y+p.z+p.vx+p.vy+p.vz+p.radius+p.alpha+p.hue+p.phase)||Math.hypot(p.x,p.y,p.z)>1.00001)throw Error('Unbounded particle '+i);}}
 sorted(camera){const front=camera.forward,origin=camera.position;
 const ordered=this.particles.slice(0,this.s.count).sort((a,b)=>{
  const da=(a.x-origin[0])*front[0]+(a.y-origin[1])*front[1]+(a.z-origin[2])*front[2];
  const db=(b.x-origin[0])*front[0]+(b.y-origin[1])*front[1]+(b.z-origin[2])*front[2];return db-da;
 });
 const buffer=new Float32Array(this.s.count*12);
 for(let i=0;i<ordered.length;i++){const p=ordered[i],offset=i*12;
  buffer.set([p.x,p.y,p.z,p.radius*this.s.size,p.vx,p.vy,p.vz,p.alpha,p.hue,p.phase,0,0],offset);
 }return buffer;
 }
}
