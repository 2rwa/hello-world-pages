export const CAPACITY=192;
const TAU=Math.PI*2;
export function clamp(x,low,high){return Math.max(low,Math.min(high,x));}
export function seeded(seed){let x=(seed>>>0)||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
export class SmokeWorld{
 constructor(settings){this.s=settings;this.bodies=[];this.time=0;this.impacts=0;this.reset();}
 reset(){
  const s=this.s,rnd=seeded(s.seed);this.time=0;this.impacts=0;this.bodies=[];
  for(let i=0;i<CAPACITY;i++){
   const phase=((i*.61803398875)%1)<s.phaseRatio?0:1;
   let x,y,z,n;
   do{x=(rnd()*2-1);y=(rnd()*2-1);z=(rnd()*2-1);n=Math.hypot(x,y,z);}while(n>.98||n<.001);
   const ra=Math.max(.028,s.radius*(1+(rnd()*2-1)*s.radiusVariance));
   const envelope=s.initialSpread*(.22+.7*Math.cbrt(rnd()));
   this.bodies.push({
    x:x/n*envelope,y:y/n*envelope,z:z/n*envelope,
    vx:(rnd()-.5)*.1,vy:(rnd()-.5)*.1,vz:(rnd()-.5)*.1,
    r:ra,phase,seed:rnd()*TAU,energy:0,density:.72+.55*rnd()
   });
  }
  this.keepInBounds();
 }
 keepInBounds(){
  const s=this.s;
  for(const p of this.bodies){
   const limit=Math.max(.24,1-s.wallGap-p.r*.7);
   const n=Math.hypot(p.x,p.y,p.z);
   if(n>limit){const f=limit/n;p.x*=f;p.y*=f;p.z*=f;}
  }
 }
 stir(){
  const rand=seeded((this.s.seed+Math.floor(this.time*1731)+971)|0);
  for(let i=0;i<this.s.count;i++){
   const p=this.bodies[i];
   p.vx+=(rand()-.5)*this.s.stirStrength;
   p.vy+=(rand()-.5)*this.s.stirStrength;
   p.vz+=(rand()-.5)*this.s.stirStrength;
  }
 }
 step(rawDt){
  const s=this.s;
  const dt=Math.min(.04,Math.max(0,rawDt))*s.speed;
  this.time+=dt;
  if(dt===0)return;
  const count=Math.max(1,Math.min(CAPACITY,Math.round(s.count)));
  const all=this.bodies;
  const ax=new Float32Array(count),ay=new Float32Array(count),az=new Float32Array(count);
  this.impacts=0;
  for(let i=0;i<count;i++){
   const a=all[i];
   for(let j=i+1;j<count;j++){
    const b=all[j];
    const dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;
    const d2=dx*dx+dy*dy+dz*dz;
    const maxReach=(a.r+b.r)*s.interactionRange;
    if(d2>maxReach*maxReach)continue;
    const dist=Math.max(.00001,Math.sqrt(d2));
    const inv=1/dist;
    const sigma=a.r+b.r;
    const nDist=dist/sigma;
    const push=s.softCollision*Math.pow(Math.max(0,1-nDist),1.4)*1.8;
    let force=push;
    if(a.phase===b.phase){
     const cohesion=Math.max(0,1-Math.abs(nDist-1.65)/1.65);
     force-=cohesion*s.sameAttraction*.22;
    }else{
     force+=Math.max(0,1-nDist/s.interactionRange)*s.phaseRepulsion*.42;
    }
    const fx=dx*inv*force,fy=dy*inv*force,fz=dz*inv*force;
    ax[i]+=fx;ay[i]+=fy;az[i]+=fz;
    ax[j]-=fx;ay[j]-=fy;az[j]-=fz;
   }
  }
  const damp=Math.exp(-s.damping*dt);
  for(let i=0;i<count;i++){
   const p=all[i];const n=Math.max(.0001,Math.hypot(p.x,p.y,p.z));
   // Glass-shy surface potential: repel before touching, hard clamp as a safety net.
   const safe=Math.max(.24,1-s.wallGap-p.r*.7);
   const influence=.17+s.wallRange;
   const intrude=n-(safe-influence);
   const repel=intrude>0?s.wallRepulsion*(intrude/influence)*(intrude/influence):0;
   ax[i]-=p.x/n*repel;
   ay[i]-=p.y/n*repel;
   az[i]-=p.z/n*repel;
   // Soft restoring force avoids constantly sticking at the same spot.
   const recenter=s.cohesion*.13;
   ax[i]-=p.x*recenter;ay[i]-=p.y*recenter;az[i]-=p.z*recenter;
   // Swirl and animated spatial eddies. Non-fluid approximation by design.
   const t=this.time,pSeed=p.seed;
   ax[i]+=(-p.z*s.swirl*.36+s.turbulence*Math.sin(3.7*p.y+1.2*t+pSeed)*.32+s.windX);
   ay[i]+=s.buoyancy+s.turbulence*Math.sin(3.3*p.z-.74*t+pSeed*.7)*.24+s.windY;
   az[i]+=(p.x*s.swirl*.36+s.turbulence*Math.cos(3.9*p.x+1.05*t+pSeed)*.32+s.windZ);
   p.vx=(p.vx+ax[i]*dt)*damp;
   p.vy=(p.vy+ay[i]*dt)*damp;
   p.vz=(p.vz+az[i]*dt)*damp;
   const v=Math.hypot(p.vx,p.vy,p.vz),limit=s.maxVelocity;
   if(v>limit){const factor=limit/v;p.vx*=factor;p.vy*=factor;p.vz*=factor;}
   p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
   const dist=Math.hypot(p.x,p.y,p.z);
   if(dist>safe){
    const nx=p.x/dist,ny=p.y/dist,nz=p.z/dist;
    p.x=nx*safe;p.y=ny*safe;p.z=nz*safe;
    const vn=p.vx*nx+p.vy*ny+p.vz*nz;
    if(vn>0){
     const impulse=(1+s.wallBounce)*vn;
     p.vx-=nx*impulse;p.vy-=ny*impulse;p.vz-=nz*impulse;
     p.energy=Math.min(1,p.energy+vn*1.2);
     this.impacts++;
    }
    const radial=p.vx*nx+p.vy*ny+p.vz*nz;
    const slide=Math.exp(-Math.max(0,1-s.wallSlip)*1.2*dt);
    p.vx=radial*nx+(p.vx-radial*nx)*slide;
    p.vy=radial*ny+(p.vy-radial*ny)*slide;
    p.vz=radial*nz+(p.vz-radial*nz)*slide;
   }
   p.energy*=Math.exp(-dt*2.4);
  }
 }
 validate(){
  for(let i=0;i<this.s.count;i++){
   const p=this.bodies[i];
   if(!p||![p.x,p.y,p.z,p.vx,p.vy,p.vz,p.r,p.energy].every(Number.isFinite))
    throw Error('Non-finite smoke marble '+i);
   const limit=Math.max(.24,1-this.s.wallGap-p.r*.7);
   if(Math.hypot(p.x,p.y,p.z)>limit+.0001)throw Error('Glass penetrated by marble '+i);
  }
 }
 sorted(camera){
  const forward=camera.forward,origin=camera.position;
  const sorted=this.bodies.slice(0,this.s.count).sort((a,b)=>{
   const da=(a.x-origin[0])*forward[0]+(a.y-origin[1])*forward[1]+(a.z-origin[2])*forward[2];
   const db=(b.x-origin[0])*forward[0]+(b.y-origin[1])*forward[1]+(b.z-origin[2])*forward[2];
   return db-da;
  });
  const packed=new Float32Array(sorted.length*12);
  for(let k=0;k<sorted.length;k++){
   const p=sorted[k],off=k*12;
   packed.set([p.x,p.y,p.z,p.r,p.vx,p.vy,p.vz,p.density,p.phase,p.seed,p.energy,0],off);
  }
  return packed;
 }
}