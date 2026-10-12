const byId=id=>document.getElementById(id);
const canvas=byId('surface'),viewport=byId('viewport');
const onTouch=matchMedia('(pointer:coarse)').matches;
const initial={arms:5,fusion:.46,organic:1,motion:1,glow:1.5,yaw:18,pitch:10,zoom:5.8,style:0,quality:onTouch?.5:.65,steps:onTouch?64:80};
const params={...initial},query=new URLSearchParams(location.search);
if(query.has('organic'))params.organic=initial.organic=Math.max(0,Math.min(1,Number(query.get('organic'))||0));
const isOffscreen=query.get('ci')==='offscreen',isCanvasTest=query.get('ci')==='canvas';
let device,context,pipeline,uniformBuffer,bindGroup,offscreenTexture,format,viewportWidth=0,viewportHeight=0;
let stopped=false,startAt=performance.now(),frozenTime=0,needsPaint=true,deviceLost=false,lastFrame=-1e9;
window.__bioState={phase:'script-start',ok:false,errors:[],mode:isOffscreen?'offscreen':'canvas',pixels:null};
function phase(next,note=next){window.__bioState.phase=next;document.body.dataset.gpuStage=next;byId('status').textContent=note;}
function errorOut(error){let text=error?.stack||error?.message||String(error);window.__bioState.errors.push(text);window.__bioState.ok=false;deviceLost=true;phase('error','描画エラー');byId('error').textContent=text;console.error(error);}
function label(name){byId(name+'-value').textContent=params[name]+(['yaw','pitch'].includes(name)?'°':'');}
function refresh(){for(let name of Object.keys(params)){byId(name).value=params[name];if(name!=='style')label(name);}needsPaint=true;}
refresh();
for(let name of Object.keys(params)){
 byId(name).addEventListener('input',e=>{params[name]=Number(e.target.value);if(name!=='style')label(name);needsPaint=true;});
}
byId('reset').onclick=()=>{Object.assign(params,initial);refresh();};
byId('pause').onclick=()=>{
 if(!stopped){frozenTime=(performance.now()-startAt)/1000;stopped=true;}
 else{startAt=performance.now()-frozenTime*1000;stopped=false;}
 byId('pause').textContent=stopped?'再開':'停止';needsPaint=true;
};
let drag=null,pinchDistance=0;
viewport.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;drag={x:e.clientX,y:e.clientY,id:e.pointerId};viewport.setPointerCapture(e.pointerId);});
viewport.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;
 params.yaw=Math.max(-180,Math.min(180,params.yaw+(e.clientX-drag.x)*.4));
 params.pitch=Math.max(-65,Math.min(65,params.pitch-(e.clientY-drag.y)*.3));
 drag.x=e.clientX;drag.y=e.clientY;label('yaw');label('pitch');byId('yaw').value=params.yaw;byId('pitch').value=params.pitch;needsPaint=true;
});
viewport.addEventListener('pointerup',()=>drag=null);
viewport.addEventListener('pointercancel',()=>drag=null);
viewport.addEventListener('wheel',e=>{e.preventDefault();params.zoom=Math.max(4,Math.min(10,Math.round((params.zoom+e.deltaY*.004)*10)/10));byId('zoom').value=params.zoom;label('zoom');needsPaint=true;},{passive:false});
viewport.addEventListener('touchmove',e=>{if(e.touches.length!==2)return;const a=e.touches[0],b=e.touches[1],dist=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);if(pinchDistance){params.zoom=Math.max(4,Math.min(10,params.zoom+(pinchDistance-dist)*.01));byId('zoom').value=params.zoom;label('zoom');needsPaint=true;}pinchDistance=dist;},{passive:true});
viewport.addEventListener('touchend',()=>pinchDistance=0);
function resize(){
 const r=viewport.getBoundingClientRect();
 const ratio=Math.min(devicePixelRatio||1,onTouch?1.25:1.6)*params.quality;
 const width=isOffscreen||isCanvasTest?320:Math.min(device.limits.maxTextureDimension2D,Math.max(2,Math.round(r.width*ratio)));
 const height=isOffscreen||isCanvasTest?240:Math.min(device.limits.maxTextureDimension2D,Math.max(2,Math.round(r.height*ratio)));
 if(width===viewportWidth&&height===viewportHeight)return;
 viewportWidth=width;viewportHeight=height;canvas.width=width;canvas.height=height;
 if(offscreenTexture)offscreenTexture.destroy();
 if(isOffscreen)offscreenTexture=device.createTexture({size:[width,height],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 needsPaint=true;
}
function timeValue(){return stopped?frozenTime:(performance.now()-startAt)/1000;}
function render(){
 resize();
 const uniforms=new Float32Array([timeValue(),viewportWidth,viewportHeight,params.zoom,params.yaw*Math.PI/180,params.pitch*Math.PI/180,params.fusion,params.motion,params.arms,params.glow,params.steps,params.style,params.organic,0,0,0]);
 device.queue.writeBuffer(uniformBuffer,0,uniforms);
 const target=isOffscreen?offscreenTexture:context.getCurrentTexture();
 const encoder=device.createCommandEncoder();
 const pass=encoder.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});
 pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.draw(3);pass.end();
 device.queue.submit([encoder.finish()]);needsPaint=false;
}
async function readback(){
 const bytesPerRow=Math.ceil(viewportWidth*4/256)*256;
 const buffer=device.createBuffer({size:bytesPerRow*viewportHeight,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 const command=device.createCommandEncoder();
 command.copyTextureToBuffer({texture:offscreenTexture},{buffer,bytesPerRow},[viewportWidth,viewportHeight]);
 device.queue.submit([command.finish()]);
 await device.queue.onSubmittedWorkDone();await buffer.mapAsync(GPUMapMode.READ);
 const pixels=new Uint8Array(buffer.getMappedRange());
 let signature=0,bright=0,nonDark=0;
 for(let y=0;y<viewportHeight;y+=4)for(let x=0;x<viewportWidth;x+=4){
  let k=y*bytesPerRow+x*4,r=pixels[k],g=pixels[k+1],b=pixels[k+2];
  signature=(signature*31+r*3+g*5+b*7)>>>0;
  if(g>65&&b>75)bright++;
  if(r+g+b>60)nonDark++;
 }
 const k=Math.floor(viewportHeight/2)*bytesPerRow+Math.floor(viewportWidth/2)*4;
 const center=Array.from(pixels.slice(k,k+4));
 buffer.unmap();buffer.destroy();
 const result={center,signature,bright,nonDark};
 window.__bioState.pixels=result;return result;
}
async function start(){
 if(!navigator.gpu)throw Error('WebGPUを利用できません。対応ブラウザとHTTPSが必要です。');
 phase('request-adapter');
 const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter)throw Error('WebGPU adapter not available');
 phase('request-device');device=await adapter.requestDevice();
 device.lost.then(info=>{if(!deviceLost)errorOut(Error('GPU device lost: '+info.reason+' '+info.message));});
 device.addEventListener('uncapturederror',event=>errorOut(event.error));
 format=navigator.gpu.getPreferredCanvasFormat();
 if(!isOffscreen){context=canvas.getContext('webgpu');if(!context)throw Error('canvas.getContext(webgpu) failed');context.configure({device,format,alphaMode:'opaque'});}
 resize();phase('fetch-shader');
 const resp=await fetch('./scene.wgsl',{cache:'no-store'});if(!resp.ok)throw Error('WGSL HTTP '+resp.status);
 const source=await resp.text();phase('compile-shader');
 const module=device.createShaderModule({code:source});
 const info=await module.getCompilationInfo();
 const errors=info.messages.filter(m=>m.type==='error');
 if(errors.length)throw Error('WGSL: '+errors.map(m=>m.lineNum+':'+m.linePos+' '+m.message).join('\n'));
 phase('create-pipeline');device.pushErrorScope('validation');
 pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vertexMain'},fragment:{module,entryPoint:'fragmentMain',targets:[{format}]},primitive:{topology:'triangle-list'}});
 uniformBuffer=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 bindGroup=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniformBuffer}}]});
 phase('submit');render();await device.queue.onSubmittedWorkDone();
 const validationError=await device.popErrorScope();if(validationError)throw validationError;
 window.__bioDraw=async()=>{render();await device.queue.onSubmittedWorkDone();return isOffscreen?readback():{ok:true};};
 if(isOffscreen){phase('readback');const pixels=await readback();if(pixels.bright<50||pixels.nonDark<150)throw Error('GPU result appears blank: '+JSON.stringify(pixels));}
 window.__bioState.ok=true;phase('ok',isOffscreen?'GPU readback OK':isCanvasTest?'Canvas OK':'WebGPUで描画中');
 if(isOffscreen||isCanvasTest)return;
 function frame(now){if(deviceLost)return;
  if((!stopped||needsPaint)&&now-lastFrame>=1000/(onTouch?22:38)){
    lastFrame=now;try{render();}catch(err){errorOut(err);return;}
  }
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}
start().catch(errorOut);
