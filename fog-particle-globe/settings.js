export const groups=[
 ['Particles',[
  ['count','粒子数',650,25,2400,25],['size','Gaussian半径',.145,.025,.4,.005],['sizeVariance','粒径のばらつき',.58,0,1,.02],
  ['density','霧の濃度',.55,.025,2,.025],['opacity','粒子の透明度',.28,.02,1,.02],['spread','雲の広がり',.92,.2,1,.02],
  ['shape','分布','cloud',['cloud','shell','band','uniform']],['seed','ランダムSeed',7,1,999,1]
 ]],
 ['Dynamics',[
  ['speed','時間速度',1,0,3,.05],['flow','流速',.16,0,1,.01],['windX','風 X',.03,-.5,.5,.01],
  ['windY','風 Y',.02,-.5,.5,.01],['windZ','風 Z',0,-.5,.5,.01],['swirl','渦の強さ',.85,-3,3,.05],
  ['turbulence','乱流',.65,0,2,.025],['buoyancy','浮力',.035,-.5,.5,.005],
  ['damping','速度減衰',.34,0,2,.02],['bounce','壁面の反射',.32,0,1,.01]
 ]],
 ['Appearance',[
  ['hue','色相',.53,0,1,.01],['saturation','色の鮮やかさ',.45,0,1,.025],['colorVariation','色のばらつき',.25,0,1,.025],
  ['noise','霧の模様',.62,0,1,.025],['wisps','筋状の流れ',.65,0,2,.025],['softness','粒子のぼかし',.7,.1,2,.025],
  ['lighting','光の散乱',.86,0,2,.05],['anisotropy','前方散乱',.45,0,.95,.025],
  ['lightAngle','照明方位',.2,-3.15,3.15,.05],['shell','球殻の光沢',.72,0,2,.05]
 ]],
 ['Post / Quality',[
  ['bloom','Bloom',.55,0,2,.05],['bloomRadius','Bloom半径',2,1,5,1],['trail','残像',.12,0,.9,.025],
  ['exposure','露出',1.15,.3,3,.05],['vignette','周辺減光',.30,0,1,.025],
  ['resolution','内部解像度',.72,.3,1,.025],['quality','画質','auto',['auto','low','medium','high','ultra']],
  ['targetFps','自動画質 目標FPS',30,15,60,5],['showStats','性能表示','on',['on','off']]
 ]]
];
export const stateDefault=Object.fromEntries(groups.flatMap(([,rows])=>rows.map(([k,,val])=>[k,val])));
export const presets={
 mist:{count:650,shape:'cloud',size:.145,density:.55,opacity:.28,flow:.16,swirl:.85,turbulence:.65,hue:.53,saturation:.45,noise:.62,trail:.12},
 smoke:{count:950,shape:'band',size:.18,density:.82,opacity:.37,flow:.13,swirl:1.1,turbulence:1.2,hue:.10,saturation:.13,noise:.9,trail:.25},
 nebula:{count:1100,shape:'cloud',size:.18,density:.48,opacity:.42,flow:.19,swirl:.5,turbulence:.42,hue:.82,saturation:.92,noise:.62,lighting:1.55,bloom:1.25},
 storm:{count:1350,shape:'shell',size:.09,density:.7,opacity:.32,flow:.36,swirl:2.25,turbulence:1.7,hue:.53,saturation:.60,trail:.18}
};
export const settingMeta=new Map(groups.flatMap(([,rows])=>rows.map(row=>[row[0],row])));
export function normalizeSettings(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const result={};
 for(const [id,value] of Object.entries(raw)){
  const meta=settingMeta.get(id);if(!meta)continue;
  const options=meta[3];
  if(Array.isArray(options)){if(typeof value==='string'&&options.includes(value))result[id]=value;continue;}
  const numeric=typeof value==='number'?value:Number(value);
  if(!Number.isFinite(numeric))continue;
  const [low,high,step]=meta.slice(3,6);
  const snapped=low+Math.round((Math.max(low,Math.min(high,numeric))-low)/step)*step;
  result[id]=Math.max(low,Math.min(high,Number(snapped.toFixed(6))));
 }
 return result;
}
export function buildControls(root,state,changed){
 const refs=new Map();
 const sections=new Map();
 let count=0;
 const fmt=(num,step)=>step>=1?String(Math.round(num)):String(Number(num.toFixed(step<.01?4:3)));
 for(const [category,items] of groups){
  const detail=document.createElement('details');detail.className='control-section';
  detail.dataset.category=category;detail.open=['Particles','Dynamics'].includes(category);
  const summary=document.createElement('summary');summary.textContent=category+' · '+items.length+'項目';detail.append(summary);
  for(const meta of items){
   const [id,label,defaultValue,low,high,step]=meta;
   const wrapper=document.createElement('div');wrapper.className='control';wrapper.dataset.setting=id;wrapper.dataset.search=(label+' '+id+' '+category).toLowerCase();
   const name=document.createElement('label');name.htmlFor=id;name.textContent=label;
   const output=document.createElement('output');output.id=id+'Value';name.append(output);wrapper.append(name);
   let range=null,number=null,select=null;
   if(Array.isArray(low)){
    select=document.createElement('select');select.id=id;select.setAttribute('aria-label',label);
    for(const val of low){const option=document.createElement('option');option.value=val;option.textContent=val;select.append(option);}
    wrapper.append(select);
   }else{
    const row=document.createElement('div');row.className='adjust-row';
    range=document.createElement('input');range.id=id;range.type='range';range.min=String(low);range.max=String(high);range.step=String(step);range.setAttribute('aria-label',label);
    number=document.createElement('input');number.id=id+'Number';number.type='number';number.min=String(low);number.max=String(high);
    number.step=String(step);number.setAttribute('aria-label',label+'の数値を直接入力');number.inputMode='decimal';
    row.append(range,number);wrapper.append(row);
   }
   const reflect=()=>{
    const value=state[id];output.textContent=typeof value==='number'?fmt(value,step):String(value);
    if(range)range.value=String(value);
    if(number)number.value=fmt(value,step);
    if(select)select.value=String(value);
   };
   const apply=(value)=>{
    const norm=normalizeSettings({[id]:value});
    if(!Object.hasOwn(norm,id)){reflect();return;}
    if(state[id]!==norm[id]){state[id]=norm[id];reflect();changed(id);}else reflect();
   };
   range?.addEventListener('input',()=>apply(range.value));
   number?.addEventListener('change',()=>apply(number.value));
   select?.addEventListener('change',()=>apply(select.value));
   detail.append(wrapper);refs.set(id,{reflect,wrapper});count++;
  }
  sections.set(category,detail);root.append(detail);
 }
 const presetBox=document.createElement('div');presetBox.className='presets';
 for(const [key,values] of Object.entries(presets)){
  const btn=document.createElement('button');btn.textContent=key.toUpperCase();btn.dataset.preset=key;
  btn.addEventListener('click',()=>{setAll(values);changed('preset');});presetBox.append(btn);
 }
 root.prepend(presetBox);
 function setValue(id,value){
  if(!refs.has(id))throw Error('Unknown setting '+id);
  const normalized=normalizeSettings({[id]:value});
  if(!Object.hasOwn(normalized,id))throw Error('Invalid setting '+id);
  if(state[id]!==normalized[id]){state[id]=normalized[id];refs.get(id).reflect();changed(id);}
  else refs.get(id).reflect();
 }
 function setAll(raw){
  const patch=normalizeSettings(raw);let different=false;
  for(const [id,value] of Object.entries(patch)){
   if(state[id]!==value){different=true;state[id]=value;}
   refs.get(id).reflect();
  }
  if(different)changed('batch');
  return Object.keys(patch).length;
 }
 function filter(search){
  const term=String(search||'').trim().toLowerCase();
  let visible=0;
  presetBox.hidden=!!term;
  for(const [category,detail] of sections){
   let sectionHits=0;
   for(const wrapper of detail.querySelectorAll('.control')){
    const match=!term||wrapper.dataset.search.includes(term);
    wrapper.hidden=!match;
    if(match){visible++;sectionHits++;}
   }
   detail.hidden=sectionHits===0;
   if(term&&sectionHits)detail.open=true;
  }
  return visible;
 }
 for(const value of refs.values())value.reflect();
 setValue.setAll=setAll;
 setValue.filter=filter;
 setValue.count=count;
 return setValue;
}
