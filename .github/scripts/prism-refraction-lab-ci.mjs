import WebSocket from 'ws';
import assert from 'node:assert/strict';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=Date.now()+180000;
let page;
while(!page && Date.now()<until){
 try{
  const list=await(await fetch('http://127.0.0.1:9222/json')).json();
  page=list.find(row=>row.type==='page' && row.url.includes('/prism-refraction-lab/'));
 }catch{}
 if(!page)await sleep(300);
}
assert.ok(page,'Chrome page not found');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
let sequence=0;
const pending=new Map();
socket.on('message',data=>{
 const msg=JSON.parse(String(data));
 if(!pending.has(msg.id))return;
 const task=pending.get(msg.id);pending.delete(msg.id);
 if(msg.error)task.reject(Error(JSON.stringify(msg.error)));
 else task.resolve(msg.result);
});
function command(method,params={}){
 return new Promise((resolve,reject)=>{
  const id=++sequence;
  pending.set(id,{resolve,reject});
  socket.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression,awaitPromise=false){
 const output=await command('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});
 if(output.exceptionDetails)throw Error(JSON.stringify(output.exceptionDetails));
 return output.result.value;
}
await command('Runtime.enable');
let lastPhase='',state;
while(Date.now()<until){
 state=await evaluate(`({
  status:window.__labTest?.status,stage:window.__labTest?.stage,
  error:window.__labTest?.error,errors:window.__labTest?.errors,
  frames:window.__labTest?.frames,readbacks:window.__labTest?.readbacks,
  lastCapture:window.__labTest?.lastCapture
 })`);
 if(state.stage!==lastPhase){lastPhase=state.stage;console.log('WebGPU stage:',state.stage);}
 if(state.status==='error')throw Error('Page WebGPU error: '+state.error);
 if(state.status==='ok')break;
 await sleep(500);
}
assert.equal(state?.status,'ok','WebGPU failed to initialize');
assert.equal(state.errors.filter(item=>item.type==='error').length,0,'WGSL validation');
assert.ok(state.frames>=1 && state.readbacks>=1,'No real GPU frame readback');
assert.ok(state.lastCapture.color.max-state.lastCapture.color.min>22,'Composite blank');
assert.ok(state.lastCapture.scene.max-state.lastCapture.scene.min>22,'Background blank');
console.log('Initial two-pass GPU pixels',JSON.stringify(state.lastCapture));

const tests=await evaluate(`(async()=>{
 const d=window.__labTest;
 const change=(id,value,evt='input')=>{
  const element=document.getElementById(id);
  if(!element)throw Error('Missing control '+id);
  element.value=String(value);
  element.dispatchEvent(new Event(evt,{bubbles:true}));
 };
 const assertDifferent=(a,b,label)=>{
  if(a.color.checksum===b.color.checksum)throw Error(label+' produced unchanged composite pixels');
 };
 const base=await d.capture();
 change('morph',0);const triangle=await d.capture();
 change('morph',1);const cylinder=await d.capture();
 assertDifferent(triangle,cylinder,'SDF morph');
 if(document.getElementById('morphVal').textContent!=='1.00')throw Error('Morph readout not updated');
 if(d.params.auto)throw Error('Manual morph did not disable auto');
 change('twist',1.15);const twisted=await d.capture();
 assertDifferent(cylinder,twisted,'Twist');
 change('ior',1.92);const highIOR=await d.capture();
 assertDifferent(twisted,highIOR,'IOR');
 change('dispersion',0);const noDispersion=await d.capture();
 change('dispersion',0.14);const dispersion=await d.capture();
 assertDifferent(noDispersion,dispersion,'Dispersion');
 change('absorption',1.4);const absorbed=await d.capture();
 assertDifferent(dispersion,absorbed,'Absorption');
 change('bounces',0,'change');const noBounce=await d.capture();
 change('bounces',2,'change');const twoBounce=await d.capture();
 assertDifferent(noBounce,twoBounce,'Internal reflected paths');
 change('caustics',0);const noCaustics=await d.capture();
 change('caustics',2);const caustics=await d.capture();
 if(noCaustics.scene.checksum===caustics.scene.checksum)throw Error('Background caustics pass unchanged');
 change('palette',1,'change');const amber=await d.capture();
 assertDifferent(caustics,amber,'Palette');
 change('debug',1,'change');const normals=await d.capture();
 change('debug',2,'change');const thickness=await d.capture();
 change('debug',3,'change');const reflectionDebug=await d.capture();
 assertDifferent(normals,thickness,'Normal versus thickness diagnostic');
 assertDifferent(thickness,reflectionDebug,'Thickness versus reflections diagnostic');
 change('debug',0,'change');
 change('quality','.4','change');const low=await d.capture();
 change('quality','.85','change');const high=await d.capture();
 if(high.color.width<=low.color.width)throw Error('Resolution selector did not resize GPU targets');
 document.getElementById('pause').click();
 if(!d.params.paused)throw Error('Pause button ignored');
 document.getElementById('auto').click();
 if(!d.params.auto)throw Error('Auto button ignored');
 document.getElementById('reset').click();
 if(Math.abs(d.params.yaw-.36)>0.001)throw Error('Orbit reset ignored');
 return {
  testNames:['morph','twist','ior','dispersion','absorption','internal-bounces',
  'background-caustics','palette','normal-debug','thickness-debug','bounce-debug','resolution','pause','auto','orbit-reset'],
  checksums:{base:base.color.checksum,triangle:triangle.color.checksum,
  cylinder:cylinder.color.checksum,noBounce:noBounce.color.checksum,
  twoBounce:twoBounce.color.checksum,caustics:caustics.scene.checksum,
  noCaustics:noCaustics.scene.checksum},
  frames:d.frames,readbacks:d.readbacks,
  lowResolution:[low.color.width,low.color.height],
  highResolution:[high.color.width,high.color.height]
 };
})()`,true);
assert.ok(tests.frames>=15 && tests.readbacks>=15);
console.log('PASS real GPU two-pass, multi-refraction, UI regression:',JSON.stringify(tests));
socket.close();
