// Runs production Gaussian synthesis / foam / mesh / sky on SwiftShader.
// Reads wave displacement, Jacobian texture, foam history and final pixels.
export async function testOcean({gpu,drawFrame,waveTexture,normalTexture,foamTextures,offscreen,canvas,ciStage,status}){
  const size=192,rgba16Bytes=size*size*8;
  ciStage.textContent="validation-scope";
  gpu.pushErrorScope("validation");
  for(let i=0;i<5;i++)drawFrame(1/45);
  await gpu.queue.onSubmittedWorkDone();
  const error=await gpu.popErrorScope();
  if(error)throw Error("Validation: "+error.message);
  ciStage.textContent="gpu-readback";
  const U=GPUBufferUsage,readback=(n)=>gpu.createBuffer({size:n,usage:U.COPY_DST|U.MAP_READ});
  const outBytes=canvas.width*canvas.height*4;
  const waveRead=readback(rgba16Bytes),normRead=readback(rgba16Bytes),foamRead=readback(rgba16Bytes),imageRead=readback(outBytes);
  const enc=gpu.createCommandEncoder();
  const origin={x:0,y:0,z:0};
  enc.copyTextureToBuffer({texture:waveTexture,origin}, {buffer:waveRead,bytesPerRow:size*8,rowsPerImage:size},{width:size,height:size});
  enc.copyTextureToBuffer({texture:normalTexture,origin:{x:0,y:0,z:3}}, {buffer:normRead,bytesPerRow:size*8,rowsPerImage:size},{width:size,height:size});
  enc.copyTextureToBuffer({texture:foamTextures[1],origin}, {buffer:foamRead,bytesPerRow:size*8,rowsPerImage:size},{width:size,height:size});
  enc.copyTextureToBuffer({texture:offscreen}, {buffer:imageRead,bytesPerRow:canvas.width*4,rowsPerImage:canvas.height},{width:canvas.width,height:canvas.height});
  gpu.queue.submit([enc.finish()]);
  await gpu.queue.onSubmittedWorkDone();
  async function read(buffer){
    await buffer.mapAsync(GPUMapMode.READ);
    const contents=buffer.getMappedRange().slice(0);
    buffer.unmap();buffer.destroy();return new DataView(contents);
  }
  const [wave,norm,foam,pixels]=await Promise.all([read(waveRead),read(normRead),read(foamRead),read(imageRead)]);
  function halfFloat(h){
    const sign=h&0x8000?-1:1;
    const e=(h>>10)&31,m=h&1023;
    if(e===31)return m?NaN:sign*Infinity;
    if(e===0)return sign*(m/1024)*Math.pow(2,-14);
    return sign*(1+m/1024)*Math.pow(2,e-15);
  }
  const stats={minH:1e9,maxH:-1e9,minJ:1e9,maxJ:-1e9,foam:0,slope:0};
  for(let i=0;i<size*size;i++){
    const offset=i*8;
    const height=halfFloat(wave.getUint16(offset,true));
    const slope=halfFloat(norm.getUint16(offset,true));
    const jac=halfFloat(norm.getUint16(offset+6,true));
    const coverage=halfFloat(foam.getUint16(offset,true));
    if(![height,slope,jac,coverage].every(Number.isFinite))throw Error("Wave or foam contains nonfinite floats");
    stats.minH=Math.min(stats.minH,height);stats.maxH=Math.max(stats.maxH,height);
    stats.minJ=Math.min(stats.minJ,jac);stats.maxJ=Math.max(stats.maxJ,jac);
    stats.foam=Math.max(stats.foam,coverage);
    stats.slope=Math.max(stats.slope,Math.abs(slope));
  }
  let minR=255,maxR=0,sampleSum=0;
  for(let i=0;i<outBytes;i+=16){const r=pixels.getUint8(i);minR=Math.min(minR,r);maxR=Math.max(maxR,r);sampleSum+=r;}
  if(stats.maxH-stats.minH<0.05)throw Error("Flat Gaussian waves: "+JSON.stringify(stats));
  if(stats.maxJ-stats.minJ<0.015)throw Error("Jacobian variation missing: "+JSON.stringify(stats));
  if(stats.foam<0.0001)throw Error("Foam history not generating: "+JSON.stringify(stats));
  if(maxR-minR<20)throw Error("Blank or flat ocean+sky: red "+minR+".."+maxR);
  document.getElementById("debug").value="2";
  drawFrame(0);
  await gpu.queue.onSubmittedWorkDone();
  gpu.pushErrorScope("validation");
  drawFrame(0);
  await gpu.queue.onSubmittedWorkDone();
  const debugError=await gpu.popErrorScope();
  if(debugError)throw Error("Debug draw validation: "+debugError.message);
  ciStage.textContent="ok: frames=7; gaussianWave="+stats.minH.toFixed(3)+".."+stats.maxH.toFixed(3)
    +"; J="+stats.minJ.toFixed(3)+".."+stats.maxJ.toFixed(3)
    +"; foam="+stats.foam.toFixed(4)+"; imageR="+minR+".."+maxR+"; checksum="+sampleSum;
  status("CI GPU: FIVE GAUSSIAN BANDS + FOAM PASS");
}
