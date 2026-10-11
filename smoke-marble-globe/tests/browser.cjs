const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
(async()=>{
 const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:{width:1280,height:800}});
 const page=(await browser.pages()).find(p=>p.url().includes('smoke-marble-globe/'));
 if(!page)throw Error('No smoke-marble testing tab');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.webgpuStatus),{timeout:90000});
 const boot=await page.evaluate(()=>({status:document.documentElement.dataset.webgpuStatus,
  stage:document.documentElement.dataset.webgpuStage,
  error:document.documentElement.dataset.webgpuError||'',
  pixels:document.documentElement.dataset.webgpuPixels}));
 console.log('BOOT',boot);
 assert.equal(boot.status,'ok',boot.error);
 assert.equal(boot.stage,'done');assert.ok(JSON.parse(boot.pixels).brightness>1000);
 // Desktop: panel must be on-screen, contain real controls, and have a visible toggle.
 const layout=await page.evaluate(()=>{
  const panel=document.getElementById('panel'),toggle=document.getElementById('toggle');
  const rect=panel.getBoundingClientRect(),t=toggle.getBoundingClientRect();
  const front=document.elementFromPoint(rect.x+rect.width/2,rect.y+24);
  const btn=document.elementFromPoint(t.x+t.width/2,t.y+t.height/2);
  return {visible:getComputedStyle(panel).display==='flex',rect:{x:rect.x,y:rect.y,w:rect.width,h:rect.height},
   controls:panel.querySelectorAll('.control').length,
   foreground:front===panel||panel.contains(front),
   toggle:getComputedStyle(toggle).display,clickable:btn===toggle||toggle.contains(btn),width:innerWidth};
 });
 console.log('DESKTOP LAYOUT',layout);
 assert.equal(layout.visible,true);assert.ok(layout.rect.w>=340&&layout.rect.h>280);
 assert.ok(layout.rect.x>0&&layout.rect.x+layout.rect.w<=1280);
 assert.ok(layout.controls>=40);assert.equal(layout.foreground,true);
 assert.equal(layout.clickable,true);assert.equal(layout.toggle,'flex');
 await page.screenshot({path:'/tmp/smoke-marble-desktop.png'});
 const states=[
  {name:'oil-water separation',preset:'Oil / Water',count:88,phaseRepulsion:5.2},
  {name:'strong glass rejection',preset:'Glass Shy',count:72,wallGap:.18},
  {name:'smoke-pearls',preset:'Smoke Pearls',count:44},
  {name:'storm vortex',preset:'Storm',count:96},
  {name:'mist',preset:'Mist',count:128}
 ];
 for(let k=0;k<states.length;k++){
  const row=states[k];
  const result=await page.evaluate(async args=>{
   const app=window.__smoke;
   app.controls.setAll(args);app.advance(.08);
   return {count:app.settings.count,phases:app.world.bodies.slice(0,app.settings.count).filter(p=>p.phase===0).length,
     pixels:await app.draw(true),error:document.documentElement.dataset.webgpuError||''};
  },row);
  console.log('GPU',row.name,result);
  assert.equal(result.count,row.count);assert.ok(result.pixels.nonblack>80);
  assert.equal(result.error,'');
  if(k===0)await (await page.$('#debug-capture')).screenshot({path:'/tmp/smoke-marble-oil-water.png'});
 }
 const contrast=await page.evaluate(async()=>{
  const app=window.__smoke;
  app.controls.setAll({count:96,trail:0,bloom:0,opacity:.02});const transparent=await app.draw(true);
  app.controls.setAll({opacity:.96});const opaque=await app.draw(true);
  return {transparent:transparent.brightness,opaque:opaque.brightness};
 });
 console.log('PIXEL CONTRAST',contrast);
 assert.ok(Math.abs(contrast.transparent-contrast.opaque)>1500,'Opacity must change real GPU pixels');
 const manual=await page.evaluate(async()=>{
  const input=document.getElementById('phaseRepulsionNumber');
  input.value='6.25';input.dispatchEvent(new Event('change',{bubbles:true}));
  const result=await window.__smoke.draw(true);
  return {value:window.__smoke.settings.phaseRepulsion,
   slider:document.getElementById('phaseRepulsion').value,
   brightness:result.brightness};
 });
 console.log('DIRECT EDIT',manual);
 assert.equal(manual.value,6.25);assert.equal(Number(manual.slider),6.25);
 await page.type('#paramSearch','ガラス');
 const matches=await page.evaluate(()=>({
  wall:document.querySelector('[data-param=wallGap]').hidden,
  smoke:document.querySelector('[data-param=radius]').hidden,
  count:document.getElementById('resultCount').textContent
 }));
 assert.equal(matches.wall,false);assert.equal(matches.smoke,true);assert.match(matches.count,/項目/);
 await page.click('#clearSearch');
 await page.click('[data-preset="Oil / Water"]');
 assert.equal(await page.evaluate(()=>window.__smoke.settings.phaseRepulsion),5.2);
 const json=await page.evaluate(()=>window.__smoke.exportObject());
 assert.equal(json.format,'Smoke Marble Globe');assert.ok(Object.keys(json.settings).length>=40);
 const loaded=await page.evaluate(()=>{window.__smoke.importObject({settings:{count:125,wallGap:.2,phaseRepulsion:6.5,hueA:.85}});
  return {count:window.__smoke.settings.count,wall:window.__smoke.settings.wallGap,
   label:document.getElementById('countNumber').value};});
 console.log('IMPORT',loaded);
 assert.deepEqual(loaded,{count:125,wall:.2,label:'125'});
 await page.click('#restore');
 assert.equal(await page.evaluate(()=>window.__smoke.settings.count),72);
 await page.click('#toggle');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('panel')).display),'none');
 await page.click('#toggle');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('panel')).display),'flex');
 await page.click('#pause');assert.equal(await page.evaluate(()=>window.__smoke.paused),true);
 await page.click('#pause');assert.equal(await page.evaluate(()=>window.__smoke.paused),false);
 await page.click('#stir');await page.evaluate(()=>window.__smoke.world.validate());
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.reload({waitUntil:'load'});
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.webgpuStatus),{timeout:90000});
 const mobile=await page.evaluate(()=>({
  status:document.documentElement.dataset.webgpuStatus,
  closed:document.getElementById('panel').classList.contains('closed'),
  toggle:getComputedStyle(document.getElementById('toggle')).display,
  width:document.getElementById('view').getBoundingClientRect().width
 }));
 console.log('MOBILE',mobile);
 assert.equal(mobile.status,'ok');assert.equal(mobile.closed,true);assert.equal(mobile.toggle,'flex');assert.equal(mobile.width,390);
 await page.click('#toggle');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('panel')).display),'flex');
 assert.deepEqual(errors,[]);
 console.log('PASS Smoke Marble: WebGPU render, five modes, real opacity delta, phase forces, glass, desktop UI, mobile UI, search, presets, settings');
 await browser.disconnect();
})().catch(e=>{console.error(e.stack||e);process.exit(1);});