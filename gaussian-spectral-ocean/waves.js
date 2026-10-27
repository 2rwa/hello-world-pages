// Gaussian spectral ocean: deterministic wave packets sampled in frequency space.
export const BAND_LENGTHS=[2400,610,148,35,8];
export const PACKETS_PER_BAND=18;
export const COMPUTE_RES=192;
export function createPackets(windAngle=0.25){
  let seed=0x12345421;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Spatially varying Gaussian envelopes, frequency vectors from Gaussian lobes.
  const energy=[0.78,0.52,0.27,0.10,0.032];
  const cycles=[10,9,9,10,10];
  const data=new Float32Array(5*PACKETS_PER_BAND*12);
  for(let band=0;band<5;band++){
    const length=BAND_LENGTHS[band];
    for(let i=0;i<PACKETS_PER_BAND;i++){
      const start=(band*PACKETS_PER_BAND+i)*12;
      const u1=Math.max(rand(),1e-6),u2=rand();
      const gaussian=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
      const direction=windAngle+gaussian*(band<2?0.32:0.48)+(rand()<0.12?1.1:0.0);
      const frequency=Math.max(3,cycles[band]+Math.sqrt(-2*Math.log(Math.max(rand(),1e-6)))*Math.cos(2*Math.PI*rand())*2.1);
      let nx=Math.round(Math.cos(direction)*frequency),nz=Math.round(Math.sin(direction)*frequency);
      if(nx===0&&nz===0)nx=1;
      const kx=nx*2*Math.PI/length,kz=nz*2*Math.PI/length;
      const km=Math.hypot(kx,kz),omega=Math.sqrt(9.81*km);
      const groupSpeed=0.5*Math.sqrt(9.81/km);
      data[start]=rand()*length;
      data[start+1]=rand()*length;
      data[start+2]=length*(0.23+rand()*0.14);
      data[start+3]=energy[band]*(0.68+rand()*0.65);
      data[start+4]=kx;
      data[start+5]=kz;
      data[start+6]=rand()*Math.PI*2;
      data[start+7]=omega;
      data[start+8]=kx/km*groupSpeed;
      data[start+9]=kz/km*groupSpeed;
      data[start+10]=band;
      data[start+11]=0;
    }
  }
  return data;
}
export function makeViewProjection(eye,height,pitch,yaw,aspect){
  const vForward=[Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
  const destination=[eye[0]+vForward[0],eye[1]+vForward[1],eye[2]+vForward[2]];
  const normalize=a=>{const n=Math.hypot(...a);return a.map(z=>z/n);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const backward=normalize([eye[0]-destination[0],eye[1]-destination[1],eye[2]-destination[2]]);
  const right=normalize(cross([0,1,0],backward));
  const up=cross(backward,right);
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const view=new Float32Array([
    right[0],up[0],backward[0],0,
    right[1],up[1],backward[1],0,
    right[2],up[2],backward[2],0,
    -dot(right,eye),-dot(up,eye),-dot(backward,eye),1
  ]);
  const near=0.12,far=5100,f=1/Math.tan(Math.PI/6.0);
  const proj=new Float32Array(16);
  proj[0]=f/aspect;proj[5]=f;proj[10]=far/(near-far);
  proj[11]=-1;proj[14]=far*near/(near-far);
  const vp=new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)
    for(let k=0;k<4;k++)vp[c*4+r]+=proj[k*4+r]*view[c*4+k];
  return vp;
}
