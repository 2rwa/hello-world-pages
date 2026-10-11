export const groups=[
 ['Particles',[
  ['count','粒子数',650,25,2400,25],['size','Gaussian半径',.145,.025,.4,.005],['sizeVariance','粒径のばらつき',.58,0,1,.02],
  ['density','霧の濃度',.55,.01,2,.025],['opacity','粒子の透明度',.28,.02,1,.02],['spread','雲の広がり',.92,.2,1,.02],
  ['shape','分布','cloud',['cloud','shell','band','uniform']],['seed','ランダムSeed',7,1,999,1]
 ]],
 ['Dynamics',[
  ['speed','時間速度',1,0,3,.05],['flow','流速',.16,0,1,.01],['windX','風 X',.03,-.5,.5,.01],
  ['windY','風 Y',.02,-.5,.5,.01],['windZ','風 Z',0,-.5,.5,.01],['swirl','渦の強さ',.85,-3,3,.05],
  ['turbulence','乱流',.65,0,2,.025],['buoyancy','浮力',.035,-.5,.5,.005],
  ['damping','速度減衰',.34,0,2,.02],['bounce','壁面の反射',.32,0,1,.025]
 ]],
 ['Appearance',[
  ['hue','色相',.53,0,1,.01],['saturation','色の鮮やかさ',.45,0,1,.025],['colorVariation','色のばらつき',.25,0,1,.025],
  ['noise','霧の模様',.62,0,1,.025],['wisps','筋状の流れ',.65,0,2,.025],['softness','粒子のぼかし',.7,.1,2,.025],
  ['lighting','光の散乱',.86,0,2,.05],['anisotropy','前方散乱',.45,0,.95,.025],
  ['lightAngle','照明方位',.2,-3.14,3.14,.05],['shell','球殻の光沢',.72,0,2,.05]
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
export function buildControls(root,state,changed){
 const references={};
 for(const [category,items] of groups){
  const detail=document.createElement('details');detail.open=['Particles','Dynamics'].includes(category);
  const heading=document.createElement('summary');heading.textContent=category;detail.append(heading);
  for(const [id,label,value,min,max,step] of items){
   const ctrl=document.createElement('div');ctrl.className='control';
   const name=document.createElement('label');name.htmlFor=id;name.textContent=label;
   const output=document.createElement('output');output.id=id+'Value';name.append(output);ctrl.append(name);
   let input;if(Array.isArray(min)){input=document.createElement('select');for(const option of min){const entry=document.createElement('option');entry.textContent=option;entry.value=option;input.append(entry);}}
   else{input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;}
   input.id=id;ctrl.append(input);detail.append(ctrl);references[id]=[input,output];
   input.addEventListener('input',()=>{state[id]=Array.isArray(min)?input.value:+input.value;
     output.textContent=typeof state[id]==='number'?state[id].toFixed(step<.01?3:step<1?2:0):state[id];changed(id);});
  }root.append(detail);
 }
 const presetBox=document.createElement('div');presetBox.className='presets';
 for(const [key,values] of Object.entries(presets)){
  const btn=document.createElement('button');btn.textContent=key.toUpperCase();btn.dataset.preset=key;
  btn.addEventListener('click',()=>{for(const [k,v] of Object.entries(values))setValue(k,v);changed('preset');});
  presetBox.append(btn);
 }root.prepend(presetBox);
 function setValue(id,value){const ref=references[id];if(!ref)throw Error('Missing setting '+id);ref[0].value=value;ref[0].dispatchEvent(new Event('input',{bubbles:true}));}
 for(const [key,value] of Object.entries(state))setValue(key,value);
 return setValue;
}
