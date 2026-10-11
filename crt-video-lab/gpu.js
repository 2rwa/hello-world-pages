import {makeVideoFallback} from './video-fallback.js';
// WebGPU multi-pass renderer. Same pipelines for Pages and CI; only the output target differs.
export async function createRenderer(canvas, video, onStatus = () => {}) {
if (!navigator.gpu) throw new Error('このブラウザはWebGPUに対応していません');
const offline = new URLSearchParams(location.search).get('ci') === '1';
onStatus('request-adapter');
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error('WebGPU adapterを取得できません');
onStatus('request-device');
const device = await adapter.requestDevice();
device.lost.then(info => onStatus('device-lost: ' + info.reason + ' ' + info.message));
const format = offline ? 'rgba8unorm' : navigator.gpu.getPreferredCanvasFormat();
const context = offline ? null : canvas.getContext('webgpu');
if (!offline && !context) throw new Error('WebGPU canvas contextを取得できません');
const shaderPaths = ['input.wgsl','blur.wgsl','screen.wgsl'];
const shaderTexts = await Promise.all(shaderPaths.map(async path => {
const response = await fetch('./' + path);
if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
return response.text();
}));
const shaderModules = shaderTexts.map((code,i) => device.createShaderModule({label:shaderPaths[i],code}));
onStatus('shader-compilation-info');
for (let i=0;i<shaderModules.length;i++) {
const info = await shaderModules[i].getCompilationInfo();
const errors = info.messages.filter(message => message.type === 'error');
if (errors.length) throw new Error(shaderPaths[i] + ' : ' + errors.map(e=>e.lineNum+':'+e.message).join('\n'));
}
const paramsBuffer = device.createBuffer({size:144,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
const xBlurBuffer = device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
const yBlurBuffer = device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
const fallback=makeVideoFallback(device,offline);
const sampler = device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
device.pushErrorScope('validation');
onStatus('create-pipeline');
const inputPipeline = device.createRenderPipeline({
layout:'auto',vertex:{module:shaderModules[0],entryPoint:'vsMain'},
fragment:{module:shaderModules[0],entryPoint:'fsMain',targets:[{format:'rgba8unorm'},{format:'rgba8unorm'}]},
primitive:{topology:'triangle-list'}
});
const blurPipeline = device.createRenderPipeline({
layout:'auto',vertex:{module:shaderModules[1],entryPoint:'vsMain'},
fragment:{module:shaderModules[1],entryPoint:'fsMain',targets:[{format:'rgba8unorm'}]},
primitive:{topology:'triangle-list'}
});
const screenPipeline = device.createRenderPipeline({
layout:'auto',vertex:{module:shaderModules[2],entryPoint:'vsMain'},
fragment:{module:shaderModules[2],entryPoint:'fsMain',targets:[{format},{format:'rgba8unorm'}]},
primitive:{topology:'triangle-list'}
});
const initError = await device.popErrorScope();
if (initError) throw new Error('Pipeline validation: ' + initError.message);
let width=0, height=0, surfaces=[], presentTexture=null, historyIndex=0;
let frameCount=0, lastFault='', disposed=false;
function newTexture(label) {
return device.createTexture({label,size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
}
function resize(targetWidth,targetHeight) {
const sideMax=Math.min(device.limits.maxTextureDimension2D,3840);
const nextWidth=Math.max(2,Math.min(sideMax,Math.round(targetWidth)));
const nextHeight=Math.max(2,Math.min(sideMax,Math.round(targetHeight)));
if (width===nextWidth && height===nextHeight) return false;
for(const texture of surfaces) texture.destroy();
if(presentTexture) presentTexture.destroy();
width=nextWidth;height=nextHeight;canvas.width=width;canvas.height=height;
if (context) context.configure({device,format,alphaMode:'opaque'});
surfaces=['scene','clean','blurX','blurY','memoryA','memoryB'].map(newTexture);
presentTexture=offline?newTexture('offscreen-present'):null;
historyIndex=0;
return true;
}
function render(config) {
if (disposed || video.readyState < 2 || video.videoWidth < 1) return false;
const isQuarterTurn=config.rotation===1||config.rotation===3;
const renderWidth=isQuarterTurn?video.videoHeight:video.videoWidth;
const renderHeight=isQuarterTurn?video.videoWidth:video.videoHeight;
resize(renderWidth*config.quality,renderHeight*config.quality);
const p=new Float32Array([
width,height,video.videoWidth,video.videoHeight,
config.scanline,config.mask,config.curve,config.bloom,
config.aberration,config.noise,config.jitter,config.ghost,
config.chroma,config.interference,config.persistence,video.currentTime,
config.brightness,config.contrast,config.saturation,config.gamma,
config.maskSize,config.maskType,config.scanCount,config.overscan,
config.bloomRadius,config.vignette,config.beamWidth,config.flicker,
config.compare,config.mirror||0,config.tracking||0,config.interlace||0,
config.rotation||0,0,0,0
]);
device.queue.writeBuffer(paramsBuffer,0,p);
device.queue.writeBuffer(xBlurBuffer,0,new Float32Array([1/width,0,config.bloomRadius,0]));
device.queue.writeBuffer(yBlurBuffer,0,new Float32Array([0,1/height,config.bloomRadius,0]));
device.pushErrorScope('validation');
const encoder=device.createCommandEncoder();
let videoTexture;
try{videoTexture=device.importExternalTexture({source:video});}
catch(error){videoTexture=fallback.getView(video);if(frameCount===0)onStatus('video-texture-fallback');}
const videoGroup=device.createBindGroup({layout:inputPipeline.getBindGroupLayout(0),entries:[
{binding:0,resource:{buffer:paramsBuffer}},
{binding:1,resource:sampler},
{binding:2,resource:videoTexture}
]});
let pass=encoder.beginRenderPass({colorAttachments:[
{view:surfaces[0].createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}},
{view:surfaces[1].createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}
]});
pass.setPipeline(inputPipeline);pass.setBindGroup(0,videoGroup);pass.draw(3);pass.end();
for(const [src,dst,axisBuffer] of [[0,2,xBlurBuffer],[2,3,yBlurBuffer]]) {
const blurGroup=device.createBindGroup({layout:blurPipeline.getBindGroupLayout(0),entries:[
{binding:0,resource:sampler},{binding:1,resource:surfaces[src].createView()},{binding:2,resource:{buffer:axisBuffer}}
]});
pass=encoder.beginRenderPass({colorAttachments:[{view:surfaces[dst].createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});
pass.setPipeline(blurPipeline);pass.setBindGroup(0,blurGroup);pass.draw(3);pass.end();
}
const lastMemory=surfaces[4+historyIndex];
const nextMemory=surfaces[4+(1-historyIndex)];
const screenGroup=device.createBindGroup({layout:screenPipeline.getBindGroupLayout(0),entries:[
{binding:0,resource:{buffer:paramsBuffer}},
{binding:1,resource:surfaces[0].createView()},
{binding:2,resource:surfaces[3].createView()},
{binding:3,resource:lastMemory.createView()},
{binding:4,resource:surfaces[1].createView()},
{binding:5,resource:sampler}
]});
pass=encoder.beginRenderPass({colorAttachments:[
{view:(offline?presentTexture:context.getCurrentTexture()).createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}},
{view:nextMemory.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}
]});
pass.setPipeline(screenPipeline);pass.setBindGroup(0,screenGroup);pass.draw(3);pass.end();
device.queue.submit([encoder.finish()]);
historyIndex=1-historyIndex;
frameCount++;
device.popErrorScope().then(error=>{
if(error){lastFault=error.message;onStatus('validation-error: '+lastFault);}
});
return true;
}
async function probe() {
if(frameCount<1) throw new Error('No GPU frames have been rendered');
onStatus('submitted-work-wait');
await device.queue.onSubmittedWorkDone();
const rowBytes=Math.ceil(width*4/256)*256;
const buffer=device.createBuffer({size:rowBytes*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
device.pushErrorScope('validation');
const encoder=device.createCommandEncoder();
encoder.copyTextureToBuffer({texture:offline?presentTexture:surfaces[4+historyIndex]},
{buffer,bytesPerRow:rowBytes,rowsPerImage:height},[width,height,1]);
device.queue.submit([encoder.finish()]);
await device.queue.onSubmittedWorkDone();
const error=await device.popErrorScope();
if(error)throw new Error('GPU readback: '+error.message);
await buffer.mapAsync(GPUMapMode.READ);
const bytes=new Uint8Array(buffer.getMappedRange());
let sum=0,bright=0,min=255,max=0;
const samples=[];
for(let y=0;y<height;y+=Math.max(1,Math.floor(height/32))){
for(let x=0;x<width;x+=Math.max(1,Math.floor(width/32))){
const idx=y*rowBytes+x*4,light=bytes[idx]+bytes[idx+1]+bytes[idx+2];
sum+=light;if(light>35)bright++;min=Math.min(min,light);max=Math.max(max,light);
if(samples.length<8)samples.push([bytes[idx],bytes[idx+1],bytes[idx+2]]);
}
}
if(offline){
const pixels=new Uint8ClampedArray(width*height*4);
for(let row=0;row<height;row++){
pixels.set(bytes.subarray(row*rowBytes,row*rowBytes+width*4),row*width*4);
}
const twoD=canvas.getContext('2d');
if(twoD)twoD.putImageData(new ImageData(pixels,width,height),0,0);
}
const sampleAt=(horizontal,vertical)=>{
  const px=Math.max(0,Math.min(width-1,Math.floor(horizontal*width)));
  const py=Math.max(0,Math.min(height-1,Math.floor(vertical*height)));
  const index=py*rowBytes+px*4;
  return [bytes[index],bytes[index+1],bytes[index+2],bytes[index+3]];
};
const checkpoints={left:sampleAt(.25,.5),center:sampleAt(.5,.5),right:sampleAt(.75,.5),top:sampleAt(.5,.25),bottom:sampleAt(.5,.75)};
buffer.unmap();buffer.destroy();
return {width,height,frameCount,bright,sum,min,max,samples,checkpoints,lastFault,offline};
}
function resetHistory(){
  for(const texture of surfaces)texture.destroy();
  surfaces=[];width=0;height=0;historyIndex=0;
  if(presentTexture){presentTexture.destroy();presentTexture=null;}
}
function dispose(){
disposed=true;for(const texture of surfaces) texture.destroy();
if(presentTexture)presentTexture.destroy();
fallback.dispose();paramsBuffer.destroy();xBlurBuffer.destroy();yBlurBuffer.destroy();
}
onStatus('ready');
return {render,probe,resize,resetHistory,dispose,get frames(){return frameCount},get fault(){return lastFault},get offline(){return offline}};
}