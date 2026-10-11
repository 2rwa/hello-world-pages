// 3D CPU physics; no rendering dependencies. Fixed-step integrator.
export const defaults={
 radius:1.8,gravity:5.5,gx:0,gy:-1,gz:0,buoyancy:1.6,
 smokeDrag:1.15,ballDrag:.055,restitution:.78,turbulence:.55,vorticity:1.05,
 windX:0,windY:0,windZ:0,timeScale:1,
 push:2.8,pushRadius:.19,transfer:1.35,wake:1.65,wakeLife:2.4,diffusion:.34,
 smokeCount:220,smokeDensity:1.15,smokeAlpha:.85,smokeColor:'#9dcdf6',
 ballCount:5,ballRadius:.21,sizeJitter:.3,ior:1.49,dispersion:.065,
 reflectivity:.9,gloss:.88,shellOpacity:.5,bloom:.35,quality:'auto'
};
export const presets={
 Default:{},
 'Heavy Glass':{gravity:15,ballCount:7,ballRadius:.22,transfer:2.4,wake:2.4,push:4,smokeCount:260},
 'Zero Gravity':{gravity:0,ballDrag:.02,buoyancy:1.9,ballCount:7,wakeLife:3},
 Storm:{gravity:8,turbulence:2.5,vorticity:3.1,windX:1.2,windZ:-.5,buoyancy:2.5,transfer:2.7,wake:3.4,ballCount:9,smokeCount:380}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const len=(a)=>Math.hypot(a[0],a[1],a[2]);
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a,b)=>[a[0]*b,a[1]*b,a[2]*b];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=(a)=>{const d=len(a);return d>1e-8?mul(a,1/d):[0,1,0]};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function seeded(seed){let x=seed>>>0;return ()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296}};
function spherePoint(rand){const z=rand()*2-1,angle=rand()*Math.PI*2,r=Math.sqrt(1-z*z);return [r*Math.cos(angle),z,r*Math.sin(angle)]}
function makeSmoke(rand,r,age){const s=spherePoint(rand),spread=(rand()**.48)*r*.88;return {p:mul(s,spread),v:[0,0,0],size:.065+rand()*.085,density:.6+rand()*.75,life:5+rand()*8,age:age??rand()*10,wake:[0,0,0]}}
function makeBall(rand,r,cfg,idx,total){const theta=idx*2.39996;const row=idx%4;const rad=cfg.ballRadius*(1+(rand()-.5)*cfg.sizeJitter*2);const band=Math.sqrt(Math.max(0,1-(row*.22)**2));return {p:[Math.cos(theta)*.47*band,(rand()-.5)*r*.9,Math.sin(theta)*.47*band],v:[(rand()-.5)*.5,(rand()-.5)*.4,(rand()-.5)*.5],r:rad,mass:rad**3}}
export function createWorld(cfg=defaults,seed=84719){
 const rand=seeded(seed),ballCount=clamp(Math.round(cfg.ballCount),0,16),smokeCount=clamp(Math.round(cfg.smokeCount),0,700);
 return {balls:Array.from({length:ballCount},(_,i)=>makeBall(rand,cfg.radius,cfg,i,ballCount)),smoke:Array.from({length:smokeCount},()=>makeSmoke(rand,cfg.radius)),rng:rand,t:0,steps:0};
}
export function resizeWorld(world,cfg){
 const bc=clamp(Math.round(cfg.ballCount),0,16),sc=clamp(Math.round(cfg.smokeCount),0,700);
 while(world.balls.length<bc)world.balls.push(makeBall(world.rng,cfg.radius,cfg,world.balls.length,bc));
 world.balls.length=bc;
 while(world.smoke.length<sc)world.smoke.push(makeSmoke(world.rng,cfg.radius,0));
 world.smoke.length=sc;
 for(const b of world.balls)b.r=clamp(cfg.ballRadius*(b.r/(b._prevBase||cfg.ballRadius)),.045,cfg.radius*.23),b._prevBase=cfg.ballRadius;
}
function wallSphere(item,rLimit,bounce){const d=len(item.p);if(d>rLimit){const n=mul(item.p,1/Math.max(d,1e-6));item.p=mul(n,rLimit);const vn=dot(item.v,n);if(vn>0)item.v=sub(item.v,mul(n,(1+bounce)*vn));}}
export function stepWorld(world,cfg,dt){
 dt=clamp(dt,0,1/30);world.t+=dt;world.steps++;
 const direction=unit([cfg.gx,cfg.gy,cfg.gz]);
 const g=mul(direction,cfg.gravity);
 for(const b of world.balls){
  b.v=mul(add(b.v,mul(g,dt)),Math.exp(-cfg.ballDrag*dt));b.p=add(b.p,mul(b.v,dt));
  wallSphere(b,Math.max(.02,cfg.radius-b.r-.013),cfg.restitution);
 }
 // Sequential impulses plus positional depenetration.
 for(let i=0;i<world.balls.length;i++)for(let j=i+1;j<world.balls.length;j++){
  const a=world.balls[i],b=world.balls[j],delta=sub(b.p,a.p),dist=len(delta),minimum=a.r+b.r;
  if(dist>=minimum)continue;
  const normal=dist>1e-6?mul(delta,1/dist):[1,0,0],invA=1/a.mass,invB=1/b.mass,invSum=invA+invB;
  const penetration=minimum-dist+1e-4;
  a.p=sub(a.p,mul(normal,penetration*invA/invSum));b.p=add(b.p,mul(normal,penetration*invB/invSum));
  const toward=dot(sub(b.v,a.v),normal);
  if(toward<0){const impulse=-(1+cfg.restitution)*toward/invSum;a.v=sub(a.v,mul(normal,impulse*invA));b.v=add(b.v,mul(normal,impulse*invB));}
 }
 for(const b of world.balls)wallSphere(b,Math.max(.02,cfg.radius-b.r-.013),cfg.restitution);
 const smoke=world.smoke, wind=[cfg.windX,cfg.windY,cfg.windZ];
 for(let i=0;i<smoke.length;i++){
  const p=smoke[i];p.age+=dt;
  if(p.age>p.life){const spawned=makeSmoke(world.rng,cfg.radius,0);const q=spherePoint(world.rng);spawned.p=[q[0]*cfg.radius*.4,-cfg.radius*(.5+world.rng()*.3),q[2]*cfg.radius*.4];smoke[i]=spawned;continue;}
  const [x,y,z]=p.p,t=world.t;
  const wave=[Math.sin(2.1*z+1.3*t)*Math.cos(2.3*y-t),Math.sin(1.7*x-1.1*t)*Math.cos(2*z+t),Math.cos(2*y+.7*t)*Math.sin(2.1*x-t)];
  const whirl=[-z*.42+Math.sin(y*3+t*.8)*.25,Math.cos(x*2.1+z*2-t)*.25,x*.42];
  let acc=add(add(mul(wave,cfg.turbulence),mul(whirl,cfg.vorticity)),add(wind,[0,cfg.buoyancy,0]));
  const retained=Math.exp(-dt/Math.max(.1,cfg.wakeLife));p.wake=mul(p.wake,retained);
  for(const b of world.balls){
   const offset=sub(p.p,b.p),dist=len(offset),extent=b.r+p.size*.35+cfg.pushRadius;
   const normal=dist>1e-7?mul(offset,1/dist):[0,1,0],ballSpeed=len(b.v);
   // Solid contact: sphere particles must never remain inside glass.
   const solid=b.r+p.size*.12;
   if(dist<solid){p.p=add(b.p,mul(normal,solid+0.002));const towards=dot(sub(p.v,b.v),normal);if(towards<0)p.v=add(p.v,mul(normal,-towards));}
   if(dist<extent){
    const proximity=(1-dist/extent)**2;
    acc=add(acc,mul(normal,cfg.push*proximity*16));
    const momentum=mul(b.v,cfg.transfer*proximity*10);
    acc=add(acc,momentum);
    p.wake=add(p.wake,mul(momentum,dt));
   }
   // Directional wake: trailing half-space, Gaussian sideways falloff.
   if(ballSpeed>.08){
    const axis=mul(b.v,1/ballSpeed),back=-dot(offset,axis);
    const lateral=sub(offset,mul(axis,dot(offset,axis))),spread=b.r*2.8+cfg.pushRadius;
    if(back>0&&back<spread*3.5){
     const amount=cfg.wake*Math.exp(-dot(lateral,lateral)/(spread*spread))*Math.exp(-back/(spread*2))*ballSpeed;
     const swirl=unit(cross(axis,add(lateral,[.004,.002,0])));
     const force=add(mul(axis,amount*3.1),mul(swirl,amount*1.8));
     acc=add(acc,force);p.wake=add(p.wake,mul(force,dt));
    }
   }
  }
  acc=add(acc,mul(p.wake,.6));
  p.v=mul(add(p.v,mul(acc,dt)),Math.exp(-cfg.smokeDrag*dt));
  const diffusion=cfg.diffusion*.024;
  p.v=add(p.v,mul(wave,diffusion*dt));
  p.p=add(p.p,mul(p.v,dt));
  wallSphere(p,Math.max(.08,cfg.radius-p.size*.2-.016),.14);
  // Resolve contact a second time after the particle has moved.
  for(const b of world.balls){const delta=sub(p.p,b.p),d=len(delta),limit=b.r+p.size*.1;if(d<limit){const n=d>1e-6?mul(delta,1/d):[0,1,0];p.p=add(b.p,mul(n,limit+.002));const vn=dot(sub(p.v,b.v),n);if(vn<0)p.v=add(p.v,mul(n,-vn));}}
 }
}
export function stir(world,intensity=1){
 for(const b of world.balls){const n=spherePoint(world.rng);b.v=add(b.v,mul(n,intensity*2));}
 for(const p of world.smoke){const n=spherePoint(world.rng);p.v=add(p.v,mul(n,intensity*1.5));}
}
export function testPhysics(){
 const cfg={...defaults,ballCount:1,smokeCount:1,radius:2,gravity:8,buoyancy:0,turbulence:0,vorticity:0,windX:0,windY:0,windZ:0};
 const fall=createWorld(cfg,1);fall.balls[0].p=[0,.5,0];fall.balls[0].v=[0,0,0];
 const upward=createWorld({...cfg,gravity:-8},1);upward.balls[0].p=[0,.5,0];upward.balls[0].v=[0,0,0];
 for(let i=0;i<35;i++){stepWorld(fall,cfg,1/60);stepWorld(upward,{...cfg,gravity:-8},1/60);}
 const gravityDelta=upward.balls[0].p[1]-fall.balls[0].p[1];
 const hit=createWorld(cfg,2);hit.balls[0].p=[0,0,0];hit.balls[0].v=[0,-2.5,0];
 hit.smoke[0].p=[.01,-.09,0];hit.smoke[0].v=[0,0,0];hit.smoke[0].age=0;hit.smoke[0].life=100;
 const startDistance=len(sub(hit.smoke[0].p,hit.balls[0].p));
 stepWorld(hit,cfg,1/60);
 const gap=len(sub(hit.smoke[0].p,hit.balls[0].p));
 const expected=hit.balls[0].r+hit.smoke[0].size*.1;
 const contained=fall.balls.every(b=>len(b.p)+b.r<=cfg.radius+.001);
 return {gravityDelta,smokeStartDistance:startDistance,smokeGap:gap,smokeClearance:expected,contained,passed:gravityDelta>.25&&gap>=expected-.003&&contained};
}
