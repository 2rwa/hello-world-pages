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
  canvasWidth:document.getElementById('view').getBoundingClientRect().width
 }));
 console.log('MOBILE',mobile);
 assert.equal(mobile.status,'ok');assert.equal(mobile.collapsed,true);
 assert.notEqual(mobile.toggle,'none');assert.equal(mobile.canvasWidth,390);
 await page.click('#openPanel');assert.equal(await page.evaluate(()=>document.getElementById('panel').classList.contains('collapsed')),false);
 assert.deepEqual(browserErrors,[]);
 console.log('PASS: WebGPU shader, 2400 sorted Gaussian particles, actual pixel change, presets, input, mobile menu');
 await browser.disconnect();
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
