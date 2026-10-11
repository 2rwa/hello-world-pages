// Source lifecycle: camera, local file, synthetic canvas. Nothing is uploaded.
export function createSources(video,{onReady=()=>{},onStop=()=>{},onNotice=()=>{}}={}){
  let current='none', mediaStream=null, fileUrl='', demoId=0, generation=0;
  let label='', facing='user';
  const terminate=stream=>{if(stream)for(const track of stream.getTracks())track.stop();};
  function clear(){
    generation++;video.pause();
    if(demoId){cancelAnimationFrame(demoId);demoId=0;}
    video.srcObject=null;
    terminate(mediaStream);mediaStream=null;
    if(fileUrl){URL.revokeObjectURL(fileUrl);fileUrl='';}
    video.removeAttribute('src');video.load();
    current='none';label='';onStop();
  }
  async function waitVideo(token){
    if(token!==generation)return false;
    try{await video.play();}catch(error){
      if(token!==generation)return false;
      throw error;
    }
    if(token!==generation)return false;
    onReady({type:current,label,facing,stream:current==='camera'?mediaStream:null,
      width:video.videoWidth,height:video.videoHeight});
    return true;
  }
  function testPattern(ctx,now){
    const w=640,h=360;
    const grad=ctx.createLinearGradient(0,0,w,h);
    grad.addColorStop(0,'#101929');grad.addColorStop(1,'#303957');
    ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#ffffff24';ctx.lineWidth=1;
    for(let x=0;x<w;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    ['#f4f4f4','#f9e400','#08e5ed','#0ce145','#d400df','#fa2d3f','#2639ec']
      .forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(i*w/7,30,w/7,82);});
    ctx.fillStyle='#07101e';ctx.fillRect(30,135,580,174);
    ctx.fillStyle='#fff';ctx.font='bold 35px monospace';ctx.fillText('CRT  VIDEO  LAB',60,181);
    ctx.fillStyle='#8ee7d1';ctx.font='20px monospace';ctx.fillText('CAMERA / VIDEO / ANALOG',60,228);
    ctx.fillStyle='#a9b9ce';ctx.font='14px monospace';ctx.fillText('LIVE TEST '+(now/1000).toFixed(1)+'s',60,269);
    ctx.fillStyle='#9cefff';ctx.shadowBlur=22;ctx.shadowColor='#64cfee';
    ctx.beginPath();ctx.arc(505+45*Math.sin(now/650),216+32*Math.cos(now/710),24,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.fillRect((now*.18)%w,329,60,12);
  }
  async function demo(){
    clear();const token=generation;
    const image=document.createElement('canvas');image.width=640;image.height=360;
    const ctx=image.getContext('2d',{alpha:false});
    if(!ctx||!image.captureStream)throw new Error('テストパターン非対応');
    const paint=now=>{testPattern(ctx,now);demoId=requestAnimationFrame(paint);};
    paint(0);mediaStream=image.captureStream(30);
    video.srcObject=mediaStream;video.muted=true;video.loop=true;
    current='demo';label='テストパターン';facing='environment';
    await waitVideo(token);
    return true;
  }
  async function file(selected){
    if(!selected||(!selected.type.startsWith('video/')&&!/\.(mp4|webm|mov|m4v|ogv)$/i.test(selected.name)))throw new Error('動画ファイルを選択してください');
    clear();const token=generation;
    fileUrl=URL.createObjectURL(selected);video.src=fileUrl;video.muted=false;video.loop=false;
    current='file';label=selected.name;facing='environment';
    try{await new Promise((resolve,reject)=>{
      if(video.readyState>=1){resolve();return;}
      const loaded=()=>{remove();resolve();};
      const failed=()=>{remove();reject(new Error('動画の形式またはコーデックを読み込めません'));};
      const remove=()=>{video.removeEventListener('loadedmetadata',loaded);video.removeEventListener('error',failed);};
      video.addEventListener('loadedmetadata',loaded);video.addEventListener('error',failed);
      video.load();
    });
    if(token!==generation)return false;
    await waitVideo(token);return true;
    }catch(error){if(token===generation)clear();throw error;}
  }
  async function camera({deviceId='',facingMode='user',width=1280,height=720,microphone=false}={}){
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)
      throw new Error('カメラ利用にはHTTPSとgetUserMedia対応ブラウザが必要です');
    // Camera switching on mobile requires releasing the previous hardware track.
    if(current==='camera')clear();
    const token=++generation;
    // Prefer a portrait capture size while held vertically; these are ideals,
    // so the browser may still select a landscape sensor mode.
    const portrait=window.matchMedia?.('(orientation: portrait)').matches??window.innerHeight>window.innerWidth;
    const idealWidth=portrait?Math.min(width,height):Math.max(width,height);
    const idealHeight=portrait?Math.max(width,height):Math.min(width,height);
    const videoConstraints={
      width:{ideal:idealWidth},height:{ideal:idealHeight},
      aspectRatio:{ideal:idealWidth/idealHeight},frameRate:{ideal:30,max:30}
    };
    if(deviceId)videoConstraints.deviceId={exact:deviceId};
    else videoConstraints.facingMode={ideal:facingMode};
    let acquired;
    try {
      acquired=await navigator.mediaDevices.getUserMedia({
        video:videoConstraints,audio:microphone?{echoCancellation:true,noiseSuppression:true}:false
      });
      if(token!==generation){terminate(acquired);return false;}
      // Switching away from a demo/file is delayed until camera permission is granted.
      clear();
      const activated=generation;
      mediaStream=acquired;
      video.srcObject=acquired;video.muted=true;video.loop=false;
      current='camera';label='ライブカメラ';
      facing=acquired.getVideoTracks()[0]?.getSettings()?.facingMode||facingMode;
      let track=acquired.getVideoTracks()[0];
      track.addEventListener('ended',()=>{
        if(current==='camera'&&mediaStream===acquired){
          clear();onNotice('カメラが停止しました。もう一度カメラを起動してください。');
        }
      });
      await waitVideo(activated);
      return true;
    }catch(error){
      if(acquired&&mediaStream!==acquired)terminate(acquired);
      const message={
        NotAllowedError:'カメラまたはマイクの権限が拒否されました。ブラウザのサイト権限を確認してください。',
        NotFoundError:'利用可能なカメラが見つかりません。',
        NotReadableError:'カメラが別のアプリで使用中の可能性があります。',
        OverconstrainedError:'指定したカメラや解像度を利用できません。自動設定をお試しください。',
        SecurityError:'カメラはHTTPS環境で使用してください。'
      }[error.name]||error.message||String(error);
      throw new Error(message);
    }
  }
  async function listDevices(){
    if(!navigator.mediaDevices?.enumerateDevices)return [];
    const devices=await navigator.mediaDevices.enumerateDevices();
    return devices.filter(item=>item.kind==='videoinput').map(item=>({id:item.deviceId,
      name:item.label||'カメラ'}));
  }
  function stopCamera(){if(current==='camera')clear();}
  function destroy(){clear();}
  return {demo,file,camera,listDevices,stopCamera,destroy,
    get kind(){return current},get stream(){return current==='camera'?mediaStream:null},
    get label(){return label},get facing(){return facing}};
}
