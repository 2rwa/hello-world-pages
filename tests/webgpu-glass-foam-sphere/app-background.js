import {createMediaBackgroundController} from './media-background.js';
const q=(s)=>document.querySelector(s),canvas=q('#gpu'),statusEl=q('#status');
const bubbleCount=q('#bubbleCount'),riseSpeed=q('#riseSpeed'),foamAmount=q('#foamAmount'),glassIor=q('#glassIor'),absorption=q('#absorption');
const bubbleCountOut=q('#bubbleCountOut'),riseSpeedOut=q('#riseSpeedOut'),foamAmountOut=q('#foamAmountOut'),glassIorOut=q('#glassIorOut'),absorptionOut=q('#absorptionOut');
const backgroundFile=q('#backgroundFile'),backgroundName=q('#backgroundName'),clearBackground=q('#clearBackground');
const ciMode=new URLSearchParams(location.search).get('ci')==='1',RENDER_W=480,RENDER_H=270;
let paused=false,heldTime=0,yawValue=0,pitchValue=.04,dragging=false,lastX=0,lastY=0,backgroundEnabled=0,backgroundAspect=16/9;

function setStatus(textValue,stateValue='boot'){statusEl.textContent=textValue;statusEl.dataset.state=stateValue}
function syncOutputs(){
  bubbleCountOut.textContent=String(Math.round(Number(bubbleCount.value)));
  riseSpeedOut.textContent=Number(riseSpeed.value).toFixed(2);
  foamAmountOut.textContent=Number(foamAmount.value).toFixed(2);
  glassIorOut.textContent=Number(glassIor.value).toFixed(2);
  absorptionOut.textContent=Number(absorption.value).toFixed(2);
}
syncOutputs();
for(const node of [bubbleCount,riseSpeed,foamAmount,glassIor,absorption])node.addEventListener('input',syncOutputs);
q('#pauseAnim').addEventListener('click',(event)=>{paused=!paused;event.currentTarget.textContent=paused?'resume':'pause'});
q('#resetView').addEventListener('click',()=>{yawValue=0;pitchValue=.04});
canvas.addEventListener('pointerdown',(event)=>{dragging=true;lastX=event.clientX;lastY=event.clientY;canvas.setPointerCapture(event.pointerId)});
canvas.addEventListener('pointermove',(event)=>{if(!dragging)return;yawValue+=(event.clientX-lastX)*.008;pitchValue=Math.max(-.75,Math.min(.75,pitchValue+(event.clientY-lastY)*.006));lastX=event.clientX;lastY=event.clientY});
canvas.addEventListener('pointerup',()=>dragging=false);
canvas.addEventListener('pointercancel',()=>dragging=false);

function runUiRegression(){
  bubbleCount.value='17';riseSpeed.value='1.35';foamAmount.value='.66';
  for(const node of [bubbleCount,riseSpeed,foamAmount])node.dispatchEvent(new Event('input',{bubbles:true}));
  if(bubbleCountOut.textContent!=='17'||riseSpeedOut.textContent!=='1.35'||foamAmountOut.textContent!=='0.66')throw new Error('UI regression: control output did not update');
  if(backgroundFile.type!=='file'||!backgroundFile.accept.includes('image/'))throw new Error('UI regression: local background file picker missing');
  if(!q('#cameraStart')||!q('#cameraStop'))throw new Error('UI regression: camera controls missing');
}

const shaderCode=await Promise.all(['./shader-base-bg.wgsl','./shader-bubbles.wgsl','./shader-lighting-bg.wgsl','./shader-fragment.wgsl'].map(async(pathValue)=>{
  const response=await fetch(pathValue);if(!response.ok)throw new Error(`shader fetch failed: ${pathValue} ${response.status}`);return response.text();
})).then((parts)=>parts.join('\n'));

async function main(){
  try{
    if(ciMode)runUiRegression();
    if(!navigator.gpu)throw new Error('navigator.gpu is unavailable');
    setStatus('adapter…');
    const gpuAdapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!gpuAdapter)throw new Error('requestAdapter() returned null');
    setStatus('device…');
    const gpuDevice=await gpuAdapter.requestDevice();
    gpuDevice.lost.then((info)=>setStatus(`device lost: ${info.reason||'unknown'} ${info.message||''}`,'error'));
    setStatus('shader…');
    const shaderModule=gpuDevice.createShaderModule({code:shaderCode});
    const info=await shaderModule.getCompilationInfo(),errors=info.messages.filter((message)=>message.type==='error');
    if(errors.length)throw new Error(errors.map((m)=>`${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));

    const uniformBuffer=gpuDevice.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const sampler=gpuDevice.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
    const defaultTexture=gpuDevice.createTexture({size:[2,2,1],format:'rgba8unorm-srgb',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    gpuDevice.queue.writeTexture({texture:defaultTexture},new Uint8Array([30,60,68,255,40,80,88,255,22,45,52,255,48,92,98,255]),{bytesPerRow:8},[2,2,1]);
    let activeTexture=defaultTexture,currentBindGroup=null;

    function createPipeline(surfaceFormat){
      return gpuDevice.createRenderPipeline({layout:'auto',vertex:{module:shaderModule,entryPoint:'vertexMain'},fragment:{module:shaderModule,entryPoint:'fragmentMain',targets:[{format:surfaceFormat}]},primitive:{topology:'triangle-list'}});
    }
    function rebuildBindGroup(renderPipeline){
      currentBindGroup=gpuDevice.createBindGroup({layout:renderPipeline.getBindGroupLayout(0),entries:[
        {binding:0,resource:{buffer:uniformBuffer}},{binding:1,resource:activeTexture.createView()},{binding:2,resource:sampler}
      ]});
    }
    function writeUniforms(timeValue,widthValue,heightValue){
      gpuDevice.queue.writeBuffer(uniformBuffer,0,new Float32Array([
        widthValue,heightValue,timeValue,0,
        Number(bubbleCount.value),Number(riseSpeed.value),Number(foamAmount.value),Number(glassIor.value),
        yawValue,pitchValue,Number(absorption.value),0,
        backgroundEnabled,backgroundAspect,0,0
      ]));
    }
    function encodeRender(renderPipeline,textureView){
      const encoder=gpuDevice.createCommandEncoder();
      const pass=encoder.beginRenderPass({colorAttachments:[{view:textureView,clearValue:{r:.01,g:.02,b:.025,a:1},loadOp:'clear',storeOp:'store'}]});
      pass.setPipeline(renderPipeline);pass.setBindGroup(0,currentBindGroup);pass.draw(3,1,0,0);pass.end();return encoder;
    }

    if(ciMode){
      setStatus('pipeline…');gpuDevice.pushErrorScope('validation');
      const ciFormat='rgba8unorm',renderPipeline=createPipeline(ciFormat);rebuildBindGroup(renderPipeline);
      backgroundEnabled=1;backgroundAspect=16/9;
      const w=120,h=68,bytesPerRow=256*Math.ceil((w*4)/256);
      const targetTexture=gpuDevice.createTexture({size:[w,h,1],format:ciFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
      const readbackBuffer=gpuDevice.createBuffer({size:bytesPerRow*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      writeUniforms(2.4,w,h);
      const encoder=encodeRender(renderPipeline,targetTexture.createView());
      encoder.copyTextureToBuffer({texture:targetTexture},{buffer:readbackBuffer,bytesPerRow,rowsPerImage:h},[w,h,1]);
      gpuDevice.queue.submit([encoder.finish()]);setStatus('submitted…');await gpuDevice.queue.onSubmittedWorkDone();
      const validationError=await gpuDevice.popErrorScope();if(validationError)throw new Error(`validation: ${validationError.message}`);
      await readbackBuffer.mapAsync(GPUMapMode.READ);const pixels=new Uint8Array(readbackBuffer.getMappedRange());
      let checksumValue=0,brightSamples=0;for(let i=0;i<pixels.length;i+=97){checksumValue=(checksumValue+pixels[i])>>>0;if(pixels[i]>60)brightSamples++}
      readbackBuffer.unmap();if(checksumValue===0||brightSamples<2)throw new Error('readback did not contain visible background/sphere output');
      setStatus(`ok · bg checksum ${checksumValue}`,'ok');document.body.dataset.ci='ok';return;
    }

    canvas.width=RENDER_W;canvas.height=RENDER_H;
    const gpuContext=canvas.getContext('webgpu');if(!gpuContext)throw new Error('webgpu canvas context unavailable');
    const surfaceFormat=navigator.gpu.getPreferredCanvasFormat();
    gpuContext.configure({device:gpuDevice,format:surfaceFormat,alphaMode:'opaque'});
    gpuDevice.pushErrorScope('validation');
    const renderPipeline=createPipeline(surfaceFormat);rebuildBindGroup(renderPipeline);

    const mediaController=createMediaBackgroundController({
      gpuDevice,defaultTexture,backgroundFile,backgroundName,clearBackground,
      cameraStart:q('#cameraStart'),cameraStop:q('#cameraStop'),setStatus,
      onTexture:(textureValue,aspectValue,enabledValue)=>{
        activeTexture=textureValue;
        backgroundAspect=aspectValue;
        backgroundEnabled=enabledValue;
        rebuildBindGroup(renderPipeline);
      }
    });

    writeUniforms(.3,RENDER_W,RENDER_H);
    gpuDevice.queue.submit([encodeRender(renderPipeline,gpuContext.getCurrentTexture().createView()).finish()]);
    await gpuDevice.queue.onSubmittedWorkDone();
    const validationError=await gpuDevice.popErrorScope();if(validationError)throw new Error(`validation: ${validationError.message}`);
    setStatus('ok','ok');
    const startedAt=performance.now();
    function frame(nowValue){
      mediaController.updateCameraFrame();
      if(!paused)heldTime=(nowValue-startedAt)*.001;
      writeUniforms(heldTime,RENDER_W,RENDER_H);
      gpuDevice.queue.submit([encodeRender(renderPipeline,gpuContext.getCurrentTexture().createView()).finish()]);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }catch(errorValue){console.error(errorValue);document.body.dataset.ci='error';setStatus(String(errorValue?.message||errorValue),'error')}
}
main();
