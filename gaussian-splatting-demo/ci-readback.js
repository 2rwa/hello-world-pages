// CI-only readback of the production Gaussian render target.
export async function readbackFrame(device,texture,format,width,height){
 const stride=Math.ceil(width*4/256)*256;
 const buffer=device.createBuffer({size:stride*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const encoder=device.createCommandEncoder();
 encoder.copyTextureToBuffer({texture},{buffer,bytesPerRow:stride,rowsPerImage:height},[width,height,1]);
 device.queue.submit([encoder.finish()]);
 await device.queue.onSubmittedWorkDone();
 await buffer.mapAsync(GPUMapMode.READ);
 const pixels=new Uint8Array(buffer.getMappedRange());
 const rgba=new Uint8ClampedArray(width*height*4);
 const bgra=format.startsWith('bgra');
 let populated=0,hash=2166136261;
 for(let y=0;y<height;y++){
  for(let x=0;x<width;x++){
   const i=y*stride+x*4,o=(y*width+x)*4;
   const r=pixels[i+(bgra?2:0)],g=pixels[i+1],b=pixels[i+(bgra?0:2)],a=pixels[i+3];
   if(y%8===0&&x%8===0){
    if(a>5)populated++;
    hash=Math.imul(hash^(r|(g<<8)|(b<<16)|(a<<24)),16777619);
   }
   const t=1-a/255;
   rgba[o]=r+9*t;rgba[o+1]=g+15*t;rgba[o+2]=b+29*t;rgba[o+3]=255;
  }
 }
 buffer.unmap();buffer.destroy();
 let preview=document.getElementById('ciPreview');
 if(!preview){
  preview=document.createElement('canvas');preview.id='ciPreview';
  preview.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;object-fit:contain';
  document.body.appendChild(preview);
 }
 preview.width=width;preview.height=height;
 preview.getContext('2d').putImageData(new ImageData(rgba,width,height),0,0);
 return {populated,hash:hash>>>0,width,height};
}
