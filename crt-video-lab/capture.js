// Canvas recorder. Camera sound comes from the capture stream and is NOT played back.
export function createCapture({canvas,video,getSource,onNotice=()=>{},onError=console.error}){
  let recorder=null,recorded=[],captureStream=null,activeClones=[];
  let audioCtx=null,audioNode=null,audioDest=null;
  const triggerDownload=(blob,name)=>{
    const address=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=address;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(address),30000);
  };
  async function fileAudio(){
    if(!window.AudioContext&&!window.webkitAudioContext)return [];
    if(!audioCtx){
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      audioNode=audioCtx.createMediaElementSource(video);
      audioDest=audioCtx.createMediaStreamDestination();
      audioNode.connect(audioDest);
      audioNode.connect(audioCtx.destination);
    }
    await audioCtx.resume();
    return audioDest.stream.getAudioTracks();
  }
  function stop(){
    if(recorder&&recorder.state!=='inactive')recorder.stop();
  }
  async function record({fps=30,audio=true}={}){
    if(recorder&&recorder.state!=='inactive'){stop();return false;}
    if(typeof canvas.captureStream!=='function'||!window.MediaRecorder)
      throw new Error('このブラウザはCanvas動画録画に非対応です。');
    const source=getSource();
    captureStream=canvas.captureStream(fps);
    let soundTracks=[];
    if(audio){
      try {
        if(source.kind==='camera')soundTracks=source.stream?.getAudioTracks()||[];
        else if(source.kind==='file')soundTracks=await fileAudio();
      }catch(error){onNotice('音声は保存できません: '+error.message);}
    }
    activeClones=soundTracks.map(track=>track.clone());
    const mixed=new MediaStream([...captureStream.getVideoTracks(),...activeClones]);
    const options=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm'];
    const mimeType=options.find(type=>MediaRecorder.isTypeSupported(type))||'';
    try{
      recorder=new MediaRecorder(mixed,mimeType?{mimeType,videoBitsPerSecond:7_500_000}:{videoBitsPerSecond:7_500_000});
      recorded=[];
      recorder.ondataavailable=event=>{if(event.data?.size)recorded.push(event.data);};
      recorder.onerror=event=>onError(event.error||new Error('録画に失敗しました'));
      recorder.onstop=()=>{
        const type=recorder.mimeType||mimeType||'video/webm';
        if(recorded.length && window.__crtLab)window.__crtLab.lastRecording={
          size:recorded.reduce((size,part)=>size+part.size,0),audio:activeClones.length>0,type
        };
        if(recorded.length)triggerDownload(new Blob(recorded,{type}),
          'crt-'+source.kind+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+(type.includes('mp4')?'mp4':'webm'));
        for(const track of captureStream?.getTracks()||[])track.stop();
        for(const track of activeClones)track.stop();
        activeClones=[];captureStream=null;
        document.getElementById('record').classList.remove('active');
        document.getElementById('record').textContent='● 録画';
        onNotice(recorded.length?'録画を保存しました':'録画データが空でした');
      };
      recorder.start(500);
      document.getElementById('record').classList.add('active');
      document.getElementById('record').textContent='■ 録画停止';
      onNotice('録画中 '+(recorder.mimeType||'自動')+' / '+fps+'fps'+(soundTracks.length?' +音声':' / 無音'));
      return true;
    }catch(error){
      for(const track of captureStream.getTracks())track.stop();
      for(const track of activeClones)track.stop();
      activeClones=[];captureStream=null;throw error;
    }
  }
  async function snapshot(){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob?.size)throw new Error('PNG保存に失敗しました。再生した状態でお試しください');
    triggerDownload(blob,'crt-frame-'+Date.now()+'.png');
  }
  function destroy(){stop();if(audioCtx)audioCtx.close().catch(()=>{});}
  return {record,stop,snapshot,destroy,get active(){return recorder?.state==='recording';}};
}
