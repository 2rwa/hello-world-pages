function rng(a,b){return a+Math.random()*(b-a)}
export function resetBodies(settings,palette){
  const created=[];
  const opaqueCount=settings.opaque;
  const targetCount=opaqueCount+settings.glass;
  for(let i=0;i<targetCount;i++){
    const glass=i>=opaqueCount;
    // More numerous, smaller droplets make the merged glass surface readable.
    const radius=glass?rng(.18,.29):rng(.30,.40);
    let pos=[0,0,0],accepted=false;
    for(let attempt=0;attempt<800;attempt++){
      pos=[rng(-1.83,1.83),rng(-1.83,1.83),rng(-1.83,1.83)];
      if(Math.hypot(...pos)>2.36-radius)continue;
      // Glass/glass is intentionally allowed to overlap: it is one liquid surface.
      // All pairs involving an opaque bead remain collision-free at initialization.
      if(created.every(b=> glass&&b.glass || Math.hypot(...pos.map((v,k)=>v-b.pos[k]))>=radius+b.radius+.08+.25*settings.blend)){
        accepted=true;break;
      }
    }
    if(!accepted)continue;
    created.push({pos,vel:[rng(-1.25,1.25),rng(-.85,1.30),rng(-1.25,1.25)],
      radius,glass,color:glass?[.61,.91,.99]:palette[i%palette.length],mass:radius**3});
  }
  return created;
}
// Only opaque/opaque and opaque/glass pairs collide. Glass/glass are fluid lobes.
export function simulateBodies(bodies,dt,blendWidth){
  if(!dt)return;
  for(const b of bodies){
    b.vel[1]-=.63*dt;
    for(let k=0;k<3;k++) b.pos[k]+=b.vel[k]*dt;
    const length=Math.hypot(...b.pos), limit=2.40-b.radius-.022;
    if(length>limit){
      const n=b.pos.map(v=>v/length);
      for(let k=0;k<3;k++)b.pos[k]=n[k]*limit;
      const dot=b.vel.reduce((s,v,k)=>s+v*n[k],0);
      if(dot>0)for(let k=0;k<3;k++)b.vel[k]-=1.94*dot*n[k];
    }
  }
  for(let pass=0;pass<4;pass++) for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
    const a=bodies[i],b=bodies[j];
    if(a.glass && b.glass)continue;
    const dx=b.pos.map((v,k)=>v-a.pos[k]);
    let dist=Math.hypot(...dx);const minDist=a.radius+b.radius+(a.glass!==b.glass?.08+.25*blendWidth:.008);
    if(dist>=minDist)continue;
    if(dist<.0001){dx[0]=1;dist=1;}
    const n=dx.map(v=>v/dist), invA=1/a.mass,invB=1/b.mass, sum=invA+invB;
    const penetration=minDist-dist;
    for(let k=0;k<3;k++){
      a.pos[k]-=n[k]*penetration*(invA/sum);
      b.pos[k]+=n[k]*penetration*(invB/sum);
    }
    const relative=n.reduce((s,v,k)=>s+(b.vel[k]-a.vel[k])*v,0);
    if(relative<0){
      const impulse=-(1+.94)*relative/sum;
      for(let k=0;k<3;k++){
        a.vel[k]-=impulse*invA*n[k]; b.vel[k]+=impulse*invB*n[k];
      }
    }
  }
}
