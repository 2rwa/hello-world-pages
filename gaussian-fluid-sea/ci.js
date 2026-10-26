// Headless CI uses the same simulation and render pipelines as the live page.
// It substitutes only the swapchain output for an RGBA8 offscreen GPU texture.
export async function runGpuCI({device,draw,renderTarget,canvas,ciState,mark}){
  ciState.textContent="validation-scope";
  device.pushErrorScope("validation");
  for(let i=0;i<9;i++)draw(1/60);
  ciState.textContent="submitted-work-wait";
  await device.queue.onSubmittedWorkDone();
  const validation=await device.popErrorScope();
  if(validation)throw Error("WebGPU validation: "+validation.message);
  const width=canvas.width,height=canvas.height,bytesPerRow=width*4;
  const readback=device.createBuffer({
    size:bytesPerRow*height,
    usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ
  });
  const transfer=device.createCommandEncoder();
  transfer.copyTextureToBuffer(
    {texture:renderTarget},{buffer:readback,bytesPerRow,rowsPerImage:height},
    {width,height}
  );
  device.queue.submit([transfer.finish()]);
  await device.queue.onSubmittedWorkDone();
  await readback.mapAsync(GPUMapMode.READ);
  const pixels=new Uint8Array(readback.getMappedRange());
  let min=255,max=0,check=0;
  for(let i=0;i<pixels.length;i+=16){
    const value=pixels[i];
    min=Math.min(min,value);max=Math.max(max,value);check+=value;
  }
  readback.unmap();readback.destroy();
  if(max-min<16)throw Error("Rendered image may be blank: red span "+(max-min));
  ciState.textContent="ok: frames=9; redRange="+min+".."+max+"; checksum="+check;
  mark("CI GPU PASS");
}
