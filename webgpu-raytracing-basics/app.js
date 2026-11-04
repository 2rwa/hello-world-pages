/* WebGPU第6章: CPUは設定だけを送り、レイの交差判定と反射はGPUで実行する。 */
'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const offscreen=new URLSearchParams(location.search).has('ci');
  const body=document.body,canvas=$('gpu-canvas');
  let engine=null,working=false,dirty=false,renderVersion=0;

  const showStage=name=>{
    body.dataset.gpuStage=name;
    $('gpu-stage').textContent=name;
  };
  const settings=()=>{
    const width=Number($('resolution').value);
    return {
      width,height:Math.round(width*5/8),
      yaw:Number($('yaw').value),
      reflections:Number($('reflections').value),
      shadows:$('shadows').checked,
      brightness:Number($('brightness').value)
    };
  };
  function updateControls(s) {
    $('yaw-value').textContent=s.yaw+'°';
    $('reflection-value').textContent=String(s.reflections);
    $('brightness-value').textContent=s.brightness.toFixed(1)+'×';
  }
  function summarisePixels(bytes) {
    // presentation texture is BGRA8 on CI. Hash bytes without claiming RGBA channel order.
    let checksum=2166136261,variation=0;
    const reference=[bytes[0],bytes[1],bytes[2]];
    for(let idx=0;idx<bytes.length;idx+=64) {
      checksum=Math.imul(checksum^bytes[idx],16777619)>>>0;
      if(idx+2<bytes.length &&
        (Math.abs(bytes[idx]-reference[0])+Math.abs(bytes[idx+1]-reference[1])+
         Math.abs(bytes[idx+2]-reference[2]))>20)variation++;
    }
    return {checksum:checksum.toString(16).padStart(8,'0'),variation};
  }
  function schedule() {
    dirty=true;
    if(!working && engine)void flush();
  }
  async function flush() {
    if(working||!engine)return;
    working=true;
    try {
      while(dirty) {
        dirty=false;
        const s=settings();updateControls(s);
        const result=await engine.render(s,{readback:offscreen});
        const isOffscreen=result.pixelData!==null;
        let summary=null;
        if(isOffscreen) {
          summary=summarisePixels(result.pixelData);
          if(summary.variation<100)throw new Error('GPU readback shows no useful variation');
          body.dataset.gpuSignature=summary.checksum;
          body.dataset.gpuVariation=String(summary.variation);
        }
        body.dataset.gpuReady='ok';
        body.dataset.gpuVersion=String(++renderVersion);
        $('gpu-state').textContent='描画完了 · '+s.width+'×'+s.height+' · 反射 '+s.reflections+
          '回 · 影 '+(s.shadows?'ON':'OFF');
        $('gpu-timing').textContent='設定送信～GPU完了: '+result.wallMs.toFixed(1)+
          ' ms（CPU待機・GPUキューを含む経過時間。純粋なGPU計算時間ではありません）';
        $('gpu-details').textContent='Compute '+Math.ceil(s.width/8)+' × '+Math.ceil(s.height/8)+
          ' workgroups、各8×8スレッド · output rgba8unorm · presentation '+
          result.presentFormat+(summary?' · CI pixels hash '+summary.checksum:'');
      }
    }catch(error) {
      body.dataset.gpuReady='error';
      showStage('error');
      $('gpu-state').textContent=error.message;
      console.error(error);
    }finally{working=false;}
    if(dirty && body.dataset.gpuReady!=='error')schedule();
  }
  for(const id of ['resolution','yaw','reflections','shadows','brightness']){
    // input covers sliders, selects and checkbox; change would submit duplicate frames.
    $(id).addEventListener('input',schedule);
  }
  $('render-now').addEventListener('click',schedule);
  $('reset').addEventListener('click',()=>{
    $('resolution').value='384';
    $('yaw').value='0';
    $('reflections').value='1';
    $('shadows').checked=true;
    $('brightness').value='1';
    schedule();
  });
  async function initialize(){
    body.dataset.gpuReady='loading';
    showStage('script-start');
    if(offscreen)$('gpu-state').textContent='CI: canvasを使わずに同じWGSLでオフスクリーン出力を生成します';
    try{
      engine=await window.WebGPURayEngine.create({canvas,offscreen,onStage:showStage});
      $('gpu-adapter').textContent='WebGPU '+engine.presentFormat+
        ' · 最大テクスチャ '+engine.device.limits.maxTextureDimension2D;
      schedule();
    }catch(error){
      body.dataset.gpuReady=error.message.includes('使えません')?'unsupported':'error';
      showStage('error');
      $('gpu-state').textContent=error.message;
      console.error(error);
    }
  }
  void initialize();
})();
