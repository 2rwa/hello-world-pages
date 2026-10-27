// Production shaders and storage buffers are exercised offscreen on SwiftShader.
// The CI check reads actual displacement, Jacobian-derived foam and rendered pixels.
export async function runGpuCI({device,draw,renderTarget,canvas,ciState,mark,fieldBuffers,deformationBuffers,foamBuffers,particleEngine}){
  ciState.textContent="validation-scope";
  device.pushErrorScope("validation");
  const frames=48; // even count: phase-1 outputs are field[0], deformation[0]
  for(let frameIndex=0;frameIndex<frames;frameIndex++)draw(1/60);
  ciState.textContent="submitted-work-wait";
  await device.queue.onSubmittedWorkDone();
  const validation=await device.popErrorScope();
  if(validation)throw Error("WebGPU validation: "+validation.message);
  const width=canvas.width,height=canvas.height,bytesPerRow=width*4;
  const cellBytes=160*160*16;
  const renderCopy=device.createBuffer({size:bytesPerRow*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const stateCopy=device.createBuffer({size:cellBytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const deformCopy=device.createBuffer({size:cellBytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const rgbaCopy=device.createBuffer({size:cellBytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const particleBytes=particleEngine.count*64;
  const particleCopy=device.createBuffer({size:particleBytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const transfer=device.createCommandEncoder();
  transfer.copyTextureToBuffer({texture:renderTarget},{buffer:renderCopy,bytesPerRow,rowsPerImage:height},{width,height});
  transfer.copyBufferToBuffer(fieldBuffers[0],0,stateCopy,0,cellBytes);
  transfer.copyBufferToBuffer(deformationBuffers[0],0,deformCopy,0,cellBytes);
  transfer.copyBufferToBuffer(foamBuffers[0],0,rgbaCopy,0,cellBytes);
  transfer.copyBufferToBuffer(particleEngine.buffer,0,particleCopy,0,particleBytes);
  device.queue.submit([transfer.finish()]);
  await device.queue.onSubmittedWorkDone();
  await renderCopy.mapAsync(GPUMapMode.READ);
  const pixels=new Uint8Array(renderCopy.getMappedRange());
  let minRed=255,maxRed=0,checksum=0;
  for(let index=0;index<pixels.length;index+=16){
    const red=pixels[index];minRed=Math.min(minRed,red);maxRed=Math.max(maxRed,red);checksum+=red;
  }
  renderCopy.unmap();renderCopy.destroy();
  if(maxRed-minRed<16)throw Error("Rendered image may be blank: red span "+(maxRed-minRed));
  await stateCopy.mapAsync(GPUMapMode.READ);
  const state=new Float32Array(stateCopy.getMappedRange().slice(0));
  stateCopy.unmap();stateCopy.destroy();
  await deformCopy.mapAsync(GPUMapMode.READ);
  const displacement=new Float32Array(deformCopy.getMappedRange().slice(0));
  deformCopy.unmap();deformCopy.destroy();
  await rgbaCopy.mapAsync(GPUMapMode.READ);
  const rgbaFoam=new Float32Array(rgbaCopy.getMappedRange().slice(0));
  rgbaCopy.unmap();rgbaCopy.destroy();
  const channelPeaks=[0,0,0,0],channelSums=[0,0,0,0];
  for(let pixelIndex=0;pixelIndex<rgbaFoam.length;pixelIndex+=4){
    for(let channel=0;channel<4;channel++){
      const value=rgbaFoam[pixelIndex+channel];
      if(!Number.isFinite(value))throw Error("RGBA foam has NaN / Inf in channel "+channel);
      channelPeaks[channel]=Math.max(channelPeaks[channel],value);
      channelSums[channel]+=value;
    }
  }
  for(let channel=0;channel<4;channel++){
    if(channelPeaks[channel]<0.00001)throw Error("RGBA foam channel "+channel+" inactive");
  }
  let maxFoam=0,maxShift=0,minJac=10,maxJac=-10;
  const side=160,invSpacing=0.5/(48/side);
  function wrap(x){return (x+side)%side;}
  function d(x,z,axis){return displacement[(wrap(x)+wrap(z)*side)*4+axis];}
  for(let z=0;z<side;z++){
    for(let x=0;x<side;x++){
      const offset=(x+z*side)*4;
      maxFoam=Math.max(maxFoam,state[offset+3]);
      maxShift=Math.max(maxShift,Math.hypot(displacement[offset],displacement[offset+1]));
      const xx=(d(x+1,z,0)-d(x-1,z,0))*invSpacing;
      const xz=(d(x,z+1,0)-d(x,z-1,0))*invSpacing;
      const zx=(d(x+1,z,1)-d(x-1,z,1))*invSpacing;
      const zz=(d(x,z+1,1)-d(x,z-1,1))*invSpacing;
      const jac=(1+xx)*(1+zz)-xz*zx;
      minJac=Math.min(minJac,jac);maxJac=Math.max(maxJac,jac);
    }
  }
  if(!Number.isFinite(minJac)||!Number.isFinite(maxJac))throw Error("Jacobian is NaN");
  if(maxShift<.001)throw Error("Displacement accumulation inactive: "+maxShift);
  if(maxFoam<.00005)throw Error("Jacobian whitecap generation inactive: "+maxFoam);
  if(minJac>=.98)throw Error("No detected Jacobian compression: min "+minJac);

  await particleCopy.mapAsync(GPUMapMode.READ);
  const particleData=new Float32Array(particleCopy.getMappedRange().slice(0));
  particleCopy.unmap();particleCopy.destroy();
  let bubbleActive=0,sprayActive=0,above=0,below=0;
  let bubbleVisible=0,sprayVisible=0;
  let maxSprayHeight=-999,minBubbleHeight=999;
  for(let index=0;index<particleEngine.count;index++){
    const offset=index*16;
    const x=particleData[offset],y=particleData[offset+1],z=particleData[offset+2];
    const age=particleData[offset+3],life=particleData[offset+7];
    const kind=particleData[offset+9];
    if(!Number.isFinite(y)||!Number.isFinite(age))throw Error("Particle position NaN at "+index);
    if(life<=0||age<0||age>=life)continue;
    const bubble=kind<0.5;
    if(bubble){bubbleActive++;minBubbleHeight=Math.min(minBubbleHeight,y);if(y<0)below++;}
    else{sprayActive++;maxSprayHeight=Math.max(maxSprayHeight,y);if(y>0)above++;}
    const depth=-z,aspect=canvas.width/canvas.height;
    const projectX=x/(Math.max(depth,0.1)*0.82*aspect);
    const projectY=((y-4)/Math.max(depth,0.1)+0.16)/0.78;
    if(depth>0.2 && depth<150 && Math.abs(projectX)<1.1 && Math.abs(projectY)<1.1){
      if(bubble)bubbleVisible++;else sprayVisible++;
    }
  }
  if(bubbleActive<15||sprayActive<15)throw Error("3D particle generation inactive: bubbles="+bubbleActive+" spray="+sprayActive);
  if(bubbleVisible<3||sprayVisible<3)throw Error("3D projection contains too few sprites: "+bubbleVisible+" / "+sprayVisible);
  if(below<5||above<5)throw Error("Expected submerged bubbles and airborne spray: "+below+" / "+above);
  // Compare the production fragment output with sprites enabled and disabled.
  // The same fluid/foam frame and uniform time is rendered in both images.
  document.getElementById("diagnosticMode").value="4";
  draw(0);
  await device.queue.onSubmittedWorkDone();
  const copyImage=async()=>{
    const read=device.createBuffer({size:bytesPerRow*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const transfer=device.createCommandEncoder();
    transfer.copyTextureToBuffer({texture:renderTarget},{buffer:read,bytesPerRow},{width,height});
    device.queue.submit([transfer.finish()]);
    await device.queue.onSubmittedWorkDone();
    await read.mapAsync(GPUMapMode.READ);
    const bytes=new Uint8Array(read.getMappedRange().slice(0));
    read.unmap();read.destroy();
    return bytes;
  };
  const withSprites=await copyImage();
  document.getElementById("bubbles").value="0";
  document.getElementById("spray").value="0";
  draw(0);
  const withoutSprites=await copyImage();
  let changedPixels=0,deltaSum=0;
  for(let offset=0;offset<withSprites.length;offset+=4){
    const difference=Math.abs(withSprites[offset]-withoutSprites[offset])
                    +Math.abs(withSprites[offset+1]-withoutSprites[offset+1])
                    +Math.abs(withSprites[offset+2]-withoutSprites[offset+2]);
    if(difference>4)changedPixels++;
    deltaSum+=difference;
  }
  if(changedPixels<10)throw Error("3D particle render invisible: changedPixels="+changedPixels+" diffSum="+deltaSum);
  ciState.textContent="ok: frames="+frames+"; bubbles="+bubbleActive+" spray="+sprayActive+" visible="+bubbleVisible+"/"+sprayVisible+" changedPx="+changedPixels+"; RGBA="+channelPeaks.map(x=>x.toFixed(3)).join(",")+"; J="+minJac.toFixed(3)+".."+maxJac.toFixed(3)
     +"; foamMax="+maxFoam.toFixed(4)+"; deformationMax="+maxShift.toFixed(3)
     +"; red="+minRed+".."+maxRed+"; sum="+checksum;
  mark("CI GPU + 3D PARTICLES PASS");
}
