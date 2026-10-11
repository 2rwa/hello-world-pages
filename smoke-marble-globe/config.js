export const sections=[
 ['Smoke spheres',[
 ['count','煙球の数',72,8,192,1],['radius','基本半径',.115,.035,.24,.005],
 ['radiusVariance','球サイズのばらつき',.36,0,.9,.01],
 ['initialSpread','初期分布の広がり',.84,.15,1,.01],
 ['softCollision','球の押し戻し',1.2,0,4,.05],
 ['interactionRange','相互作用距離',3.2,1.2,5,.05],
 ['stirStrength','かき混ぜの勢い',.75,.05,2,.05],
 ['seed','乱数Seed',47,1,9999,1]
 ]],
 ['Oil / Water Separation',[
 ['phaseRatio','A相の割合',.50,0,1,.01],['sameAttraction','同相間の引力',1.05,0,4,.05],
 ['phaseRepulsion','異相間の反発',2.4,0,7,.05],
 ['cohesion','球のまとまり',.16,0,2,.02]
 ]],
 ['Glass-shy interface',[
 ['wallRepulsion','ガラス反発',2.8,0,9,.1],['wallGap','ガラスとの間隔',.115,0,.35,.005],
 ['wallRange','壁反発の作用範囲',.12,0,.4,.01],
 ['wallBounce','衝突反発率',.52,0,1,.02],
 ['wallSlip','壁沿いの滑り',.84,0,1,.02],
 ['shellOpacity','ガラスの存在感',.80,0,2,.05],
 ['shellTint','ガラスの青み',.62,0,1,.02],
 ['impactGlow','接触時の光',.95,0,3,.05]
 ]],
 ['Motion',[
 ['speed','時間速度',1,0,3,.05],['swirl','渦の力',.55,-3,3,.05],
 ['turbulence','乱流',.44,0,2,.02],
 ['windX','風 X',0,-1,1,.02],['windY','風 Y',0,-1,1,.02],
 ['windZ','風 Z',0,-1,1,.02],['buoyancy','浮力',.08,-1,1,.02],
 ['damping','速度減衰',.8,0,3,.05],['maxVelocity','最高速度',1.45,.15,3,.05]
 ]],
 ['Smoke / Lighting',[
 ['hueA','A相 色相',.54,0,1,.01],['hueB','B相 色相',.06,0,1,.01],
 ['saturation','色の鮮やかさ',.72,0,1,.02],['opacity','煙の濃度',.45,.02,1,.02],
 ['softness','煙表面のぼかし',1.15,.3,3,.05],['noise','煙の細かな乱れ',.65,0,2,.05],
 ['wisp','煙の筋模様',.82,0,2,.05],['core','球の芯の強さ',.35,0,2,.05],
 ['lightIntensity','光の散乱',1.1,.1,3,.05],['lightAngle','光の方角',.35,-3.15,3.15,.05],
 ['bloom','Bloom',.65,0,2,.05],['bloomRadius','Bloom半径',2,1,5,1],
 ['trail','残像',.12,0,.9,.02],['exposure','露出',1.22,.25,3,.05],
 ['vignette','周辺減光',.28,0,1,.02]
 ]],
 ['Camera / Performance',[
 ['resolution','内部解像度',.78,.3,1,.02],
 ['quality','画質','auto',['auto','low','medium','high','ultra']],
 ['targetFps','自動画質目標FPS',30,15,60,5],
 ['cameraDistance','カメラ距離',3.15,2.2,5.5,.05],
 ['showStats','FPS表示','on',['on','off']]
 ]]
];
export const initial=Object.fromEntries(sections.flatMap(([,rows])=>rows.map(row=>[row[0],row[2]])));
export const defs=new Map(sections.flatMap(([,rows])=>rows.map(r=>[r[0],r])));
export const presets={
 'Glass Shy':{count:72,phaseRatio:.5,wallRepulsion:4.8,wallGap:.18,wallRange:.23,wallSlip:.94,phaseRepulsion:2.4,radius:.115,opacity:.42,sameAttraction:1.1},
 'Oil / Water':{count:88,phaseRatio:.5,sameAttraction:2.0,phaseRepulsion:5.2,softCollision:.8,cohesion:.28,wallRepulsion:2.6,swirl:.22},
 'Smoke Pearls':{count:44,radius:.16,phaseRatio:.6,softness:1.65,opacity:.28,core:.5,wallGap:.12,phaseRepulsion:1.3},
 'Storm':{count:96,radius:.095,swirl:1.9,turbulence:1.35,buoyancy:.22,phaseRepulsion:2.6,trail:.24},
 'Mist':{count:128,radius:.075,softness:2.25,opacity:.19,phaseRepulsion:.7,sameAttraction:.35,noise:1.35,core:.08}
};
export function normalized(raw){
 const out={};if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
 for(const [name,input] of Object.entries(raw)){
  const def=defs.get(name);if(!def)continue;
  const options=def[3];
  if(Array.isArray(options)){if(options.includes(input))out[name]=input;continue;}
  if(input===''||input===null)continue;
  const value=Number(input);if(!Number.isFinite(value))continue;
  const [low,high,step]=def.slice(3,6);
  const safe=Math.min(high,Math.max(low,value));
  const aligned=low+Math.round((safe-low)/step)*step;
  out[name]=Number(Math.min(high,Math.max(low,aligned)).toFixed(6));
 }
 return out;
}
export function createControls(parent,settings,onChange){
 const refs=new Map(),accordions=[];
 const render=(val,step)=>typeof val!=='number'?String(val):step>=1?String(Math.round(val)):String(Number(val.toFixed(step<.01?4:3)));
 for(const [section,rows] of sections){
  const group=document.createElement('details');group.className='group';group.dataset.group=section;
  group.open=['Smoke spheres','Oil / Water Separation','Glass-shy interface'].includes(section);
  const summary=document.createElement('summary');summary.textContent=section+' · '+rows.length;group.append(summary);
  for(const def of rows){
   const [id,name,initialValue,low,high,step]=def;
   const row=document.createElement('div');row.className='control';row.dataset.search=(id+' '+name+' '+section).toLowerCase();row.dataset.param=id;
   const label=document.createElement('label');label.htmlFor=id;label.textContent=name;
   const out=document.createElement('output');out.id=id+'Output';label.append(out);row.append(label);
   let range,num,select;
   if(Array.isArray(low)){
    select=document.createElement('select');select.id=id;
    for(const opt of low){const o=document.createElement('option');o.value=opt;o.textContent=opt;select.append(o);}
    row.append(select);
   }else{
    const pair=document.createElement('div');pair.className='pair';
    range=document.createElement('input');range.type='range';range.min=low;range.max=high;range.step=step;range.id=id;
    num=document.createElement('input');num.type='number';num.min=low;num.max=high;num.step=step;num.id=id+'Number';num.setAttribute('aria-label',name+'の数値入力');
    pair.append(range,num);row.append(pair);
   }
   const reflect=()=>{const value=settings[id];out.textContent=render(value,step);if(range)range.value=value;if(num)num.value=render(value,step);if(select)select.value=value;};
   const update=value=>{
    const output=normalized({[id]:value});if(!Object.hasOwn(output,id)){reflect();return;}
    const changed=settings[id]!==output[id];settings[id]=output[id];reflect();if(changed)onChange(id);
   };
   range?.addEventListener('input',()=>update(range.value));
   num?.addEventListener('change',()=>update(num.value));
   select?.addEventListener('change',()=>update(select.value));
   refs.set(id,{reflect,row});group.append(row);
  }accordions.push(group);parent.append(group);
 }
 function setAll(raw){
  const patch=normalized(raw);const changed=[];
  for(const [key,value] of Object.entries(patch)){
   if(settings[key]!==value){settings[key]=value;changed.push(key);}
   refs.get(key).reflect();
  }
  if(changed.length)onChange('batch',changed);
  return Object.keys(patch).length;
 }
 function setValue(key,value){if(!defs.has(key))throw Error('Unknown control '+key);return setAll({[key]:value});}
 function search(term){
  term=String(term||'').trim().toLowerCase();let total=0;
  for(const group of accordions){
   let count=0;
   for(const row of group.querySelectorAll('.control')){
    const match=!term||row.dataset.search.includes(term);row.hidden=!match;if(match){count++;total++;}
   }
   group.hidden=count===0;if(term&&count)group.open=true;
  }return total;
 }
 for(const ref of refs.values())ref.reflect();
 return {setAll,setValue,search,count:refs.size};
}
