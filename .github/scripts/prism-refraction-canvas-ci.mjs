import WebSocket from 'ws';
import assert from 'node:assert/strict';
const sleep = ms => new Promise(r => setTimeout(r,ms));
const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
const page=pages.find(p=>p.type==='page' && p.url.includes('/prism-refraction-lab/'));
assert.ok(page,'Lab tab not found');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok,no)=>{socket.once('open',ok);socket.once('error',no)});
let next=0;const pending=new Map();const consoleErrors=[];
socket.on('message',raw=>{
 const obj=JSON.parse(String(raw));
 if(obj.method==='Runtime.exceptionThrown') consoleErrors.push(obj.params?.exceptionDetails?.text);
 if(obj.method==='Log.entryAdded')consoleErrors.push(obj.params?.entry?.text);
 if(!pending.has(obj.id))return;
 const p=pending.get(obj.id);pending.delete(obj.id);
 if(obj.error)p.reject(Error(JSON.stringify(obj.error)));else p.resolve(obj.result);
});
function call(method,params={}){
 return new Promise((resolve,reject)=>{
  const id=++next;pending.set(id,{resolve,reject});
  socket.send(JSON.stringify({id,method,params}));
 });
}
async function evalJS(expression){
 const r=await call('Runtime.evaluate',{expression,returnByValue:true});
 if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
 return r.result?.value;
}
await call('Runtime.enable');await call('Page.enable');await call('Log.enable');
await call('Page.navigate',{url:'http://127.0.0.1:8766/prism-refraction-lab/?canvas-regression=1'});
let result=null;const expires=Date.now()+45000;
while(Date.now()<expires){
 try{
  result=await evalJS(`({status:window.__labTest?.status,stage:window.__labTest?.stage,
  frames:window.__labTest?.frames,error:window.__labTest?.error||'',
  deviceLost:window.__labTest?.lost||'',context:document.querySelector('canvas')?.getContext('webgpu')!==null,
  presentation:window.__labTest?.presentation||'unknown',
  fallbackReason:window.__labTest?.presentationReason||'',
  presentedFrames:window.__labTest?.presentedFrames||0,
  cpuDisplay:(()=>{const el=document.getElementById('fallback-display');
    if(!el)return null;
    const image=el.getContext('2d').getImageData(0,0,el.width,el.height).data;
    let minimum=255,maximum=0,nonblack=0;
    for(let i=0;i<image.length;i+=64){
      const intensity=image[i]+image[i+1]+image[i+2];
      minimum=Math.min(minimum,intensity);
      maximum=Math.max(maximum,intensity);
      if(intensity>10)nonblack++;
    }
    return {width:el.width,height:el.height,minimum,maximum,nonblack};
  })(),
  frameSize:[document.querySelector('canvas')?.width,document.querySelector('canvas')?.height]})`);
 }catch(e){console.log('Read transient:',String(e).slice(0,120))}
 if(result?.status==='ok' && result?.frames>=3 &&
    (result.presentation!=='offscreen-webgpu-canvas2d' || result.presentedFrames>=2))break;
 if(result?.status==='error')break;
 await sleep(600);
}
console.log('Canvas production path state',JSON.stringify(result));
console.log('Chrome diagnostics:',JSON.stringify(consoleErrors));
if(result?.status==='error')throw Error('Production Canvas path error: '+result.error);
assert.equal(result?.status,'ok','Canvas renderer never became ready');
assert.ok(result.frames>=3,'Animation loop did not submit multiple canvas frames');
assert.ok(result.frameSize[0]>0&&result.frameSize[1]>0,'Bad canvas dimensions');
assert.ok(['webgpu-canvas','offscreen-webgpu-canvas2d'].includes(result.presentation),
  'Unknown production presentation: '+result.presentation);
if(result.presentation==='offscreen-webgpu-canvas2d'){
  assert.ok(result.presentedFrames>=2,'Offscreen GPU-to-Canvas2D copy did not complete');
  assert.ok(result.cpuDisplay?.maximum-result.cpuDisplay?.minimum>25,
    'CPU fallback presented flat/blank image '+JSON.stringify(result.cpuDisplay));
  assert.ok(result.cpuDisplay.nonblack>100,'CPU fallback pixels are blank');
}
console.log('PASS real production WebGPU presentation:',result.presentation,
  'frames',result.frames,'displayed',result.presentedFrames);
socket.close();
