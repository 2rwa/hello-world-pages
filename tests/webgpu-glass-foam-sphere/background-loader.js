export async function loadBackgroundTexture(gpuDevice,fileValue){
  let bitmap=await createImageBitmap(fileValue);
  const limit=Math.min(2048,gpuDevice.limits.maxTextureDimension2D);
  if(bitmap.width>limit||bitmap.height>limit){
    const scale=Math.min(limit/bitmap.width,limit/bitmap.height);
    const resized=await createImageBitmap(bitmap,{
      resizeWidth:Math.max(1,Math.round(bitmap.width*scale)),
      resizeHeight:Math.max(1,Math.round(bitmap.height*scale)),
      resizeQuality:'high'
    });
    bitmap.close();
    bitmap=resized;
  }
  const texture=gpuDevice.createTexture({
    size:[bitmap.width,bitmap.height,1],
    format:'rgba8unorm-srgb',
    usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT
  });
  gpuDevice.queue.copyExternalImageToTexture({source:bitmap},{texture},[bitmap.width,bitmap.height]);
  const aspect=bitmap.width/bitmap.height;
  bitmap.close();
  return {texture,aspect};
}
