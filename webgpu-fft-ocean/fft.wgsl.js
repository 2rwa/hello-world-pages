export function fftSource(resolution) {
 const logCount=Math.log2(resolution);
 return /* wgsl */ `
const N:u32=${resolution}u;
const LOGN:u32=${logCount}u;
const PI:f32=3.14159265;
const g:f32=9.81;
const tiles=array<f32,5>(2003.0,433.0,97.0,23.3,5.3);
struct Params {viewProj:mat4x4f,sim:vec4f,boat:vec4f,prior:vec4f,extra:vec4f,eye:vec4f};
struct Sample {h:vec2f,dx:vec2f,dz:vec2f};
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var<storage,read_write> frequency:array<Sample>;
@group(0) @binding(2) var<storage,read_write> rowData:array<Sample>;
@group(0) @binding(3) var displacementOut:texture_storage_2d_array<rgba16float,write>;
@group(0) @binding(4) var displacementIn:texture_2d_array<f32>;
@group(0) @binding(5) var normalOut:texture_storage_2d_array<rgba16float,write>;
@group(0) @binding(6) var normalIn:texture_2d_array<f32>;
fn hash32(v:u32)->u32{
 var t=v;
 t=(t^(t>>16u))*0x7feb352du;
 t=(t^(t>>15u))*0x846ca68bu;
 return t^(t>>16u);
}
fn rnd(v:u32)->f32{return f32(hash32(v))/4294967295.0;}
fn gauss(p:vec2u,salt:u32)->vec2f {
 let v=p.x*1973u+p.y*9277u+salt*26699u;
 let a=max(0.000001,rnd(v));
 let b=rnd(v^0x5bd1e995u);
 let mag=sqrt(-2.0*log(a));
 return mag*vec2f(cos(2.0*PI*b),sin(2.0*PI*b));
}
fn cmul(a:vec2f,b:vec2f)->vec2f {
 return vec2f(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);
}
fn spectrum(k:vec2f,layer:u32)->f32{
 let km=length(k);
 if(km<0.001){return 0.0;}
 let waveOmega=sqrt(g*km);
 let peakOmega=g/max(3.0,cfg.sim.z);
 let sigma=select(0.09,0.07,waveOmega<=peakOmega);
 let peakBoost=pow(3.3,exp(-0.5*pow((waveOmega-peakOmega)/(sigma*peakOmega),2.0)));
 let jonswap=0.0081*g*g*pow(waveOmega,-5.0)*exp(-1.25*pow(peakOmega/waveOmega,4.0))*peakBoost;
 let dk=2.0*PI/tiles[layer];
 let windVector=vec2f(cos(cfg.sim.w),sin(cfg.sim.w));
 let kdir=k/km;
 let windAlign=pow(max(dot(kdir,windVector),0.0),4.0);
 let dirSpread=0.12+1.8*windAlign;
 let swellPeak=exp(-0.5*pow((km-0.035)/0.015,2.0))*0.22
               *pow(max(dot(kdir,vec2f(0.82,0.57)),0.0),8.0);
 let density=jonswap*(0.5*g/waveOmega)/(2.0*PI*km)*dirSpread+swellPeak;
 let bounds=array<f32,6>(0.0,0.20,0.90,4.0,16.0,350.0);
 let lo=bounds[layer]; let hi=bounds[layer+1u];
 let blendIn=smoothstep(max(0.001,lo*0.8),max(0.002,lo*1.2),km);
 let blendOut=1.0-smoothstep(hi*0.8,hi*1.2,km);
 return max(0.0,density*blendIn*blendOut)*dk*dk;
}
fn ampAt(pixel:vec2u,layer:u32)->vec2f {
 let ix=select(i32(pixel.x),i32(pixel.x)-i32(N),pixel.x>=N/2u);
 let iy=select(i32(pixel.y),i32(pixel.y)-i32(N),pixel.y>=N/2u);
 let kval=vec2f(f32(ix),f32(iy))*2.0*PI/tiles[layer];
 let power=spectrum(kval,layer);
 return gauss(pixel,layer+11u)*sqrt(power*0.5);
}
@compute @workgroup_size(8,8,1)
fn evolve(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=N||id.y>=N||id.z>=5u){return;}
 let ix=select(i32(id.x),i32(id.x)-i32(N),id.x>=N/2u);
 let iz=select(i32(id.y),i32(id.y)-i32(N),id.y>=N/2u);
 let kval=vec2f(f32(ix),f32(iz))*2.0*PI/tiles[id.z];
 let km=length(kval);
 let own=ampAt(id.xy,id.z);
 let opposite=ampAt(vec2u((N-id.x)%N,(N-id.y)%N),id.z);
 let phase=sqrt(g*km)*cfg.sim.x;
 let rotating=vec2f(cos(phase),sin(phase));
 let h=cmul(own,rotating)+cmul(vec2f(opposite.x,-opposite.y),vec2f(rotating.x,-rotating.y));
 let tangent=select(vec2f(0.0),kval/max(0.0001,km),km>0.0001);
 let dx=cmul(h,vec2f(0.0,-tangent.x));
 let dz=cmul(h,vec2f(0.0,-tangent.y));
 frequency[id.z*N*N+id.y*N+id.x]=Sample(h,dx,dz);
}
var<workgroup> shH:array<vec2f,${resolution}>;
var<workgroup> shX:array<vec2f,${resolution}>;
var<workgroup> shZ:array<vec2f,${resolution}>;
fn loadFreq(layer:u32,along:u32,across:u32,column:bool)->Sample {
 let coord=select(vec2u(along,across),vec2u(across,along),column);
 let idx=layer*N*N+coord.y*N+coord.x;
 if(column){return rowData[idx];}
 return frequency[idx];
}
fn storeFreq(layer:u32,along:u32,across:u32,val:Sample,column:bool){
 let idx=layer*N*N+across*N+along;
 if(column){
  let worldIndex=vec2u(across,along);
  let scale=cfg.sim.y/(f32(N)*f32(N));
  textureStore(displacementOut,worldIndex,i32(layer),vec4f(
   val.h.x*scale,val.dx.x*scale,val.dz.x*scale,1.0));
 }else{rowData[idx]=val;}
}
fn butterfly(lane:u32,stage:u32){
 let half=1u<<(stage-1u);
 let width=half<<1u;
 let groupId=lane/half;
 let p=groupId*width+(lane%half);
 let q=p+half;
 let phi=2.0*PI*f32(lane%half)/f32(width);
 let w=vec2f(cos(phi),sin(phi));
 let ph=shH[p];let qh=cmul(shH[q],w);
 let px=shX[p];let qx=cmul(shX[q],w);
 let pz=shZ[p];let qz=cmul(shZ[q],w);
 shH[p]=ph+qh;shH[q]=ph-qh;
 shX[p]=px+qx;shX[q]=px-qx;
 shZ[p]=pz+qz;shZ[q]=pz-qz;
}
fn performFFT(lane:u32,across:u32,layer:u32,column:bool){
 for(var j:u32=0u;j<2u;j++){
  let ix=lane+j*256u;
  if(ix<N){
   let reversed=reverseBits(ix)>>(32u-LOGN);
   let inputValue=loadFreq(layer,reversed,across,column);
   shH[ix]=inputValue.h;shX[ix]=inputValue.dx;shZ[ix]=inputValue.dz;
  }
 }
 workgroupBarrier();
 for(var stage:u32=1u;stage<=LOGN;stage++){
  if(lane<N/2u){butterfly(lane,stage);}
  workgroupBarrier();
 }
 for(var j:u32=0u;j<2u;j++){
  let ix=lane+j*256u;
  if(ix<N){storeFreq(layer,ix,across,Sample(shH[ix],shX[ix],shZ[ix]),column);}
 }
}
@compute @workgroup_size(256,1,1)
fn fftRows(@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3u){
 performFFT(lane,group.y,group.z,false);
}
@compute @workgroup_size(256,1,1)
fn fftColumns(@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3u){
 performFFT(lane,group.y,group.z,true);
}
@compute @workgroup_size(8,8,1)
fn makeNormal(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=N||id.y>=N||id.z>=5u){return;}
 let xy=vec2i(id.xy);
 let lay=i32(id.z);
 let sx=tiles[id.z]/f32(N);
 let hR=textureLoad(displacementIn,(xy+vec2i(1,0)+i32(N))%i32(N),lay,0).xyz;
 let hL=textureLoad(displacementIn,(xy+vec2i(-1,0)+i32(N))%i32(N),lay,0).xyz;
 let hU=textureLoad(displacementIn,(xy+vec2i(0,1)+i32(N))%i32(N),lay,0).xyz;
 let hD=textureLoad(displacementIn,(xy+vec2i(0,-1)+i32(N))%i32(N),lay,0).xyz;
 let dh=vec2f(hR.x-hL.x,hU.x-hD.x)/(2.0*sx);
 let xx=(hR.y-hL.y)/(2.0*sx);
 let zz=(hU.z-hD.z)/(2.0*sx);
 let xz=(hU.y-hD.y)/(2.0*sx);
 let zx=(hR.z-hL.z)/(2.0*sx);
 let jac=(1.0+xx)*(1.0+zz)-xz*zx;
 textureStore(normalOut,xy,lay,vec4f(dh,dot(dh,dh),jac));
}
@compute @workgroup_size(8,8,1)
fn reduceMips(@builtin(global_invocation_id) id:vec3u){
 let size=textureDimensions(normalOut);
 if(id.x>=size.x||id.y>=size.y||id.z>=5u){return;}
 let base=vec2i(id.xy)*2;
 let layer=i32(id.z);
 let a=textureLoad(normalIn,base,layer,0);
 let b=textureLoad(normalIn,base+vec2i(1,0),layer,0);
 let c=textureLoad(normalIn,base+vec2i(0,1),layer,0);
 let d=textureLoad(normalIn,base+vec2i(1,1),layer,0);
 textureStore(normalOut,vec2i(id.xy),layer,(a+b+c+d)*0.25);
}
`;
}