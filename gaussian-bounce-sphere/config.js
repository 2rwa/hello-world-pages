export const definitions = [
  ['Particles',[
    ['count','粒子数',24,1,100,1],['sigma','Gaussian σ',.105,.035,.20,.005],['threshold','表面の閾値',.55,.15,1.4,.025],['amplitude','密度',1,.2,2,.05],['colorShift','色相変化',.4,0,1, .01],['colorMix','色の混ざり',.8,0,1,.05]
  ]],
  ['Motion',[
    ['speed','移動スピード',1,0,3,.05],['bounce','壁の反発率',.94,.1,1,.01],['wallFriction','壁の摩擦',.02,0,.5,.01],['repulsion','粒子反発',.085,0,.35,.005],['attraction','粒子間引力',0,0,.25,.005],['damping','速度減衰',.002,0,.03,.001],['gravity','重力',0,-1.5,1.5,.05],['turbulence','乱流',.08,0,.8,.025],['pulse','自然振動',.12,0,1,.025],['collisionGlow','衝突発光',1.5,0,5,.1]
  ]],
  ['Surface / Volume',[
    ['mode','表示モード','hybrid',['solid','cloud','hybrid','debug']],['material','質感','gel',['gel','glass','plasma']],['opacity','表面不透明度',.92,.1,1,.02],['cloudDensity','Cloud密度',.9,.05,3,.05],['glow','発光',1.1,0,4,.05],['roughness','表面粗さ',.22,.02,.95,.01],['specular','反射光沢',1.1,0,3,.05],['lightOrbit','照明回転',.2,0,3,.05],['marchSteps','描画ステップ',72,24,160,4]
  ]],
  ['Fog / Atmosphere',[
    ['fogMode','霧の種類','off',['off','ambient','particles','mixed']],
    ['fogDensity','霧の濃度',.7,0,4,.05],
    ['fogParticle','粒子周辺の霧',1.2,0,4,.1],
    ['fogScale','霧の模様スケール',7,1,24,.5],
    ['fogFlow','霧の流速',.35,0,3,.05],
    ['fogNoise','霧の揺らぎ',.65,0,1,.05],
    ['fogAbsorb','光の減衰',1.1,.1,4,.05],
    ['fogAnisotropy','前方散乱',.35,0,.85,.05],
    ['fogHue','霧の色相',.56,0,1,.01],
    ['fogScatter','散乱光の強さ',1.1,.1,3,.05],
    ['fogHeight','霧の中心高度',0,-1,1,.05],
    ['fogFalloff','高さ方向の減衰',.5,0,5,.1]
  ]],
  ['Glass / Ripple',[
    ['shellOpacity','球殻透明度',.65,0,1,.025],['ior','ガラス屈折率',1.45,1,2.0,.025],['refraction','屈折の強度',.75,0,1,.05],['shellTint','球殻色',.55,0,1,.05],['ripple','衝突波紋',.9,0,2,.05],['rippleFrequency','波紋の細かさ',24,6,60,1],['rippleSpeed','波紋伝播速度',2,.5,5,.1]
  ]],
  ['Post / Camera',[
    ['bloom','Bloom',.75,0,2,.05],['bloomRadius','Bloom半径',1.8,.5,4,.1],['bloomThreshold','発光しきい値',.60,.1,2,.05],['exposure','露出',1.15,.3,3,.05],['trail','残像',.20,0,.92,.02],['vignette','周辺減光',.35,0,1,.05],['cameraDistance','カメラ距離',3.35,2.1,6,.05],['rotation','自動回転',0,-1,1,.02]
  ]],
  ['Performance',[
    ['quality','画質','auto',['auto','low','medium','high','ultra']],['targetFps','目標FPS',30,15,60,5],['resolution','内部描画倍率',.7,.30,1,.05],['maxDpr','DPR上限',1.5,1,3,.25],['spatial','空間分割','on',['on','off']],['rayCull','GPUレイ候補選別','on',['on','off']],['showStats','性能表示','on',['on','off']]
  ]]
];
export const initial = Object.fromEntries(definitions.flatMap(([,rows])=>rows.map(([id,,value])=>[id,value])));
export const clamp=(x,low,high)=>Math.max(low,Math.min(high,x));
export function makeSettings(container,state,changed){
  for(const [group,rows] of definitions){
    const section=document.createElement('details');section.open=['Particles','Motion','Performance'].includes(group);
    const label=document.createElement('summary');label.textContent=group;section.append(label);
    for(const [id,name,value,min,max,step] of rows){
      const wrapper=document.createElement('div');wrapper.className='ctrl';
      const lab=document.createElement('label');lab.htmlFor=id;lab.textContent=name;
      const output=document.createElement('output');output.id=id+'Out';output.textContent=String(value);
      lab.append(output);wrapper.append(lab);
      let input;
      if(Array.isArray(min)){
        input=document.createElement('select');for(const val of min){const option=document.createElement('option');option.value=val;option.textContent=val;input.append(option);}input.value=value;
      }else{input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=value;}
      input.id=id;input.setAttribute('aria-label',name);
      input.addEventListener('input',()=>{state[id]=Array.isArray(min)?input.value:Number(input.value);output.textContent=Array.isArray(min)?input.value:Number(input.value).toFixed(step<.01?3:step<1?2:0);changed(id);});
      wrapper.append(input);section.append(wrapper);
    }container.append(section);
  }
  return (id,v)=>{const element=document.getElementById(id);if(!element)return;element.value=v;element.dispatchEvent(new Event('input',{bubbles:true}));};
}
