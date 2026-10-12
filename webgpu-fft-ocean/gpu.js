import {fftSource} from './fft.wgsl.js';
import {foamWGSL} from './foam.wgsl.js';
import {renderWGSL} from './render.wgsl.js';
import {buoyWGSL} from './buoy.wgsl.js';
import {makeFrame} from './frame.js';
const U=GPUBufferUsage,T=GPUTextureUsage,S=GPUShaderStage;
export async function createOcean(canvas,resolution,ci,report) {
 if(!navigator.gpu)throw Error('WebGPUが利用できません。HTTPS / 対応ブラウザを確認してください');
 report('request-adapter');
 const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter)throw Error('WebGPU adapter が見つかりません');
 if(adapter.limits.maxComputeInvocationsPerWorkgroup<256||adapter.limits.maxComputeWorkgroupStorageSize<resolution*24)
 throw Error('FFT に必要な workgroup 上限が不足しています');
 report('request-device');
 const device=await adapter.requestDevice();
 device.lost.then(x=>report('DEVICE LOST: '+x.reason+' '+x.message));
 device.addEventListener('uncapturederror',e=>report('WEBGPU ERROR: '+e.error.message));
 const format=ci?'rgba8unorm':navigator.gpu.getPreferredCanvasFormat();
 const context=ci?null:canvas.getContext('webgpu');
 if(context)context.configure({device,format,alphaMode:'opaque'});
 const cb={type:'uniform'},rw={type:'storage'};
 const sampledArr={viewDimension:'2d-array'};
 const storageArr={access:'write-only',format:'rgba16float',viewDimension:'2d-array'};
 const sampled2={viewDimension:'2d'};
 const storage2={access:'write-only',format:'rgba16float',viewDimension:'2d'};
 const bgLayout=items=>device.createBindGroupLayout({entries:items.map(([binding,visibility,resource])=>({binding,visibility,...resource}))});
 const fftBGL=bgLayout([[0,S.COMPUTE,{buffer:cb}],[1,S.COMPUTE,{buffer:rw}],[2,S.COMPUTE,{buffer:rw}],
 [3,S.COMPUTE,{storageTexture:storageArr}],[4,S.COMPUTE,{texture:sampledArr}],
 [5,S.COMPUTE,{storageTexture:storageArr}],[6,S.COMPUTE,{texture:sampledArr}]]);
 const foamBGL=bgLayout([[0,S.COMPUTE,{buffer:cb}],[1,S.COMPUTE,{texture:sampled2}],
 [2,S.COMPUTE,{storageTexture:storage2}],[3,S.COMPUTE,{buffer:cb}],
 [4,S.COMPUTE,{texture:sampledArr}],[5,S.COMPUTE,{sampler:{type:'filtering'}}]]);
 const renderBGL=bgLayout([[0,S.VERTEX|S.FRAGMENT,{buffer:cb}],
 [1,S.VERTEX|S.FRAGMENT,{texture:sampledArr}],[2,S.FRAGMENT,{texture:sampledArr}],
 [3,S.FRAGMENT,{texture:sampled2}],[4,S.FRAGMENT,{texture:sampled2}],
 [5,S.VERTEX|S.FRAGMENT,{sampler:{type:'filtering'}}]]);
 const buoyBGL=bgLayout([[0,S.COMPUTE,{buffer:cb}],[1,S.COMPUTE,{texture:sampledArr}],[2,S.COMPUTE,{buffer:rw}]]);
 const layoutOf=bgl=>device.createPipelineLayout({bindGroupLayouts:[bgl]});
 const storageSize=resolution*resolution*5*24;
 const frequency=device.createBuffer({size:storageSize,usage:U.STORAGE});
 const rowData=device.createBuffer({size:storageSize,usage:U.STORAGE});
 const uniform=device.createBuffer({size:144,usage:U.UNIFORM|U.COPY_DST});
 const clipBuffers=[0,1].map(()=>device.createBuffer({size:16,usage:U.UNIFORM|U.COPY_DST}));
 const dispTex=device.createTexture({size:[resolution,resolution,5],format:'rgba16float',usage:T.STORAGE_BINDING|T.TEXTURE_BINDING});
 const numMips=Math.log2(resolution)+1;
 const normTex=device.createTexture({size:[resolution,resolution,5],format:'rgba16float',mipLevelCount:numMips,usage:T.STORAGE_BINDING|T.TEXTURE_BINDING});
 const dispView=dispTex.createView({dimension:'2d-array'});
 const normalView=normTex.createView({dimension:'2d-array'});
 const sampler=device.createSampler({magFilter:'linear',minFilter:'linear',mipmapFilter:'linear',addressModeU:'repeat',addressModeV:'repeat'});
 const fv=resolution>=512?512:256;
 const clips=[420,3200].map(meters=>({meters,center:[0,0],views:Array.from({length:2},()=>device.createTexture({
 size:[fv,fv],format:'rgba16float',usage:T.STORAGE_BINDING|T.TEXTURE_BINDING
 })),index:0}));
 report('shader-compilation-info');
 async function shaderModule(source,title){
  const mod=device.createShaderModule({code:source,label:title});
  const info=await mod.getCompilationInfo();
  const errors=info.messages.filter(x=>x.type==='error');
  if(errors.length)throw Error(title+' WGSL: '+errors.map(x=>x.lineNum+':'+x.linePos+' '+x.message).join(' | '));
  return mod;
 }
 const grid=ci?72:(resolution>=512?192:144);
 const [fftMod,foamMod,renderMod,buoyMod]=await Promise.all([
 shaderModule(fftSource(resolution),'FFT'),shaderModule(foamWGSL,'Foam'),
 shaderModule(renderWGSL(grid),'Render'),shaderModule(buoyWGSL,'Buoyancy')]);
 report('create-pipeline');
 async function cp(mod,layout,entryPoint){return device.createComputePipelineAsync({layout,compute:{module:mod,entryPoint}});}
 const fftLayout=layoutOf(fftBGL),foamLayout=layoutOf(foamBGL),renderLayout=layoutOf(renderBGL),buoyLayout=layoutOf(buoyBGL);
 const [evolve,rows,columns,normals,mip,foamPipe,buoyPipe]=await Promise.all([
 cp(fftMod,fftLayout,'evolve'),cp(fftMod,fftLayout,'fftRows'),cp(fftMod,fftLayout,'fftColumns'),
 cp(fftMod,fftLayout,'makeNormal'),cp(fftMod,fftLayout,'reduceMips'),
 cp(foamMod,foamLayout,'advance'),cp(buoyMod,buoyLayout,'probe')]);
 const rp=(vert,frag,depthWrite)=>device.createRenderPipelineAsync({layout:renderLayout,
 vertex:{module:renderMod,entryPoint:vert},fragment:{module:renderMod,entryPoint:frag,targets:[{format}]},
 primitive:{topology:'triangle-list'},depthStencil:{format:'depth24plus',depthWriteEnabled:depthWrite,depthCompare:depthWrite?'less':'always'}});
 const [skyPipe,oceanPipe,ballPipe]=await Promise.all([
 rp('vertexSky','fragmentSky',false),rp('vertexOcean','fragmentOcean',true),rp('vertexBall','fragmentBall',true)]);
 const buoyBuffer=device.createBuffer({size:128,usage:U.STORAGE|U.COPY_SRC});
 const buoyRead=device.createBuffer({size:128,usage:U.MAP_READ|U.COPY_DST});
 const entry=(binding,resource)=>({binding,resource});
 const buffer=b=>({buffer:b});
 function fftGroup(readMip=0,writeMip=0) {
 return device.createBindGroup({layout:fftBGL,entries:[
 entry(0,buffer(uniform)),entry(1,buffer(frequency)),entry(2,buffer(rowData)),
 entry(3,dispView),entry(4,dispView),
 entry(5,normTex.createView({dimension:'2d-array',baseMipLevel:writeMip,mipLevelCount:1})),
 entry(6,normTex.createView({dimension:'2d-array',baseMipLevel:readMip,mipLevelCount:1}))
 ]});}
 const baseGroup=fftGroup();
 const mipGroups=Array.from({length:numMips-1},(_,l)=>fftGroup(l,l+1));
 const buoyGroup=device.createBindGroup({layout:buoyBGL,entries:[
 entry(0,buffer(uniform)),entry(1,dispView),entry(2,buffer(buoyBuffer))]});
 const state={device,canvas,context,format,resolution,ci,report,dim:{w:0,h:0},
 uniform,clipBuffers,dispView,normalView,sampler,clips,fv,grid,numMips,
 entry,buffer,foamBGL,renderBGL,baseGroup,mipGroups,buoyGroup,
 evolve,rows,columns,normals,mip,foamPipe,buoyPipe,skyPipe,oceanPipe,ballPipe,buoyRead,buoyBuffer,
 depth:null,offscreen:null,offscreenRead:null,boatHeight:0,probes:0,pending:false,frame:0};
 return makeFrame(state);
}
