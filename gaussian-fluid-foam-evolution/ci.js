// Production shaders and storage buffers are exercised offscreen on SwiftShader.
// The CI check reads actual displacement, Jacobian-derived foam and rendered pixels.
export async function runGpuCI({device,draw,renderTarget,canvas,ciState,mark,fieldBuffers,deformationBuffers,foamBuffers}){
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
  const transfer=device.createCommandEncoder();
  transfer.copyTextureToBuffer({texture:renderTarget},{buffer:renderCopy,bytesPerRow,rowsPerImage:height},{width,height});
  transfer.copyBufferToBuffer(fieldBuffers[0],0,stateCopy,0,cellBytes);
  transfer.copyBufferToBuffer(deformationBuffers[0],0,deformCopy,0,cellBytes);
  transfer.copyBufferToBuffer(foamBuffers[0],0,rgbaCopy,0,cellBytes);
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
  ciState.textContent="ok: frames="+frames+"; RGBA="+channelPeaks.map(x=>x.toFixed(3)).join(",")+"; J="+minJac.toFixed(3)+".."+maxJac.toFixed(3)
     +"; foamMax="+maxFoam.toFixed(4)+"; deformationMax="+maxShift.toFixed(3)
     +"; red="+minRed+".."+maxRed+"; sum="+checksum;
  mark("CI GPU + RGBA FOAM PASS");
}
