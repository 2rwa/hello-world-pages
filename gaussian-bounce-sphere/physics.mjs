export const MAX_PARTICLES=100;
export const stride=8;
export const bound=(v,a,b)=>Math.min(b,Math.max(a,v));
const vecLen=(x,y,z)=>Math.hypot(x,y,z);
export class Simulation {
  constructor(settings,random=Math.random){this.s=settings;this.random=random;this.data=new Float32Array(MAX_PARTICLES*stride);this.seedSize=new Float32Array(MAX_PARTICLES);this.phase=new Float32Array(MAX_PARTICLES);this.ripples=[];this.elapsed=0;this.collisions=0;this.reset();}
  range(low,high){return low+this.random()*(high-low);}
  unit(){let x,y,z,d;do{x=this.range(-1,1);y=this.range(-1,1);z=this.range(-1,1);d=vecLen(x,y,z);}while(d<.001||d>1);return [x/d,y/d,z/d];}
  radius(sig){return bound(sig*Math.sqrt(Math.max(.05,2*Math.log(Math.max(.05,this.s.amplitude)/Math.max(.03,this.s.threshold)))),.045,.38);}
  reset(){this.ripples=[];this.elapsed=0;this.collisions=0;for(let i=0;i<MAX_PARTICLES;i++){
    const b=i*stride;let x,y,z,d;do{x=this.range(-.68,.68);y=this.range(-.68,.68);z=this.range(-.68,.68);d=vecLen(x,y,z);}while(d>.7);
    const v=this.unit(),speed=this.range(.18,.58);this.seedSize[i]=this.range(.78,1.2);this.phase[i]=this.range(0,Math.PI*2);
    this.data[b]=x;this.data[b+1]=y;this.data[b+2]=z;this.data[b+3]=this.s.sigma*this.seedSize[i];
    this.data[b+4]=v[0]*speed;this.data[b+5]=v[1]*speed;this.data[b+6]=v[2]*speed;this.data[b+7]=0;
  }}
  burst(){for(let i=0;i<this.s.count;i++){let b=i*stride,v=this.unit(),mag=this.range(.3,.8);for(let k=0;k<3;k++)this.data[b+4+k]+=mag*v[k];this.data[b+7]=1;}}
  emitRipple(x,y,z,energy){const r=Math.max(.01,vecLen(x,y,z));this.ripples.push({x:x/r,y:y/r,z:z/r,life:0,energy:bound(energy,.1,2)});if(this.ripples.length>8)this.ripples.shift();}
  physicalPairs(dt){const n=this.s.count, arr=this.data, rep=this.s.repulsion,att=this.s.attraction,cell=.52;
    const grid=new Map();let tested=0;
    if(this.s.spatial==='on'){
      for(let i=0;i<n;i++){const b=i*stride,key=[0,1,2].map(k=>Math.floor((arr[b+k]+1.5)/cell)).join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);}
    }
    const pair=(i,j)=>{tested++;const bi=i*stride,bj=j*stride;
      let dx=arr[bi]-arr[bj],dy=arr[bi+1]-arr[bj+1],dz=arr[bi+2]-arr[bj+2];let d2=dx*dx+dy*dy+dz*dz;
      if(d2<1e-9){dx=1e-4;dy=0;dz=0;d2=dx*dx;}
      const near=(arr[bi+3]+arr[bj+3])*1.75;
      if(d2>near*near*2.5)return;
      const d=Math.sqrt(d2),fall=bound(1-d/near,0,1),pull=bound((d-near)/near,0,1);
      const force=(rep*10*fall*fall-att*1.5*pull)*dt;const nx=dx/d,ny=dy/d,nz=dz/d;
      arr[bi+4]+=nx*force;arr[bi+5]+=ny*force;arr[bi+6]+=nz*force;
      arr[bj+4]-=nx*force;arr[bj+5]-=ny*force;arr[bj+6]-=nz*force;
      if(fall>.2){const e=fall*this.s.collisionGlow*.65;arr[bi+7]=Math.max(arr[bi+7],e);arr[bj+7]=Math.max(arr[bj+7],e);}
    };
    if(this.s.spatial!=='on'){for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)pair(i,j);}
    else for(let i=0;i<n;i++){
      const bi=i*stride,cx=Math.floor((arr[bi]+1.5)/cell),cy=Math.floor((arr[bi+1]+1.5)/cell),cz=Math.floor((arr[bi+2]+1.5)/cell);
      for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){
        const members=grid.get([cx+dx,cy+dy,cz+dz].join(','));if(members)for(const j of members)if(j>i)pair(i,j);
      }
    }
    this.candidatePairs=tested;
  }
  step(dt){this.elapsed+=dt;const a=this.data,s=this.s,n=Math.min(MAX_PARTICLES,s.count),damp=Math.pow(1-s.damping,dt*120);
    this.physicalPairs(dt);
    for(let i=0;i<n;i++){
      const b=i*stride;const targetSigma=s.sigma*this.seedSize[i]*(1+s.pulse*.14*Math.sin(this.elapsed*3+this.phase[i]));
      a[b+3]+=(targetSigma-a[b+3])*Math.min(1,dt*10);
      const t=this.elapsed*1.71+i*5.17;
      a[b+4]+=Math.sin(t*1.3)*s.turbulence*dt*.55;
      a[b+5]+=(s.gravity+Math.cos(t*.7)*s.turbulence*.55)*dt;
      a[b+6]+=Math.sin(t*.9+2)*s.turbulence*dt*.55;
      for(let k=4;k<7;k++)a[b+k]*=damp;
      const speed=vecLen(a[b+4],a[b+5],a[b+6]);if(speed>2.5){for(let k=4;k<7;k++)a[b+k]*=2.5/speed;}
      const moveSpeed=s.speed;
      for(let k=0;k<3;k++)a[b+k]+=a[b+k+4]*dt*moveSpeed;
      const x=a[b],y=a[b+1],z=a[b+2];const len=vecLen(x,y,z);
      const wallR=1-this.radius(a[b+3])*.87-.012;
      if(len>wallR){const nx=x/len,ny=y/len,nz=z/len;
        a[b]=nx*wallR;a[b+1]=ny*wallR;a[b+2]=nz*wallR;
        const dot=a[b+4]*nx+a[b+5]*ny+a[b+6]*nz;
        if(dot>0){const friction=1-s.wallFriction;
          a[b+4]=(a[b+4]-(1+s.bounce)*dot*nx)*friction;
          a[b+5]=(a[b+5]-(1+s.bounce)*dot*ny)*friction;
          a[b+6]=(a[b+6]-(1+s.bounce)*dot*nz)*friction;
          this.emitRipple(nx,ny,nz,Math.max(.2,dot));a[b+7]=Math.max(a[b+7],s.collisionGlow);this.collisions++;
        }
      }
      a[b+7]*=Math.exp(-dt*4.3);
    }
    this.ripples=this.ripples.filter(r=>(r.life+=dt)<3.8);
  }
  validateBounds(){for(let i=0;i<this.s.count;i++){const b=i*stride,r=Math.hypot(this.data[b],this.data[b+1],this.data[b+2]);if(!Number.isFinite(r)||r>1.001)throw Error(`particle ${i} outside sphere: ${r}`);}return true;}
  gpuRipples(){const out=new Float32Array(8*8);for(let i=0;i<this.ripples.length;i++){const r=this.ripples[i],b=i*8;out.set([r.x,r.y,r.z,r.life,r.energy,0,0,0],b);}return out;}
}
