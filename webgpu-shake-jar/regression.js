import {JAR_RADIUS,shakeImpulse,integrate} from './physics.js';
export async function testOffscreen({device,resize,draw,format,friction,motion,setPhase,status,setCount,getBalls,getRadius}){
 const w=280,h=320;resize(w,h);
 let balls=getBalls(),ballRadius=getRadius();
 const bytesPerRow=Math.ceil(w*4/256)*256;
 const texture=device.createTexture({size:[w,h],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 const output=device.createBuffer({size:bytesPerRow*h,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 async function snapshot(){
  device.pushErrorScope('validation');
  const encoder=draw(w,h,texture.createView());
  encoder.copyTextureToBuffer({texture},{buffer:output,bytesPerRow},{width:w,height:h});
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const invalid=await device.popErrorScope();
  if(invalid)throw Error('GPU validation: '+invalid.message);
  await output.mapAsync(GPUMapMode.READ);
  const pixels=new Uint8Array(output.getMappedRange());
  let min=255,max=0,checksum=0;
  for(let y=8;y<h-8;y+=9)for(let x=8;x<w-8;x+=9){
   const at=y*bytesPerRow+x*4;
   const light=Math.round((pixels[at]+pixels[at+1]+pixels[at+2])/3);
   min=Math.min(min,light);max=Math.max(max,light);
   checksum=(checksum+pixels[at]*13+pixels[at+1]*7+pixels[at+2]*3)%1000000007;
  }
  output.unmap();return {min,max,checksum};
 }
 try{
  const initial=await snapshot();
  if(initial.max-initial.min<24)throw Error('Jar output was flat: '+JSON.stringify(initial));
  const before=balls.map(b=>[b.x,b.y,b.z]);
  shakeImpulse(balls,2.1);
  for(let i=0;i<55;i++)integrate(balls,ballRadius,.016,[0,0,0],Number(friction.value));
  const moved=balls.filter((b,i)=>Math.hypot(b.x-before[i][0],b.y-before[i][1],b.z-before[i][2])>.12).length;
  if(moved<Math.ceil(balls.length*.6))throw Error('Shaking did not move enough balls: '+moved);
  for(const b of balls){
   if(Math.hypot(b.x,b.y)>JAR_RADIUS-ballRadius+0.01 ||
      b.z<ballRadius-0.01 || b.z>1.75-ballRadius+0.01)
    throw Error('Ball escaped the sealed jar');
  }
  const after=await snapshot();
  if(after.max-after.min<24||initial.checksum===after.checksum)
   throw Error('Shaking did not change GPU image '+JSON.stringify({initial,after}));
  // Switch to the maximum count and verify real 50-bead rendering and inertial response.
  setCount(50);
  balls=getBalls();ballRadius=getRadius();
  const count50=balls.length;
  if(count50!==50)throw Error('Maximum marbles count is '+count50);
  const maxBefore=await snapshot();
  const initial50=balls.map(b=>[b.x,b.y,b.z]);
  shakeImpulse(balls,1.2);
  for(let step=0;step<38;step++)integrate(balls,ballRadius,.016,[3,-2,0],Number(friction.value));
  const moved50=balls.filter((b,i)=>Math.hypot(b.x-initial50[i][0],b.y-initial50[i][1],b.z-initial50[i][2])>.1).length;
  if(moved50<35)throw Error('50-ball shake only moved '+moved50);
  const maxAfter=await snapshot();
  if(maxBefore.checksum===maxAfter.checksum)throw Error('50-ball GPU image not updated');
  // Verify motion input goes opposite the physical acceleration.
  const mockBefore=motion.intensity;
  motion.inject({acceleration:{x:12,y:-8,z:3}});
  const applied=motion.sample(.016);
  if(applied[0]>=-1||applied[1]<=1||motion.intensity<=mockBefore)
   throw Error('Motion inertia sign incorrect: '+JSON.stringify(applied));
  setPhase('ok',{moved,activeCount:balls.length,moved50,
   before:initial,after,maxBefore,maxAfter,applied,jarRadius:JAR_RADIUS});
  document.documentElement.dataset.test='ok';
  status.textContent='CI OK: jar, shake, GPU pixels, device motion';
 }finally{texture.destroy();output.destroy();}
}