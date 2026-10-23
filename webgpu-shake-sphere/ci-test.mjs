import puppeteer from 'puppeteer-core';
const flags=(process.env.WEBGPU_FLAGS||'').split(' ').filter(Boolean);
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
 headless:true,args:['--disable-dev-shm-usage',...flags]});
try{
 const page=await browser.newPage();
 page.on('console',m=>console.log('BROWSER:',m.type(),m.text()));
 page.on('pageerror',e=>console.error('PAGE ERROR:',e.message));
 await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const res=await page.goto('http://127.0.0.1:8000/webgpu-shake-sphere/?ci=1',
  {waitUntil:'domcontentloaded',timeout:30000});
 if(!res?.ok())throw Error('HTTP '+res?.status());
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.test),
  {timeout:70000,polling:200});
 const data=await page.evaluate(()=>window.__sphereApp);
 if(data.tiltedGravity?.[0]>-8 || data.shakeBurst<0.7 || data.rotated?.checksum===data.initial?.checksum)
  throw Error('Sensor or camera GPU check was not exercised '+JSON.stringify(data));
 console.log('SPHERE GPU RESULT',JSON.stringify(data));
 if(data.phase!=='ok'||data.activeCount!==50||data.viewPairs<=0||
    data.penetrationPairs<3||data.maxPenetration<=0.1||
    data.compressed.red<=data.initial.red+5)
   throw Error('Sphere GPU or physics regression '+JSON.stringify(data));
 // Real mobile pointer hit testing: prevent controls from accidentally dragging canvas.
 const ids=['enable','shake','compress','reset','pause','count','gain','iterations','yaw','xray','overlap','gravity'];
 const hit=await page.evaluate(list=>Object.fromEntries(list.map(id=>{
  const n=document.getElementById(id),r=n.getBoundingClientRect();
  const centre=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return [id,{name:centre?.id||centre?.tagName,works:centre===n||n.contains(centre),
    pointer:getComputedStyle(n).pointerEvents}];
 })),ids);
 console.log('MOBILE HIT TARGETS',JSON.stringify(hit));
 for(const [id,item]of Object.entries(hit)){
  if(!item.works||item.pointer==='none')throw Error('Blocked control '+id+': '+JSON.stringify(item));
 }
 await page.tap('#pause');
 if(await page.$eval('#pause',n=>n.textContent)!=='再開')throw Error('Pause touch failed');
 await page.tap('#pause');
 if(await page.$eval('#pause',n=>n.textContent)!=='一時停止')throw Error('Resume touch failed');
 await page.tap('#reset');
 if(await page.$eval('#penetrations',n=>n.textContent)!=='0')
  throw Error('Reset failed to remove overlap');
 await page.tap('#compress');
 const afterCompress=await page.evaluate(()=>({
  count:Number(document.querySelector('#penetrations').textContent),
  depth:Number(document.querySelector('#maxDepth').textContent),
  iterations:document.querySelector('#iterations').value
 }));
 if(afterCompress.count<3||afterCompress.depth<=0||afterCompress.iterations!=='0')
  throw Error('Compression action did not update UI '+JSON.stringify(afterCompress));
 await page.tap('#shake');
 if((await page.evaluate(()=>window.__sphereApp.shakes))<1)throw Error('Shake click failed');
 if(!await page.$eval('#gravity',n=>n.checked))
  throw Error('Default tilt gravity must be enabled');
 for(const id of ['xray','overlap','gravity']){
  const before=await page.$eval('#'+id,n=>n.checked);
  await page.tap('#'+id);
  const after=await page.$eval('#'+id,n=>n.checked);
  if(before===after)throw Error('Checkbox '+id+' not interactive');
 }
 for(const [id,value]of [['count','50'],['gain','2.3'],['iterations','5'],['yaw','90']]){
  await page.$eval('#'+id,(node,val)=>{
    node.value=val;node.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
  const after=await page.$eval('#'+id+'Out',n=>n.textContent);
  if(!after.startsWith(value))throw Error(id+' slider state not reflected '+after);
 }
 if((await page.evaluate(()=>window.__sphereApp.activeCount))!==50)
  throw Error('50 spheres slider event did not update state');
 const field=await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight*.42)?.id);
 if(field!=='scene')throw Error('Canvas is not draggable: '+field);
 const cameraBefore=await page.evaluate(()=>({
   yaw:window.__sphereApp.cameraYaw,pitch:window.__sphereApp.cameraPitch
 }));
 await page.mouse.move(170,330);
 await page.mouse.down();
 await page.mouse.move(240,375,{steps:6});
 await page.mouse.up();
 const cameraAfter=await page.evaluate(()=>({
   yaw:window.__sphereApp.cameraYaw,pitch:window.__sphereApp.cameraPitch
 }));
 if(cameraBefore.yaw===cameraAfter.yaw||cameraBefore.pitch===cameraAfter.pitch)
  throw Error('Touch area did not orbit camera '+JSON.stringify({cameraBefore,cameraAfter}));

 console.log('PASS: 50 actual spheres, 3D overlaps vs projected overlaps, solver, GPU pixels, UI');
}finally{await browser.close();}
