// CI uses the exact production shader, bind group and render path.
export async function runGpuCheck({
 device,format,render,dimensions,applyPhysics,getBalls,getRadius,getMetrics,
 reset,setCount,compressNow,getApp,state,status,makeSensor
}){
 const w=256,h=320,pitch=1024;
 dimensions(w,h);
 const texture=device.createTexture({size:[w,h],format,
  usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 const readback=device.createBuffer({size:pitch*h,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 async function snapshot(){
  device.pushErrorScope('validation');
  const encoder=render(w,h,texture.createView());
  encoder.copyTextureToBuffer({texture},{buffer:readback,bytesPerRow:pitch},{width:w,height:h});
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const invalid=await device.popErrorScope();
  if(invalid)throw Error('GPU validation: '+invalid.message);
  await readback.mapAsync(GPUMapMode.READ);
  const pixels=new Uint8Array(readback.getMappedRange());
  let min=255,max=0,checksum=0,red=0,cyan=0,samples=0;
  for(let y=8;y<h-8;y+=4)for(let x=8;x<w-8;x+=4){
   const at=y*pitch+x*4,R=pixels[at],G=pixels[at+1],B=pixels[at+2];
   const light=(R+G+B)/3;
   min=Math.min(min,light);max=Math.max(max,light);
   if(R>G+22&&R>B+10&&R>65)red++;
   if(G>R+10&&B>R+14&&B>62)cyan++;
   checksum=(checksum+(R*3+G*5+B*7)*(x%19+y%13+1))%1000000007;
   samples++;
  }
  readback.unmap();
  return {min:Math.round(min),max:Math.round(max),checksum,red,cyan,samples};
 }
 try{
  setCount(30);
  const initialMetrics=getMetrics();
  if(initialMetrics.penetrationPairs!==0)throw Error('30-ball initial placement overlaps');
  const first=await snapshot();
  if(first.max-first.min<28)throw Error('Initial shader output flat '+JSON.stringify(first));
  // Optical regression: the SAME scene must visibly change when Snell ray bending
  // is disabled. This compares real rendered GPU pixels, not just UI state.
  const opticalToggle=document.getElementById('xray');
  if(!opticalToggle.checked)throw Error('Refraction should be enabled by default');
  opticalToggle.checked=false;
  opticalToggle.dispatchEvent(new Event('change',{bubbles:true}));
  const straightRays=await snapshot();
  opticalToggle.checked=true;
  opticalToggle.dispatchEvent(new Event('change',{bubbles:true}));
  if(Math.abs(first.checksum-straightRays.checksum)<25000)
   throw Error('Refraction toggle failed to change rendered pixels '+JSON.stringify({first,straightRays}));
  const yawControl=document.getElementById('yaw');
  yawControl.value='88';
  yawControl.dispatchEvent(new Event('input',{bubbles:true}));
  const rotated=await snapshot();
  if(rotated.checksum===first.checksum)
   throw Error('Changing camera yaw did not change raymarched pixels');
  yawControl.value='22';
  yawControl.dispatchEvent(new Event('input',{bubbles:true}));
  reset();
  setCount(50);
  if(getBalls().length!==50)throw Error('50 balls not created');
  if(getMetrics().penetrationPairs!==0)throw Error('50 balls initially intersect');
  const viewPairs=getApp().projectedPairs;
  if(viewPairs<=0)throw Error('No view-space overlapping spheres to display');
  const before=await snapshot();
  compressNow();
  const afterStats=getMetrics();
  if(afterStats.penetrationPairs<3||afterStats.maxPenetration<0.1)
    throw Error('Real 3D interpenetration not measured '+JSON.stringify({
      pairs:afterStats.penetrationPairs,max:afterStats.maxPenetration}));
  const compressed=await snapshot();
  if(compressed.checksum===before.checksum)
    throw Error('Compression did not change rendered pixels');
  if(compressed.red<=before.red+5)
    throw Error('3D penetration not visibly red '+JSON.stringify({before,compressed}));
  // Iterative solver must undo the intentional overlap, without ejecting balls.
  document.getElementById('iterations').value='8';
  for(let i=0;i<65;i++)applyPhysics(.016);
  const solved=getMetrics();
  if(solved.maxPenetration>=afterStats.maxPenetration*0.6)
    throw Error('Solver did not reduce penetration '+solved.maxPenetration);
  const limit=3.65-getRadius()+0.001;
  for(const b of getBalls()){
   if(Math.hypot(b.x,b.y,b.z)>limit+0.015)
    throw Error('Ball passed beyond spherical shell');
  }
  const resolved=await snapshot();
  if(resolved.max-resolved.min<25)
    throw Error('Resolved scene output flat');
  const sensor=makeSensor();
  sensor.inject({acceleration:{x:12,y:-7,z:4}});
  const sensorVector=sensor.sample(.016);
  if(sensorVector[0]>=-1||sensorVector[1]<=1)
    throw Error('Inertia axis sign incorrect '+JSON.stringify(sensorVector));
  const shakeBurst=sensor.consumeBurst();
  if(shakeBurst<0.7)throw Error('Strong motion did not trigger shake burst');
  sensor.inject({acceleration:{x:0,y:0,z:0},
    accelerationIncludingGravity:{x:9.81,y:0,z:0}});
  const tiltedGravity=sensor.gravity;
  if(tiltedGravity[0]>-8.0||Math.abs(tiltedGravity[1])>1)
    throw Error('Tilt gravity vector incorrect '+JSON.stringify(tiltedGravity));
  state('ok',{activeCount:50,
   initial:before,straightRays,refracted:first,rotated,compressed,resolved,tiltedGravity,shakeBurst,
   viewPairs,penetrationPairs:afterStats.penetrationPairs,
   maxPenetration:afterStats.maxPenetration,
   solvedPenetration:solved.maxPenetration,sensorVector});
  document.documentElement.dataset.test='ok';
  status.textContent='CI OK: Snell refraction + 50 3D glass marbles + overlaps';
 } finally {
  texture.destroy();readback.destroy();
 }
}
