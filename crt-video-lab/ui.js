export const defaults = Object.freeze({
  quality:1, compare:0, scanline:.72,mask:.68,curve:.2,bloom:.65,
  aberration:.32,noise:.06,jitter:.12,ghost:.24,
  chroma:.38,interference:.1,persistence:.45,
  brightness:.02,contrast:1.13,saturation:1.13,gamma:1.04,
  maskSize:3,maskType:1,scanCount:360,overscan:.08,
  bloomRadius:1.6,vignette:.42,beamWidth:1.35,flicker:.3
});
const groups=[
 ['電子ビーム・蛍光体',[
  ['scanline','走査線の強さ',0,1,.01],
  ['scanCount','走査線の本数',120,1080,10],
  ['beamWidth','電子ビーム幅',.3,4,.05],
  ['mask','RGBマスク強度',0,1,.01],
  ['maskSize','蛍光体サイズ (px)',1,12,.25],
  ['maskType','マスク形式',0,2,1],
  ['persistence','蛍光体残光',0,1,.01],
 ]],
 ['ブラウン管・光学',[
  ['curve','画面の湾曲',0,.9,.01],
  ['overscan','オーバースキャン',0,.8,.01],
  ['vignette','周辺減光',0,1,.01],
  ['bloom','発光 Bloom',0,2,.02],
  ['bloomRadius','にじみ半径',.3,5,.1],
  ['aberration','RGB色収差',0,2,.02],
  ['flicker','輝度フリッカー',0,1,.01],
 ]],
 ['アナログ信号 / VHS',[
  ['chroma','クロマ帯域制限',0,1,.01],
  ['ghost','右方向ゴースト',0,1,.01],
  ['jitter','水平同期ジッター',0,1,.01],
  ['noise','ランダムノイズ',0,1,.01],
  ['interference','走査干渉',0,1,.01],
 ]],
 ['色調・ガンマ',[
  ['brightness','明るさ',-.5,.5,.01],
  ['contrast','コントラスト',.2,2,.01],
  ['saturation','色の濃さ',0,2,.01],
  ['gamma','ガンマ',.3,2.5,.01],
 ]]
];
const presets=[
 ['PVM',{}],
 ['家庭用TV',{scanline:.88,scanCount:280,mask:.82,maskSize:4,curve:.35,bloom:1.05,bloomRadius:2.3,persistence:.55,noise:.14,chroma:.57,vignette:.6}],
 ['アーケード',{scanline:.7,scanCount:240,mask:.95,maskSize:5,maskType:2,curve:.42,bloom:1.35,contrast:1.3,saturation:1.25}],
 ['VHS劣化',{scanline:.35,mask:.3,noise:.55,jitter:.68,chroma:.88,ghost:.8,interference:.7,aberration:.8,persistence:.3}],
 ['素の映像',{scanline:0,mask:0,curve:0,bloom:0,aberration:0,noise:0,jitter:0,ghost:0,chroma:0,interference:0,persistence:0,vignette:0,flicker:0,overscan:0,contrast:1,saturation:1,brightness:0,gamma:1}]
];
export function buildUi(onUpdate) {
  let stored={};
  try{stored=JSON.parse(localStorage.getItem('crt-video-v1')||'{}');}catch{}
  const config={...defaults,...stored};
  const sliders=document.getElementById('sliders'),presetHolder=document.getElementById('presets');
  const controls=new Map();
  const changed=()=>{localStorage.setItem('crt-video-v1',JSON.stringify(config));onUpdate(config);};
  function refresh(){
    for(const [key,entry] of controls){
      entry.field.value=String(config[key]);
      entry.out.value=key==='maskType'?['無効','アパーチャ','スロット'][config[key]]:String(config[key]);
    }
    document.getElementById('quality').value=String(config.quality);
    document.getElementById('compareMode').value=String(config.compare);
    changed();
  }
  for(const [heading,fields] of groups){
    const section=document.createElement('details');
    section.open=heading==='電子ビーム・蛍光体'||heading==='ブラウン管・光学';
    const title=document.createElement('summary');title.textContent=heading;section.append(title);
    for(const [key,label,min,max,step] of fields){
      const row=document.createElement('div');row.className='control-row';
      const description=document.createElement('label');description.textContent=label;
      const out=document.createElement('output');
      let field;
      if(key==='maskType'){
        field=document.createElement('select');
        for(const [value,name] of [['0','無効'],['1','アパーチャ'],['2','スロット']]){
          const option=document.createElement('option');option.value=value;option.textContent=name;field.append(option);
        }
      } else {
        field=document.createElement('input');
        field.type='range';field.min=min;field.max=max;field.step=step;
      }
      field.id='setting-'+key;description.htmlFor=field.id;
      field.value=String(config[key]);out.value=key==='maskType'?['無効','アパーチャ','スロット'][config[key]]:String(config[key]);
      field.addEventListener('input',()=>{
        config[key]=Number(field.value);
        out.value=key==='maskType'?['無効','アパーチャ','スロット'][config[key]]:String(config[key]);
        changed();
      });
      row.append(description,field,out);section.append(row);controls.set(key,{field,out});
    }
    sliders.append(section);
  }
  for(const [name,overrides] of presets){
    const button=document.createElement('button');button.textContent=name;
    button.addEventListener('click',()=>{Object.assign(config,defaults,overrides);refresh();});
    presetHolder.append(button);
  }
  document.getElementById('quality').value=String(config.quality);
  document.getElementById('quality').addEventListener('change',event=>{config.quality=Number(event.target.value);changed();});
  document.getElementById('compareMode').value=String(config.compare);
  document.getElementById('compareMode').addEventListener('change',event=>{config.compare=Number(event.target.value);changed();});
  return {config,refresh};
}