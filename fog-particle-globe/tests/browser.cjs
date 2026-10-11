const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
(async()=>{
 const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:{width:1000,height:700}});
 const page=(await browser.pages()).find(p=>p.url().includes('fog-particle-globe/'));
 if(!page)throw Error('Fog test page not opened');
 const browserErrors=[];page.on('pageerror',err=>browserErrors.push(String(err)));
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.webgpuStatus),{timeout:90000});
 let boot=await page.evaluate(()=>({status:document.documentElement.dataset.webgpuStatus,
  stage:document.documentElement.dataset.webgpuStage,
  error:document.documentElement.dataset.webgpuError||'',
  pixels:document.documentElement.dataset.webgpuPixels}));
 console.log('WEBGPU-BOOT',boot);
 assert.equal(boot.status,'ok',boot.error);assert.equal(boot.stage,'done');
 assert.ok(JSON.parse(boot.pixels).brightness>1000);
 const cases=[
  {name:'maximum 2400 particles',count:2400,density:1.3,opacity:.62,shape:'cloud'},
  {name:'thin atmospheric fog',count:1100,density:.28,opacity:.20,shape:'uniform'},
  {name:'ring/shell fog particles',count:1550,density:.75,opacity:.4,shape:'shell'},
  {name:'stormy band',count:1900,density:1.2,opacity:.57,shape:'band',swirl:2.5,turbulence:1.8},
  {name:'nebula bloom and color',count:1200,density:.75,hue:.85,saturation:1,bloom:1.6,lighting:1.4,trail:.4}
 ];
 for(let i=0;i<cases.length;i++){
  const row=cases[i];
  const result=await page.evaluate(async options=>{
   const f=window.__fog;
   for(const [key,value] of Object.entries(options))if(key!=='name')f.setValue(key,value);
   f.advance(.05);const pixels=await f.draw(true);
   return {count:f.state.count,shape:f.state.shape,width:f.view.width,
    error:document.documentElement.dataset.webgpuError||'',pixels};
  },row);
  console.log('CASE',row.name,result);
  assert.equal(result.count,row.count);assert.ok(result.pixels.brightness>1000);
  assert.equal(result.error,'');
  if(i===0||i===3)await (await page.$('#debug-capture')).screenshot({path:'/tmp/fog-particle-'+i+'.png'});
 }
 const diff=await page.evaluate(async()=>{
  const f=window.__fog;
  f.setValue('count',1500);f.setValue('shape','cloud');f.setValue('trail',0);f.setValue('bloom',0);
  f.setValue('density',.01);const thin=await f.draw(true);
  f.setValue('density',1.9);const dense=await f.draw(true);
  return {thin:thin.brightness,dense:dense.brightness,ui:document.getElementById('density').value,setting:f.state.density};
 });
 console.log('DENSITY-READBACK',diff);
 assert.equal(diff.setting,1.9);assert.equal(Number(diff.ui),1.9);
 assert.ok(Math.abs(diff.dense-diff.thin)>1400,'Density slider not visibly changing pixels');
 // Direct numeric editing must update both slider and GPU pixels.
 const manual=await page.evaluate(async()=>{
  const f=window.__fog,number=document.getElementById('densityNumber');
  const before=await f.draw(true);
  number.value='0.375';number.dispatchEvent(new Event('change',{bubbles:true}));
  const after=await f.draw(true);
  return {value:f.state.density,slider:document.getElementById('density').value,
   number:number.value,before:before.brightness,after:after.brightness};
 });
 console.log('NUMERIC-EDIT',manual);
 assert.equal(manual.value,.375);assert.equal(Number(manual.slider),.375);
 assert.equal(Number(manual.number),.375);
 assert.ok(Math.abs(manual.before-manual.after)>1200,'Numeric value did not alter GPU pixels');
 const mirrored=await page.evaluate(()=>{
  const input=document.getElementById('size');input.value='.205';
  input.dispatchEvent(new Event('input',{bubbles:true}));
  return {value:window.__fog.state.size,numeric:document.getElementById('sizeNumber').value};
 });
 assert.equal(mirrored.value,.205);assert.equal(Number(mirrored.numeric),.205);
 // Search must filter controls and reveal collapsed categories.
 await page.type('#controlSearch','色相');
 const filtered=await page.evaluate(()=>({
  value:document.getElementById('controlSearch').value,
  hueHidden:document.querySelector('[data-setting="hue"]').hidden,
  particleHidden:document.querySelector('[data-setting="count"]').hidden,
  appearanceOpen:document.querySelector('[data-category="Appearance"]').open,
  count:document.getElementById('resultCount').textContent
 }));
 console.log('SEARCH',filtered);
 assert.equal(filtered.hueHidden,false);
 assert.equal(filtered.particleHidden,true);
 assert.equal(filtered.appearanceOpen,true);
 assert.match(filtered.count,/\d+ \/ \d+ 項目/);
 await page.click('#clearSearch');
 assert.equal(await page.evaluate(()=>document.querySelector('[data-setting="count"]').hidden),false);
 assert.equal(await page.evaluate(()=>document.getElementById('controlSearch').value),'');
 // Numerical distribution variance must control physical sprite size.
 await page.evaluate(()=>window.__fog.setValue('sizeVariance',0));
 assert.equal(await page.evaluate(()=>window.__fog.sim.particles[0].radius),1);
 // Save/export and import the same comprehensive parameter map via visible UI.
 const saved=await page.evaluate(()=>{
  const f=window.__fogSettings;
  f.persistNow();
  return {object:f.exportObject(),stored:JSON.parse(localStorage.getItem('fog-particle-globe-controls-v2'))};
 });
 assert.equal(saved.object.version,2);
 assert.equal(saved.stored.settings.density,.375);
 assert.equal(saved.object.settings.sizeVariance,0);
 await page.evaluate(()=>{
  const patch={version:2,settings:{count:775,density:1.4,hue:.8,windX:-.24,shape:'shell'}};
  const file=new File([JSON.stringify(patch)],'config.json',{type:'application/json'});
  const transfer=new DataTransfer();transfer.items.add(file);
  const picker=document.getElementById('uploadConfig');picker.files=transfer.files;
  picker.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.waitForFunction(()=>window.__fog.state.count===775,{timeout:5000});
 const imported=await page.evaluate(()=>({
  count:window.__fog.state.count,
  density:window.__fog.state.density,
  hue:window.__fog.state.hue,
  shape:window.__fog.state.shape,
  direct:document.getElementById('countNumber').value,
  message:document.getElementById('settingsMessage').textContent
 }));
 console.log('JSON-IMPORT',imported);
 assert.equal(imported.count,775);assert.equal(imported.density,1.4);
 assert.equal(imported.hue,.8);assert.equal(imported.shape,'shell');
 assert.equal(Number(imported.direct),775);assert.match(imported.message,/読み込みました/);
 await page.click('#restoreDefaults');
 const restored=await page.evaluate(()=>({count:window.__fog.state.count,shape:window.__fog.state.shape,
  variance:window.__fog.state.sizeVariance,message:document.getElementById('settingsMessage').textContent}));
 assert.equal(restored.count,650);assert.equal(restored.shape,'cloud');
 assert.equal(restored.variance,.58);assert.match(restored.message,/初期設定/);
 await page.click('[data-preset=nebula]');
 assert.equal(await page.evaluate(()=>window.__fog.state.shape),'cloud');
 await page.click('#closePanel');
 assert.equal(await page.evaluate(()=>document.getElementById('panel').classList.contains('collapsed')),true);
 await page.click('#openPanel');
 assert.equal(await page.evaluate(()=>document.getElementById('panel').classList.contains('collapsed')),false);
 await page.click('#pause');assert.equal(await page.evaluate(()=>window.__fog.paused),true);
 await page.click('#pause');assert.equal(await page.evaluate(()=>window.__fog.paused),false);
 await page.click('#burst');await page.evaluate(()=>window.__fog.sim.validate());
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.reload({waitUntil:'load'});
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.webgpuStatus),{timeout:90000});
 const mobile=await page.evaluate(()=>({
  status:document.documentElement.dataset.webgpuStatus,
  collapsed:document.getElementById('panel').classList.contains('collapsed'),
  toggle:getComputedStyle(document.getElementById('openPanel')).display,
  label:document.getElementById('openPanel').textContent,
  canvasWidth:document.getElementById('view').getBoundingClientRect().width
 }));
 console.log('MOBILE',mobile);
 assert.equal(mobile.status,'ok');assert.equal(mobile.collapsed,true);
 assert.notEqual(mobile.toggle,'none');assert.equal(mobile.canvasWidth,390);assert.match(mobile.label,/詳細設定/);
 await page.click('#openPanel');assert.equal(await page.evaluate(()=>document.getElementById('panel').classList.contains('collapsed')),false);
 assert.deepEqual(browserErrors,[]);
 console.log('PASS: WebGPU shader, 2400 sorted Gaussian particles, actual pixel change, presets, numeric controls, search, JSON import/export, defaults, mobile menu');
 await browser.disconnect();
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
