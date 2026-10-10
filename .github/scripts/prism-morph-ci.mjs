import WebSocket from 'ws';
import assert from 'node:assert/strict';

const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const deadline = Date.now() + 65000;
let page;
while (!page && Date.now() < deadline) {
  try {
    const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
    page = pages.find(p => p.type === 'page' && p.url.includes('/prism-morph/'));
  } catch { /* Chrome is still starting. */ }
  if (!page) await pause(250);
}
assert.ok(page, 'Prism Morph page not found in Chrome');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject) => { ws.once('open',resolve); ws.once('error',reject); });
let nextId = 1;
const pending = new Map();
ws.on('message', data => {
  const packet = JSON.parse(String(data));
  if (!pending.has(packet.id)) return;
  const callback=pending.get(packet.id);pending.delete(packet.id);
  if (packet.error) callback.reject(Error(JSON.stringify(packet.error)));
  else callback.resolve(packet.result);
});
function command(method, params={}) {
  const id=nextId++;
  return new Promise((resolve,reject) => {
    pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression, awaitPromise=false) {
  const data=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise});
  if(data.exceptionDetails) throw Error(JSON.stringify(data.exceptionDetails));
  return data.result?.value;
}
await command('Runtime.enable');
let status, lastPhase='';
while (Date.now() < deadline) {
  status=await evaluate('window.__prismTest || null');
  if(status?.phase !== lastPhase){console.log('Phase',status?.phase,status?.shaderErrors);lastPhase=status?.phase;}
  if(status?.phase==='error')throw Error('WebGPU failed: '+status.error);
  if(status?.phase==='ok')break;
  await pause(350);
}
assert.equal(status?.phase,'ok','WebGPU did not complete readback');
assert.equal(status.shaderErrors.filter(item=>item.type==='error').length,0);
assert.ok(status.frames>=2,'No GPU frames submitted');
assert.ok(status.pixelStats?.max>status.pixelStats?.min+25,'Output is flat/blank');
assert.ok(status.pixelStats?.nonblack>100,'Output is nearly black');
console.log('Initial render:',status.pixelStats);
const result=await evaluate(`(async () => {
 const test=window.__prismTest;
 const slider=(id,v) => {const el=document.getElementById(id);el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));};
 const choose=(id,v) => {const el=document.getElementById(id);el.value=String(v);el.dispatchEvent(new Event('change',{bubbles:true}));};
 slider('morph',0);
 if(document.getElementById('morphOut').textContent!=='0.00')throw Error('Morph label');
 if(document.getElementById('auto').getAttribute('aria-pressed')!=='false')throw Error('Manual slider did not disable auto');
 const triangle=await test.capture();
 slider('morph',1);const circle=await test.capture();
 if(triangle.checksum===circle.checksum)throw Error('Morph control did not alter rendered pixels');
 slider('twist',1.2);const twisted=await test.capture();
 if(twisted.checksum===circle.checksum)throw Error('Twist did not alter rendered pixels');
 choose('palette',1);const purple=await test.capture();
 if(purple.checksum===twisted.checksum)throw Error('Palette did not alter rendered pixels');
 slider('ior',1.75);const ior=await test.capture();
 if(ior.checksum===purple.checksum)throw Error('IOR did not alter rendered pixels');
 slider('dispersion',0.09);const dispersion=await test.capture();
 if(dispersion.checksum===ior.checksum)throw Error('Dispersion did not alter rendered pixels');
 choose('quality','low');
 await test.capture();
 if(test.currentParams.quality!=='low')throw Error('Resolution selector ignored');
 document.getElementById('pause').click();
 if(document.getElementById('pause').getAttribute('aria-pressed')!=='true')throw Error('Pause not toggled');
 document.getElementById('auto').click();
 if(document.getElementById('auto').getAttribute('aria-pressed')!=='true')throw Error('Auto not toggled');
 return {triangle,circle,twisted,purple,ior,dispersion,frames:test.frames};
})()`,true);
assert.ok(result.frames>=7);
console.log('Interactive GPU redraw regression:',JSON.stringify(result));
ws.close();
console.log('PASS: real WebGPU shader, pipeline, offscreen pixel readback, control redraws');
