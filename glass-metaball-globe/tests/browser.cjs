const puppeteer=require('puppeteer-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:{width:1280,height:800}});
 const page=(await browser.pages()).find(p=>p.url().includes('glass-metaball-globe/'));
 if(!page)throw Error('CI browser tab missing');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.webgpuStatus),{timeout:90000});
 const boot=await page.evaluate(()=>({status:document.documentElement.dataset.webgpuStatus,
  stage:document.documentElement.dataset.webgpuStage,error:document.documentElement.dataset.webgpuError||'',
  pixels:document.documentElement.dataset.gpuPixels}));
 console.log('BOOT',boot);
 assert.equal(boot.status,'ok',boot.error);assert.equal(boot.stage,'done');
 assert.ok(JSON.parse(boot.pixels).centerEnergy>1000);
 const desktop=await page.evaluate(()=>{
  const p=document.getElementById('panel'),b=document.getElementById('toggle');
  const r=p.getBoundingClientRect(),t=b.getBoundingClientRect();
  const front=document.elementFromPoint(r.x+r.width/2,r.y+25);
  const toggleTop=document.elementFromPoint(t.x+t.width/2,t.y+t.height/2);
  return {panel:getComputedStyle(p).display,
   panelVisible:front===p||p.contains(front),
   controls:p.querySelectorAll('.control').length,
   panelRect:{x:r.x,y:r.y,w:r.width,h:r.height},
   button:getComputedStyle(b).display,
   buttonClickable:b===toggleTop||b.contains(toggleTop),
   count:document.getElementById('controlCount').textContent};
 });
 console.log('DESKTOP',desktop);
 assert.equal(desktop.panel,'flex');assert.equal(desktop.panelVisible,true);
 assert.ok(desktop.controls>35);assert.ok(desktop.panelRect.h>300);
 assert.ok(desktop.panelRect.x>0&&desktop.panelRect.x+desktop.panelRect.w<=1280);
 assert.equal(desktop.buttonClickable,true);
 await (await page.$('#captureCanvas')).screenshot({path:'/tmp/glass-metaball-initial.png'});
 const cases=[
  {name:'fused liquid',count:17,blend:.52,ior:1.47,viewMode:'glass',refraction:1.2},
  {name:'separate spheres',count:9,blend:0,radius:.29,viewMode:'glass'},
  {name:'chromatic crystal',count:16,dispersion:1.75,ior:1.75,viewMode:'glass'},
  {name:'surface normals diagnostic',count:14,viewMode:'normals',blend:.4},
  {name:'shape depth diagnostic',count:14,viewMode:'shape',blend:.4},
  {name:'28 moving glass balls',count:28,viewMode:'glass',blend:.23}
 ];
 for(let i=0;i<cases.length;i++){
  const options=cases[i];
  const data=await page.evaluate(async arg=>{
   const g=window.__glass;g.ui.setAll(arg);g.advance(.04);
   return {pixels:await g.draw(true),count:g.state.count,
    error:document.documentElement.dataset.webgpuError||''};
  },options);
  console.log('CASE',options.name,data);
  assert.equal(data.count,options.count);
  assert.ok(data.pixels.centerEnergy>1000,'Scene blank in '+options.name);
  assert.equal(data.error,'');
  if(i===0||i===2)await (await page.$('#captureCanvas')).screenshot({path:'/tmp/glass-metaball-case-'+i+'.png'});
 }
 const difference=await page.evaluate(async()=>{
  const g=window.__glass;
  g.ui.setAll({viewMode:'glass',trail:0,bloom:0,blend:0,dispersion:0,ior:1,refraction:0});
  const plain=await g.draw(true);
  g.ui.setAll({blend:.5,dispersion:1.5,ior:1.8,refraction:1.5});
  const glass=await g.draw(true);
  return {plain:plain.centerEnergy,glass:glass.centerEnergy,labels:{
    blend:document.getElementById('blendNumber').value,ior:document.getElementById('iorNumber').value}};
 });
 console.log('PIXEL DIFFERENCE',difference);
 assert.ok(Math.abs(difference.glass-difference.plain)>1000,'Glass optics must affect actual GPU pixels');
 const input=await page.evaluate(()=>{
  const number=document.getElementById('blendNumber');number.value='0.35';number.dispatchEvent(new Event('change',{bubbles:true}));
  return {state:window.__glass.state.blend,range:document.getElementById('blend').value};
 });
 console.log('NUMERIC',input);assert.equal(input.state,.35);assert.equal(+input.range,.35);
 await page.type('#search','屈折');
 const search=await page.evaluate(()=>({
  visible:document.querySelector('[data-key="ior"]').hidden,
  hidden:document.querySelector('[data-key="swirl"]').hidden,
  count:document.getElementById('resultCount').textContent
 }));
 console.log('SEARCH',search);assert.equal(search.visible,false);assert.equal(search.hidden,true);
 await page.click('#clearSearch');
 await page.click('[data-preset="Prismatic"]');
 assert.equal(await page.evaluate(()=>window.__glass.state.dispersion),1.55);
 const exported=await page.evaluate(()=>window.__glass.settingsJSON());
 assert.equal(exported.format,'Glass Metaball Globe');assert.ok(Object.keys(exported.settings).length>35);
 const loaded=await page.evaluate(()=>{
  window.__glass.importSettings({settings:{count:22,blend:.4,ior:1.67}});
  return {count:window.__glass.state.count,blend:window.__glass.state.blend,ior:window.__glass.state.ior};
 });
 console.log('JSON',loaded);assert.deepEqual(loaded,{count:22,blend:.4,ior:1.67});
 await page.click('#defaults');assert.equal(await page.evaluate(()=>window.__glass.state.count),14);
 await page.click('#toggle');assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('panel')).display),'none');
 await page.click('#toggle');assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('panel')).display),'flex');
 await page.click('#pause');assert.equal(await page.evaluate(()=>window.__glass.paused),true);
 await page.click('#pause');assert.equal(await page.evaluate(()=>window.__glass.paused),false);
 await page.click('#stir');await page.evaluate(()=>window.__glass.world.validate());
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.reload({waitUntil:'load'});
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.webgpuStatus),{timeout:90000});
 const mobile=await page.evaluate(()=>({
  status:document.documentElement.dataset.webgpuStatus,
  closed:document.getElementById('panel').classList.contains('closed'),
  toggle:getComputedStyle(document.getElementById('toggle')).display,
  canvasWidth:document.getElementById('view').getBoundingClientRect().width
 }));
 console.log('MOBILE',mobile);
 assert.equal(mobile.status,'ok');assert.equal(mobile.closed,true);assert.equal(mobile.toggle,'flex');assert.equal(mobile.canvasWidth,390);
 await page.click('#toggle');assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('panel')).display),'flex');
 assert.deepEqual(errors,[]);
 console.log('PASS: WebGPU, glass refraction optics, fusion control pixel regression, presets, JSON, desktop and mobile UI');
 await browser.disconnect();
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
