// Headless offscreen regression with the production render pipeline.
export async function runGpuRegression({device,format,render,setCount,move,
  getBalls,getRadius,getBounds,report}){
 const width=256,height=360,pitch=width*4;
 const texture=device.createTexture({size:[width,height],format,
  usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 const readback=device.createBuffer({size:pitch*height,
  usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 async function capture(){
  device.pushErrorScope('validation');
  const encoder=render(width,height,texture.createView());
  encoder.copyTextureToBuffer({texture},{buffer:readback,bytesPerRow:pitch},{width,height});
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const error=await device.popErrorScope();
  if(error)throw Error('GPU validation: '+error.message);
  await readback.mapAsync(GPUMapMode.READ);
  const rgba=new Uint8Array(readback.getMappedRange());
  let min=255,max=0,checksum=0,samples=0,brightPixels=0;
  for(let y=12;y<height-12;y+=7)for(let x=12;x<width-12;x+=7){
    const at=(y*width+x)*4,r=rgba[at],g=rgba[at+1],b=rgba[at+2];
    const l=Math.round((r+g+b)/3);
    min=Math.min(min,l);max=Math.max(max,l);
    checksum=(checksum+(r*3+g*5+b*7)*((x+19*y)%17+1))%1000000007;
    if(l>55)brightPixels++;
    samples++;
  }
  readback.unmap();
  return {min,max,checksum,samples,brightPixels};
 }
 try {
  setCount(3,width,height);
  const initialX=getBalls()[0].x;
  for(let step=0;step<80;step++)move(.016,4.5,0);
  const moved=getBalls()[0].x-initialX;
  if(moved<0.15)throw Error('Gravity physics did not move the ball: '+moved);
  const small=await capture();
  if(small.max-small.min<24)throw Error('3-ball GPU image unexpectedly flat '+JSON.stringify(small));

  setCount(50,width,height);
  const positions=getBalls(),radius=getRadius();
  const [halfW,halfH]=getBounds();
  if(positions.length!==50)throw Error('Expected 50 balls, got '+positions.length);
  let closest=1000;
  for(let i=0;i<50;i++){
    const bead=positions[i];
    if(Math.abs(bead.x)>halfW-radius+0.02||Math.abs(bead.y)>halfH-radius+0.02){
      throw Error('50-ball position escaped board '+i);
    }
    for(let j=i+1;j<50;j++){
      closest=Math.min(closest,Math.hypot(bead.x-positions[j].x,bead.y-positions[j].y));
    }
  }
  if(closest<radius*2.01)throw Error('50-ball initial packing overlaps '+closest+' radius '+radius);
  const initialPositions=positions.map(b=>[b.x,b.y]);
  for(let step=0;step<22;step++)move(.016,3.5,-2.2);
  const movedBalls=positions.filter((b,i)=>Math.hypot(
    b.x-initialPositions[i][0],b.y-initialPositions[i][1])>0.03).length;
  if(movedBalls<35)throw Error('Only '+movedBalls+' out of 50 balls respond to tilt');
  const many=await capture();
  if(many.max-many.min<24)throw Error('50-ball GPU image unexpectedly flat '+JSON.stringify(many));
  if(Math.abs(many.checksum-small.checksum)<1000)
    throw Error('50 balls were not reflected in rendered pixels');
  setCount(3,width,height); // return the UI to its default before interactive tests
  window.__gravityGlass={phase:'ok',moved,pixelRange:[many.min,many.max],
    samples:many.samples,rendered:[width,height],activeCount:3,testedBalls:50,
    radius,closest,movedBalls,pixelChecksum3:small.checksum,
    pixelChecksum50:many.checksum};
  document.documentElement.dataset.test='ok';
  report('CI OK: 50 glass spheres, real GPU pixels and gravity');
 } finally {
  texture.destroy();readback.destroy();
 }
}
