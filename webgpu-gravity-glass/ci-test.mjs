import puppeteer from 'puppeteer-core';
const flags=(process.env.WEBGPU_FLAGS || '').split(' ').filter(Boolean);
const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
  headless:true,
  args:['--disable-dev-shm-usage',...flags]
});
try{
 const page=await browser.newPage();
 page.on('console',msg=>console.log('BROWSER:',msg.type(),msg.text()));
 page.on('pageerror',err=>console.error('PAGE ERROR:',err.message));
 const response=await page.goto('http://127.0.0.1:8000/webgpu-gravity-glass/?ci=1',{
   waitUntil:'domcontentloaded',timeout:20000
 });
 if(!response?.ok())throw Error('HTTP error '+response?.status());
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.test),
   {timeout:50000,polling:300});
 const result=await page.evaluate(()=>window.__gravityGlass);
 console.log('WebGPU CI result:',JSON.stringify(result,null,2));
 if(result?.phase!=='ok')throw Error('GPU CI failed: '+JSON.stringify(result));
 if(result.moved<0.15 || result.pixelRange[1]-result.pixelRange[0]<24){
   throw Error('Physics or GPU pixel-readback regression');
 }
 console.log('PASS: device, WGSL compilation, pipeline, GPU pixels, gravity physics');
 // Regression: mobile-sized real pointer hit-testing (not DOM-dispatched fake clicks).
 await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const uiIds=['sensorButton','recenter','reset','pause','count','friction','reverse'];
 const hitTargets=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{
   const node=document.getElementById(id);
   const box=node.getBoundingClientRect();
   const x=box.left+box.width/2,y=box.top+box.height/2;
   const hit=document.elementFromPoint(x,y);
   return [id,{actual:hit?.id||hit?.tagName,accepted:hit===node||node.contains(hit),x,y,
     pointerEvents:getComputedStyle(node).pointerEvents}];
 })),uiIds);
 console.log('Mobile pointer hit targets:',JSON.stringify(hitTargets,null,2));
 for(const [id,hit] of Object.entries(hitTargets)){
   if(!hit.accepted||hit.pointerEvents==='none')throw Error('Unclickable UI: '+id+' '+JSON.stringify(hit));
 }
 const footerHit=await page.evaluate(()=>getComputedStyle(document.querySelector('footer')).pointerEvents);
 if(footerHit!=='auto')throw Error('Footer pointer events unexpectedly '+footerHit);
 await page.tap('#pause');
 if(await page.$eval('#pause',n=>n.textContent)!=='再開')throw Error('Pause touch did not reach button');
 await page.tap('#pause');
 if(await page.$eval('#pause',n=>n.textContent)!=='一時停止')throw Error('Resume touch did not reach button');
 await page.tap('#recenter');
 if(!(await page.$eval('#status',n=>n.textContent)).includes('水平基準')){
  throw Error('Recenter touch did not change status');
 }
 await page.tap('#reset');
 if(!(await page.$eval('#status',n=>n.textContent)).includes('中央')){
  throw Error('Reset touch did not change status');
 }
 const reverseBefore=await page.$eval('#reverse',n=>n.checked);
 await page.tap('#reverse');
 const reverseAfter=await page.$eval('#reverse',n=>n.checked);
 if(reverseBefore===reverseAfter)throw Error('Reverse checkbox could not be tapped');
 async function tapRightSide(id){
   const rect=await page.$eval(id,n=>{const r=n.getBoundingClientRect();
     return {x:r.right-5,y:r.top+r.height/2};});
   await page.touchscreen.tap(rect.x,rect.y);
 }
 await tapRightSide('#count');
 const countState=await page.evaluate(()=>({
   value:document.querySelector('#count').value,
   label:document.querySelector('#countOut').textContent
 }));
 if(countState.value!=='5'||countState.label!=='5')
   throw Error('Count slider touch not applied '+JSON.stringify(countState));
 await tapRightSide('#friction');
 const frictionState=await page.evaluate(()=>({
   value:Number(document.querySelector('#friction').value),
   label:document.querySelector('#frictionOut').textContent
 }));
 if(frictionState.value<4.0||Number(frictionState.label)<4.0)
   throw Error('Friction slider touch not applied '+JSON.stringify(frictionState));
 // Keep canvas drag, but confirm that it is limited to canvas and not the control overlay.
 const canvasTouch=await page.evaluate(()=>{
   const box=document.querySelector('canvas').getBoundingClientRect();
   const x=box.width/2,y=box.height/2;
   return {hit:document.elementFromPoint(x,y)?.id,x,y};
 });
 if(canvasTouch.hit!=='view')throw Error('Canvas drag target blocked by overlay '+JSON.stringify(canvasTouch));
 console.log('PASS: mobile touch buttons, range sliders, checkbox, pointer target separation');
}finally{await browser.close();}
