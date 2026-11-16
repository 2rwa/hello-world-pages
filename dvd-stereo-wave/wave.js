export const N=128,W=24;
const TAU=2*Math.PI;
const shader=`
struct PassParams { axisIndex:u32, inverseFlag:u32, gridSize:u32, unusedPad:u32 }
@group(0) @binding(0) var<storage,read> inputField:array<vec2<f32>>;
@group(0) @binding(1) var<storage,read_write> outputField:array<vec2<f32>>;
@group(0) @binding(2) var<uniform> passParams:PassParams;
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) invocationId:vec3<u32>) {
 let gridSize=passParams.gridSize;
 let pixelX=invocationId.x;
 let pixelY=invocationId.y;
 if(pixelX>=gridSize || pixelY>=gridSize){return;}
 let freqIndex=select(pixelX,pixelY,passParams.axisIndex==1u);
 let phaseSign=select(-1.0,1.0,passParams.inverseFlag==1u);
 var fieldSum=vec2<f32>(0.0);
 for(var sampleIndex=0u;sampleIndex<gridSize;sampleIndex+=1u){
  let sourceIndex=select(pixelY*gridSize+sampleIndex,sampleIndex*gridSize+pixelX,passParams.axisIndex==1u);
  let wrappedIndex=(sampleIndex*freqIndex)%gridSize;
  let phaseValue=phaseSign*6.283185307179586*f32(wrappedIndex)/f32(gridSize);
  let waveVec=vec2<f32>(cos(phaseValue),sin(phaseValue));
  let sourceVec=inputField[sourceIndex];
  fieldSum+=vec2<f32>(sourceVec.x*waveVec.x-sourceVec.y*waveVec.y,sourceVec.x*waveVec.y+sourceVec.y*waveVec.x);
 }
 outputField[pixelY*gridSize+pixelX]=fieldSum*inverseSqrt(f32(gridSize));
}
`;
export class WaveGPU{
 static async create(status){
  status('request-adapter');if(!navigator.gpu)throw Error('WebGPU unavailable; use HTTPS/localhost and a supported browser');
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('no WebGPU adapter');
  status('request-device');const device=await adapter.requestDevice();
  status('shader-compilation-info');const module=device.createShaderModule({code:shader});const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>m.message).join('\n'));
  status('create-pipeline');device.pushErrorScope('validation');let pipeline;
  try{pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});}finally{const err=await device.popErrorScope();if(err)throw Error(err.message);}
  return new WaveGPU(device,pipeline);
 }
 constructor(device,pipeline){this.device=device;this.pipeline=pipeline;this.pending=false;}
 async transform(values,inverse){
  if(this.pending)throw Error('overlapping GPU map');this.pending=true;
  const d=this.device,bytes=N*N*8,bufs=[];let scope=false,mapped=false,readback;
  const make=(size,usage)=>{const b=d.createBuffer({size,usage});bufs.push(b);return b;};
  try{
   d.pushErrorScope('validation');scope=true;
   const usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC;
   const a=make(bytes,usage),b=make(bytes,usage),c=make(bytes,usage);
   readback=make(bytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
   d.queue.writeBuffer(a,0,values);
   const enc=d.createCommandEncoder();
   for(let axis=0;axis<2;axis++){
    const params=make(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    d.queue.writeBuffer(params,0,new Uint32Array([axis,inverse?1:0,N,0]));
    const group=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:axis?b:a}},{binding:1,resource:{buffer:axis?c:b}},{binding:2,resource:{buffer:params}}]});
    const pass=enc.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(N/8,N/8);pass.end();
   }
   enc.copyBufferToBuffer(c,0,readback,0,bytes);d.queue.submit([enc.finish()]);
   await d.queue.onSubmittedWorkDone();await readback.mapAsync(GPUMapMode.READ);mapped=true;
   const output=new Float32Array(readback.getMappedRange().slice(0));readback.unmap();mapped=false;
   scope=false;const error=await d.popErrorScope();if(error)throw Error(error.message);
   return output;
  }finally{if(mapped)readback.unmap();if(scope)await d.popErrorScope();for(const b of bufs)b.destroy();this.pending=false;}
 }
}
export function centres(p){return [N/2+p.offset-p.sep/2,N/2+p.offset+p.sep/2];}
function wrap(x){return (x+N)%N;}
function index(cx,x,y){return wrap(N/2-W/2+y-N/2)*N+wrap(cx-W/2+x-N/2);}
function image(shift){
 const a=new Float32Array(W*W);
 for(let y=0;y<W;y++)for(let x=0;x<W;x++){
  // Fixed background ring, closer solid object shifts oppositely between views.
  const dx=x-(W-1)/2,dy=y-(W-1)/2,r=Math.hypot(dx,dy);
  let v=r>8&&r<10.2?.5:0;
  if(Math.hypot(dx-shift/2,dy-1.5)<3.4)v=1;
  // Asymmetric depth cue: small upper-left background dot.
  if(Math.hypot(dx+5,dy+4)<1.7)v=.7;
  a[y*W+x]=v;
 }
 return a;
}
function hash(i){let h=Math.imul(i+1,0x9e3779b1);h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;return (h>>>0)/4294967296;}
export function targets(p){
 const cs=centres(p),images=[image(p.disparity),image(-p.disparity)],left=new Float32Array(N*N*2),right=new Float32Array(N*N*2);
 for(let v=0;v<2;v++){
  const data=v?right:left;
  for(let y=0;y<W;y++)for(let x=0;x<W;x++){
   const a=Math.sqrt(images[v][y*W+x]),j=index(cs[v],x,y)*2,ph=TAU*hash(v*W*W+y*W+x);
   data[j]=a*Math.cos(ph);data[j+1]=a*Math.sin(ph);
  }
 }
 return {images,left,right,both:left.map((x,i)=>x+right[i])};
}
export function quantize(raw,mode){
 const out=new Float32Array(raw.length);let peak=0;
 for(let i=0;i<raw.length;i+=2)peak=Math.max(peak,Math.hypot(raw[i],raw[i+1]));
 for(let i=0;i<raw.length;i+=2){
  let re=raw[i],im=raw[i+1];
  if(mode==='complex'){out[i]=re/Math.max(peak,1e-30);out[i+1]=im/Math.max(peak,1e-30);}
  else if(mode==='binary'){out[i]=re>=0?1:0;}
  else{let ph=Math.atan2(im,re);if(mode==='phase4')ph=Math.round(ph/(Math.PI/2))*Math.PI/2;out[i]=Math.cos(ph);out[i+1]=Math.sin(ph);}
 }
 return out;
}
export function intensity(field){const p=new Float32Array(field.length/2);for(let i=0;i<p.length;i++)p[i]=field[2*i]**2+field[2*i+1]**2;return p;}
export function windowEnergy(power,cx){let s=0;for(let y=0;y<W;y++)for(let x=0;x<W;x++)s+=power[index(cx,x,y)];return s;}
export function similarity(power,cx,target){let dot=0,a=0,b=0;for(let y=0;y<W;y++)for(let x=0;x<W;x++){const p=power[index(cx,x,y)],t=target[y*W+x];dot+=p*t;a+=p*p;b+=t*t;}return dot/Math.sqrt(Math.max(a*b,1e-30));}
export function geometry(p){
 const aperture=N*p.pitch/1000,bin=p.lambda/1e6/aperture,angles=centres(p).map(c=>Math.asin((c-N/2)*bin));
 return {aperture,binMrad:bin*1000,angles:angles.map(x=>x*180/Math.PI),separation:p.distance*1000*(Math.tan(angles[1])-Math.tan(angles[0]))};
}
