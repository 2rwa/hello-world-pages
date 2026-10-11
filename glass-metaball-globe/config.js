export const groups=[
 ['Metaball Glass',[
 ['count','ガラス玉の数',14,1,28,1],['radius','玉の基本半径',.208,.075,.32,.005],
 ['variance','サイズばらつき',.32,0,.8,.02],['blend','融合の滑らかさ',.23,0,.55,.01],
 ['shapeNoise','表面のゆらぎ',.18,0,1,.02],['spread','初期の広がり',.65,.2,.9,.02],
 ['seed','乱数シード',27,1,9999,1]
 ]],
 ['Dynamics',[
 ['speed','速度',.7,0,3,.05],['swirl','回転流',.62,-3,3,.05],
 ['turbulence','乱流',.38,0,2,.02],['buoyancy','浮力',.045,-.5,.5,.005],
 ['cohesion','凝集',.18,0,2,.02],['repulsion','接触反発',.65,0,3,.05],
 ['damping','速度減衰',.52,0,3,.02],['wallBounce','外殻での反発',.65,0,1,.025],
 ['wallGap','外殻との隙間',.07,0,.25,.005]
 ]],
 ['Refraction / Glass',[
 ['ior','ガラス屈折率',1.48,1,2.25,.01],
 ['refraction','屈折の強さ',1,0,2,.05],['dispersion','色分散',.38,0,2,.05],
 ['fresnel','Fresnel反射',1.15,0,3,.05],['surfaceRoughness','表面粗さ',.15,0,1,.025],
 ['thickness','ガラス内部の吸収',.37,0,2,.05],
 ['hue','ガラス玉の色相',.53,0,1,.01],['saturation','ガラス玉の彩度',.58,0,1,.02],
 ['bodyTint','玉の色の濃さ',.50,0,1,.02],['specular','鏡面ハイライト',1.25,0,3,.05]
 ]],
 ['Outer Globe / Studio',[
 ['shell','外殻の光沢',.9,0,2,.05],['shellTint','外殻の青み',.56,0,1,.02],
 ['rim','輪郭の強さ',1.05,0,3,.05],['lightAngle','光の方角',.3,-3.15,3.15,.05],
 ['environment','背景照明',1.15,0,2,.05],['background','背景','studio',['studio','deepsea','night']],
 ['bloom','Bloom',.62,0,2,.05],['bloomRadius','Bloom半径',2,1,5,1],
 ['exposure','露出',1.15,.3,3,.05],['vignette','周辺減光',.22,0,1,.02],
 ['trail','残像',.08,0,.8,.02]
 ]],
 ['Performance / Camera',[
 ['resolution','内部解像度',.66,.25,1,.025],
 ['quality','画質','auto',['auto','low','medium','high','ultra']],
 ['targetFps','目標FPS',30,15,60,5],
 ['cameraDistance','カメラ距離',3.25,2.25,6,.05],
 ['showStats','統計表示','on',['on','off']],
 ['viewMode','表示','glass',['glass','normals','shape']]
 ]]
];
export const defaults=Object.fromEntries(groups.flatMap(([,items])=>items.map(row=>[row[0],row[2]])));
export const meta=new Map(groups.flatMap(([,items])=>items.map(row=>[row[0],row])));
export const presets={
 'Crystal':{count:14,blend:.23,ior:1.48,refraction:1,dispersion:.38,bodyTint:.50,hue:.53,swirl:.62,background:'studio'},
 'Liquid Glass':{count:19,radius:.235,blend:.44,cohesion:.5,repulsion:.20,shapeNoise:.22,ior:1.37,refraction:1.35,bodyTint:.46},
 'Prismatic':{count:12,blend:.20,ior:1.72,dispersion:1.55,refraction:1.4,fresnel:1.75,specular:1.9,hue:.83,saturation:.8,bloom:1.25},
 'Deep Sea':{count:18,blend:.37,background:'deepsea',hue:.48,saturation:.75,bodyTint:.75,swirl:1.2,buoyancy:.07},
 'Marbles':{count:9,radius:.275,blend:.015,repulsion:1.8,cohesion:.1,shapeNoise:.02,dispersion:.14}
};
export function normalize(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const result={};
 for(const [key,v] of Object.entries(raw)){
  const row=meta.get(key);if(!row)continue;
  const low=row[3],high=row[4],step=row[5];
  if(Array.isArray(low)){if(low.includes(v))result[key]=v;continue;}
  if(v==null||v==='')continue;
  const number=Number(v);if(!Number.isFinite(number))continue;
  const safe=Math.max(low,Math.min(high,number));
  result[key]=Number(Math.max(low,Math.min(high,low+Math.round((safe-low)/step)*step)).toFixed(6));
 }
 return result;
}
export function createControls(element,state,onChange){
 const refs=new Map(),sections=[];
 for(const [heading,rows] of groups){
  const section=document.createElement('details');section.className='section';section.dataset.section=heading;
  section.open=['Metaball Glass','Refraction / Glass'].includes(heading);
  const summary=document.createElement('summary');summary.textContent=heading+' · '+rows.length;section.append(summary);
  for(const row of rows){
   const [key,label,unused,low,high,step]=row;
   const control=document.createElement('div');control.className='control';control.dataset.key=key;control.dataset.search=(key+' '+label+' '+heading).toLowerCase();
   const name=document.createElement('label');name.htmlFor=key;name.textContent=label;
   const result=document.createElement('output');name.append(result);control.append(name);
   let range,num,select;
   if(Array.isArray(low)){
    select=document.createElement('select');select.id=key;
    for(const o of low){const option=document.createElement('option');option.value=o;option.textContent=o;select.append(option);}control.append(select);
   }else{
    const pair=document.createElement('div');pair.className='pair';
    range=document.createElement('input');range.type='range';range.id=key;range.min=low;range.max=high;range.step=step;
    num=document.createElement('input');num.type='number';num.id=key+'Number';num.min=low;num.max=high;num.step=step;
    num.setAttribute('aria-label',label+'の数値入力');pair.append(range,num);control.append(pair);
   }
   const refresh=()=>{
    let val=state[key];if(typeof val==='number')val=Number(val.toFixed(4));
    result.textContent=String(val);if(range)range.value=val;if(num)num.value=val;if(select)select.value=val;
   };
   const change=raw=>{const value=normalize({[key]:raw})[key];if(value===undefined)return refresh();
    const different=state[key]!==value;state[key]=value;refresh();if(different)onChange([key]);};
   range?.addEventListener('input',()=>change(range.value));
   num?.addEventListener('change',()=>change(num.value));
   select?.addEventListener('change',()=>change(select.value));
   refs.set(key,{refresh,control});section.append(control);
  }sections.push(section);element.append(section);
 }
 function setAll(raw){
  const safe=normalize(raw),changed=[];
  for(const [key,val] of Object.entries(safe)){if(state[key]!==val){state[key]=val;changed.push(key);}refs.get(key).refresh();}
  if(changed.length)onChange(changed);
  return Object.keys(safe).length;
 }
 function set(key,val){return setAll({[key]:val});}
 function search(term){
  term=String(term||'').trim().toLowerCase();let matches=0;
  for(const section of sections){
   let visible=0;
   for(const control of section.querySelectorAll('.control')){const ok=!term||control.dataset.search.includes(term);control.hidden=!ok;if(ok){visible++;matches++;}}
   section.hidden=visible===0;if(term&&visible)section.open=true;
  }
  return matches;
 }
 for(const entry of refs.values())entry.refresh();
 return {set,setAll,search,count:refs.size};
}
