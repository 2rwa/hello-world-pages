const puppeteer=require('puppeteer-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:{width:900,height:650}});
 const page=(await browser.pages()).find(p=>p.url().includes('gaussian-bounce-sphere/'));
 if(!page)throw Error('Missing opened WebGPU page');
 const errors=[];page.on('pageerror',err=>errors.push(String(err)));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.webgpuStatus),{timeout:90000});
 const initial=await page.evaluate(()=>({status:document.documentElement.dataset.webgpuStatus,stage:document.documentElement.dataset.webgpuStage,error:document.documentElement.dataset.webgpuError,pixels:document.documentElement.dataset.webgpuPixels}));
 console.log('WEBGPU',JSON.stringify(initial));assert.equal(initial.status,'ok',initial.error);assert.equal(initial.stage,'done');
 const first=JSON.parse(initial.pixels);assert.ok(first.coverage>.01,'Offscreen render had no lit pixels');
 const testCases=[
  {name:'100 particles spatial hash hybrid',count:100,mode:'hybrid',rayCull:'on',spatial:'on'},
  {name:'100 particles brute force solid',count:100,mode:'solid',rayCull:'off',spatial:'off'},
  {name:'100 particles cloud integration',count:100,mode:'cloud',rayCull:'on',spatial:'on'},
  {name:'100 particles debug centers',count:100,mode:'debug',rayCull:'on',spatial:'on'},
  {name:'100 particles mixed fog',count:100,mode:'hybrid',fogMode:'mixed',fogDensity:2.4,fogParticle:1.5,fogNoise:.9},
  {name:'100 particles particle-only fog',count:100,mode:'solid',fogMode:'particles',fogDensity:3.5,fogParticle:2.5},
  {name:'ambient fog in the globe',count:40,mode:'cloud',fogMode:'ambient',fogDensity:3.2,fogScatter:1.6},
  {name:'refractive glass & full bloom',count:35,mode:'hybrid',ior:1.8,refraction:1,bloom:2,ripple:2,trail:.5},
 ];
 for(const row of testCases){const value=await page.evaluate(async (args)=>{
   const app=window.__gbs;for(const [id,val] of Object.entries(args))if(id!=='name')app.setValue(id,val);
   app.setValue('marchSteps',32);return {count:app.state.count,mode:app.state.mode,dimensions:[app.gpu.width,app.gpu.height],pixels:await app.drawOnce(true),error:document.documentElement.dataset.webgpuError||''};
 },row);
 console.log('CASE',row.name,JSON.stringify(value));assert.equal(value.count,row.count);assert.equal(value.mode,row.mode);assert.ok(value.pixels.coverage>.01);assert.equal(value.error,'');
 if(row.mode==='hybrid')await page.$('#debug-capture').then(async el=>el.screenshot({path:`/tmp/gaussian-bounce-${row.count}.png`}));
 }
 // Changing UI must alter readback pixels, not just the JavaScript state.
 const fogDiff=await page.evaluate(async()=>{
   const app=window.__gbs;
   app.setValue('count',32);app.setValue('mode','solid');
   app.setValue('fogMode','off');const without=await app.drawOnce(true);
   app.setValue('fogMode','ambient');app.setValue('fogDensity',3.5);
   app.setValue('fogNoise',.8);app.setValue('fogScatter',1.6);
   const withFog=await app.drawOnce(true);
   return {without:without.brightness,withFog:withFog.brightness,mode:app.state.fogMode,ui:document.getElementById('fogMode').value};
 });
 console.log('FOG-READBACK',fogDiff);
 assert.equal(fogDiff.mode,'ambient');assert.equal(fogDiff.ui,'ambient');
 assert.ok(Math.abs(fogDiff.withFog-fogDiff.without)>900,'Fog did not visibly change GPU output');
 await page.click('#minimize');let ui=await page.evaluate(()=>({collapsed:document.getElementById('panel').classList.contains('collapsed'),button:document.getElementById('menuButton').getAttribute('aria-expanded')}));assert.deepEqual(ui,{collapsed:true,button:'false'});
 await page.click('#menuButton');ui=await page.evaluate(()=>({collapsed:document.getElementById('panel').classList.contains('collapsed'),button:document.getElementById('menuButton').getAttribute('aria-expanded')}));assert.deepEqual(ui,{collapsed:false,button:'true'});
 await page.click('#pause');assert.equal(await page.evaluate(()=>window.__gbs.paused),true);await page.click('#pause');assert.equal(await page.evaluate(()=>window.__gbs.paused),false);
 await page.click('#burst');assert.ok(await page.evaluate(()=>window.__gbs.simulation.data[7]>=0));
 await page.evaluate(async()=>{window.__gbs.advance(.2);await window.__gbs.drawOnce(true);window.__gbs.simulation.validateBounds();});
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.reload({waitUntil:'load'});await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.webgpuStatus),{timeout:90000});
 const mobile=await page.evaluate(()=>({state:document.documentElement.dataset.webgpuStatus,panelClosed:document.getElementById('panel').classList.contains('collapsed'),buttonVisible:getComputedStyle(document.getElementById('menuButton')).opacity,canvas:document.getElementById('view').getBoundingClientRect().width}));
 console.log('MOBILE',mobile);assert.equal(mobile.state,'ok');assert.equal(mobile.panelClosed,true);assert.equal(mobile.canvas,390);
 await page.click('#menuButton');assert.equal(await page.evaluate(()=>document.getElementById('panel').classList.contains('collapsed')),false);
 assert.deepEqual(errors,[]);console.log('PASS: GPU render, 100 particles, all 4 modes, 3 fog styles, fog pixel regression, adjustable optics, menu, mobile, state propagation');
 await browser.disconnect();
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
