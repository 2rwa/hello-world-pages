import {WaveGPU,N,W,centres,targets,quantize,intensity,windowEnergy,similarity,geometry} from './wave.js';
const $=id=>document.getElementById(id);
const status=(stage,detail='')=>{document.body.dataset.gpu=stage;$('status').textContent=stage+(detail?' | '+detail:'');};
const ci=new URLSearchParams(location.search).has('ci');
let gpu,busy=false,last=null;
const read=()=>({mode:$('mode').value,sep:+$('sep').value,offset:+$('offset').value,disparity:+$('disparity').value,lambda:+$('lambda').value,pitch:+$('pitch').value,distance:+$('distance').value});
function labels(){
 const p=read();$('sepOut').value=p.sep+' Fourier bins';$('offsetOut').value=p.offset+' bins';$('dispOut').value=p.disparity+' px';$('lambdaOut').value=p.lambda+' nm';$('pitchOut').value=p.pitch.toFixed(3)+' µm';$('distanceOut').value=p.distance.toFixed(2)+' m';
}
function paint(id,values,size,scale=1,style='gray',frames=[]){
 const c=$(id),ctx=c.getContext('2d'),temp=document.createElement('canvas');temp.width=temp.height=size;
 const tc=temp.getContext('2d'),img=tc.createImageData(size,size);
 for(let i=0;i<size*size;i++){
  let v=values[i],r,g,b;
  if(style==='phase'){let h=(v/(2*Math.PI)+1)%1;const a=h*6;r=Math.max(0,Math.min(1,Math.abs(a-3)-1));g=Math.max(0,Math.min(1,2-Math.abs(a-2)));b=Math.max(0,Math.min(1,2-Math.abs(a-4)));}
  else{v=Math.max(0,v/Math.max(scale,1e-30));if(style==='image'){const exp=$('exposure').value;if(exp==='sqrt')v=Math.sqrt(v);if(exp==='log')v=Math.log1p(20*v)/Math.log(21);}v=Math.min(1,v);r=g=b=v;}
  img.data[4*i]=255*r;img.data[4*i+1]=255*g;img.data[4*i+2]=255*b;img.data[4*i+3]=255;
 }
 tc.putImageData(img,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(temp,0,0,c.width,c.height);
 for(const f of frames){ctx.strokeStyle=f.color;ctx.lineWidth=1;ctx.strokeRect(f.x*c.width/size+.5,f.y*c.height/size+.5,W*c.width/size-1,W*c.height/size-1);}
}
function draw(data){
 const {p,desired,field,power,metrics}=data,cs=centres(p),full=new Float32Array(N*N),amp=new Float32Array(N*N),phase=new Float32Array(N*N);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const i=y*N+x,j=((y+N/2)%N)*N+(x+N/2)%N;
  full[i]=power[j];amp[i]=Math.hypot(field[2*i],field[2*i+1]);phase[i]=Math.atan2(field[2*i+1],field[2*i]);
 }
 const cut=c=>{const a=new Float32Array(W*W);for(let y=0;y<W;y++)for(let x=0;x<W;x++)a[y*W+x]=full[(N/2-W/2+y)*N+c-W/2+x];return a;};
 const left=cut(cs[0]),right=cut(cs[1]),max=Math.max(...left,...right,1e-30);
 paint('targetL',desired.images[0],W);paint('targetR',desired.images[1],W);
 paint('viewL',left,W,max,'image');paint('viewR',right,W,max,'image');
 paint('amplitude',amp,N);paint('phase',phase,N,1,'phase');
 paint('spectrum',full,N,max,'image',cs.map((c,i)=>({x:c-W/2,y:N/2-W/2,color:i?'#7fa9ff':'#75ffcf'})));
 const g=geometry(p),pct=v=>(100*v).toFixed(2)+'%',db=v=>v===0?'−∞ dB':(10*Math.log10(v)).toFixed(1)+' dB';
 $('metrics').replaceChildren(...[
 ['左像一致度',pct(metrics.left)],['右像一致度',pct(metrics.right)],['目的窓への光量',pct(metrics.efficiency)],['左→右漏れ',db(metrics.lr)],['右→左漏れ',db(metrics.rl)],['0次光',pct(metrics.dc)]
 ].map(([k,v])=>{const el=document.createElement('div');el.className='metric';const b=document.createElement('b');b.textContent=v;const s=document.createElement('span');s.textContent=k;el.append(b,s);return el;}));
 $('geometry').textContent='有効開口 '+g.aperture.toFixed(3)+' mm角、左右中心角 '+g.angles.map(a=>a.toFixed(2)+'°').join(' / ')+'、観測面の中心間隔 '+g.separation.toFixed(2)+' mm、中心付近の角度刻み '+g.binMrad.toFixed(3)+' mrad。離散モデルの範囲内のみ有効。5mm角にすると粗いセルになり視野が狭くなる。';
}
async function calculate(p,display=true){
 const desired=targets(p),cs=centres(p);
 const solve=async input=>{const raw=await gpu.transform(input,true),field=quantize(raw,p.mode),spectrum=await gpu.transform(field,false);return {field,power:intensity(spectrum)};};
 const both=await solve(desired.both),l=await solve(desired.left),r=await solve(desired.right);
 const e=both.power.reduce((a,b)=>a+b,0),le=windowEnergy(both.power,cs[0]),re=windowEnergy(both.power,cs[1]);
 const metrics={left:similarity(both.power,cs[0],desired.images[0]),right:similarity(both.power,cs[1],desired.images[1]),efficiency:(le+re)/e,dc:both.power[0]/e,
 lr:windowEnergy(l.power,cs[1])/Math.max(windowEnergy(l.power,cs[0]),1e-30),rl:windowEnergy(r.power,cs[0])/Math.max(windowEnergy(r.power,cs[1]),1e-30)};
 if(!Object.values(metrics).every(Number.isFinite))throw Error('non-finite optical metrics');
 const data={p,desired,...both,metrics};if(display){last=data;draw(data);}return data;
}
async function run(){if(busy)return;busy=true;$('run').disabled=true;try{status('computing');await calculate(read());status('ok','GPU DFT / readback 完了');}catch(e){status('error',String(e));console.error(e);}finally{busy=false;$('run').disabled=false;}}
for(const el of document.querySelectorAll('input,select'))el.addEventListener('input',labels);
$('exposure').addEventListener('change',()=>{if(last)draw(last);});$('run').addEventListener('click',run);
labels();
try{
 gpu=await WaveGPU.create(status);gpu.device.lost.then(info=>status('error','device.lost '+info.reason+' '+info.message));$('run').disabled=false;
 if(ci){
  status('selftest');const p=read();const ideal=await calculate({...p,mode:'complex'},false),binary=await calculate({...p,mode:'binary',offset:0},false),phase=await calculate({...p,mode:'phase4'},true);
  const m=ideal.metrics,b=binary.metrics;
  if(m.left<.999||m.right<.999||m.efficiency<.999||m.lr>1e-6||m.rl>1e-6)throw Error('ideal DFT reconstruction failed '+JSON.stringify(m));
  if(Math.abs(b.lr-1)>.01||Math.abs(b.rl-1)>.01)throw Error('binary conjugate symmetry failed '+JSON.stringify(b));
  if(!phase.field.some(v=>Math.abs(v)>.5))throw Error('phase field empty');
  // Real GPU output, nontrivial visible canvas readback.
  const pix=$('viewL').getContext('2d').getImageData(0,0,128,128).data;let lo=255,hi=0;for(let i=0;i<pix.length;i+=4){lo=Math.min(lo,pix[i]);hi=Math.max(hi,pix[i]);}if(hi-lo<20)throw Error('blank reconstruction canvas');
  window.__stereoTest={ideal:m,binary:b,phase4:phase.metrics,canvasRange:[lo,hi]};console.log('STEREO_TEST',JSON.stringify(window.__stereoTest));status('ok','selftest + GPU readback');
 }else await run();
}catch(e){status('error',String(e));console.error(e);}
