// Normal GPUTexture compatible with a WGSL texture_external binding.
// This is useful when importExternalTexture rejects a video backend (e.g. CI SwiftShader).
export function makeVideoFallback(device,offline){
  let texture=null,sourceWidth=0,sourceHeight=0,uploadCanvas=null,ctx=null;
  function getView(video){
    const w=video.videoWidth,h=video.videoHeight;
    if(!texture||w!==sourceWidth||h!==sourceHeight){
      if(texture)texture.destroy();
      sourceWidth=w;sourceHeight=h;
      texture=device.createTexture({
        label:'video-fallback',size:[w,h],format:'rgba8unorm',
        usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST
      });
      uploadCanvas=null;
    }
    if(offline){
      // Deterministic non-black colors verify the actual shared input/screen shaders.
      const pixels=new Uint8Array(w*h*4);
      for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
          const offset=(y*w+x)*4;
          pixels[offset]=Math.round(x/w*250);
          pixels[offset+1]=Math.round(y/h*245);
          pixels[offset+2]=55+(Math.floor(x/60)%3)*90;
          pixels[offset+3]=255;
        }
      }
      device.queue.writeTexture({texture},pixels,{bytesPerRow:w*4,rowsPerImage:h},[w,h,1]);
    }else{
      try {
        device.queue.copyExternalImageToTexture({source:video},{texture},[w,h]);
      }catch {
        if(!uploadCanvas){
          uploadCanvas=document.createElement('canvas');
          uploadCanvas.width=w;uploadCanvas.height=h;
          ctx=uploadCanvas.getContext('2d',{willReadFrequently:true});
        }
        if(!ctx)throw new Error('Video fallback 2D context unavailable');
        ctx.drawImage(video,0,0,w,h);
        const pixels=ctx.getImageData(0,0,w,h).data;
        device.queue.writeTexture({texture},pixels,{bytesPerRow:w*4,rowsPerImage:h},[w,h,1]);
      }
    }
    return texture.createView();
  }
  return {getView,dispose(){if(texture)texture.destroy();}};
}