import {loadBackgroundTexture} from './background-loader.js';

export function createMediaBackgroundController(options){
  const {gpuDevice,defaultTexture,backgroundFile,backgroundName,clearBackground,cameraStart,cameraStop,onTexture,setStatus}=options;
  let ownedTexture=null,cameraStream=null,cameraVideo=null,cameraCanvas=null,cameraContext=null,cameraActive=false;

  function destroyOwnedTexture(){
    if(ownedTexture){ownedTexture.destroy();ownedTexture=null;}
  }
  function stopTracks(){
    if(cameraStream){
      for(const track of cameraStream.getTracks())track.stop();
      cameraStream=null;
    }
    if(cameraVideo){
      cameraVideo.pause();
      cameraVideo.srcObject=null;
      cameraVideo.remove();
      cameraVideo=null;
    }
    cameraCanvas=null;
    cameraContext=null;
    cameraActive=false;
  }
  function activateTexture(textureValue,aspectValue,labelValue){
    destroyOwnedTexture();
    ownedTexture=textureValue;
    onTexture(textureValue,aspectValue,1);
    backgroundName.textContent=labelValue;
  }
  function useBuiltIn(){
    stopTracks();
    destroyOwnedTexture();
    backgroundFile.value='';
    onTexture(defaultTexture,16/9,0);
    backgroundName.textContent='built-in';
    setStatus('ok','ok');
  }

  backgroundFile.addEventListener('change',async()=>{
    try{
      const fileValue=backgroundFile.files?.[0];
      if(!fileValue)return;
      setStatus('background…');
      stopTracks();
      const loaded=await loadBackgroundTexture(gpuDevice,fileValue);
      activateTexture(loaded.texture,loaded.aspect,fileValue.name);
      setStatus('ok','ok');
    }catch(errorValue){
      console.error(errorValue);
      setStatus(`background: ${errorValue?.message||errorValue}`,'error');
    }
  });

  clearBackground.addEventListener('click',useBuiltIn);

  cameraStart.addEventListener('click',async()=>{
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('getUserMedia is unavailable');
      setStatus('camera permission…');
      stopTracks();
      destroyOwnedTexture();

      cameraStream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},
        audio:false
      });
      cameraVideo=document.createElement('video');
      cameraVideo.muted=true;
      cameraVideo.playsInline=true;
      cameraVideo.autoplay=true;
      cameraVideo.style.display='none';
      cameraVideo.srcObject=cameraStream;
      document.body.appendChild(cameraVideo);
      await cameraVideo.play();

      cameraCanvas=document.createElement('canvas');
      cameraCanvas.width=480;
      cameraCanvas.height=270;
      cameraContext=cameraCanvas.getContext('2d',{alpha:false});
      if(!cameraContext)throw new Error('2D camera staging canvas unavailable');

      const cameraTexture=gpuDevice.createTexture({
        size:[480,270,1],
        format:'rgba8unorm-srgb',
        usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT
      });
      activateTexture(cameraTexture,16/9,'camera');
      cameraActive=true;
      backgroundFile.value='';
      setStatus('camera · live','ok');
    }catch(errorValue){
      console.error(errorValue);
      stopTracks();
      onTexture(defaultTexture,16/9,0);
      backgroundName.textContent='built-in';
      setStatus(`camera: ${errorValue?.message||errorValue}`,'error');
    }
  });

  cameraStop.addEventListener('click',useBuiltIn);
  addEventListener('pagehide',stopTracks);

  function updateCameraFrame(){
    if(!cameraActive||!cameraVideo||!cameraContext||!ownedTexture||cameraVideo.readyState<2)return;
    const videoWidth=cameraVideo.videoWidth||480;
    const videoHeight=cameraVideo.videoHeight||270;
    const sourceAspect=videoWidth/videoHeight;
    const targetAspect=16/9;
    let sourceX=0,sourceY=0,sourceWidth=videoWidth,sourceHeight=videoHeight;
    if(sourceAspect>targetAspect){
      sourceWidth=videoHeight*targetAspect;
      sourceX=(videoWidth-sourceWidth)*0.5;
    }else{
      sourceHeight=videoWidth/targetAspect;
      sourceY=(videoHeight-sourceHeight)*0.5;
    }
    cameraContext.drawImage(cameraVideo,sourceX,sourceY,sourceWidth,sourceHeight,0,0,480,270);
    gpuDevice.queue.copyExternalImageToTexture({source:cameraCanvas},{texture:ownedTexture},[480,270]);
  }

  return {updateCameraFrame,useBuiltIn};
}
