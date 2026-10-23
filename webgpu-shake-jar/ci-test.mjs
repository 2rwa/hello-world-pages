import puppeteer from 'puppeteer-core';
const flags=(process.env.WEBGPU_FLAGS||'').split(' ').filter(Boolean);
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
 headless:true,args:['--disable-dev-shm-usage',...flags]});
try{
 const page=await browser.newPage();
 page.on('console',message=>console.log('BROWSER:',message.type(),message.text()));
 page.on('pageerror',error=>console.error('PAGE ERROR:',error.message));
 await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const response=await page.goto('http://127.0.0.1:8000/webgpu-shake-jar/?ci=1',{
  waitUntil:'domcontentloaded',timeout:25000});
 if(!response?.ok())throw Error('Unexpected HTTP status '+response?.status());
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.test),
  {timeout:60000,polling:200});
 const result=await page.evaluate(()=>window.__shakeLab);
 console.log('Actual GPU/offscreen shaker simulation:',JSON.stringify(result,null,2));
 if(result.phase!=='ok'||result.activeCount!==50||result.moved50<35||
   result.before.max-result.before.min<24||result.maxAfter.max-result.maxAfter.min<24)
  throw Error('WebGPU physics regression '+JSON.stringify(result));
 console.log('PASS: shake inertia, collision bounds, 50 spheres and GPU pixels');
 // Verify controls work with real hit-testing rather than programmatic onclick.
 const controls=['enable','shake','reset','pause','count','sensitivity','friction'];
 const hit=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{
   const node=document.getElementById(id),rect=node.getBoundingClientRect();
   const x=rect.left+rect.width*.5,y=rect.top+rect.height*.5;
   const found=document.elementFromPoint(x,y);
   return [id,{target:found?.id||found?.tagName,good:node===found||node.contains(found),
     pointer:getComputedStyle(node).pointerEvents}];
 })),controls);
 console.log('Mobile control pointer targets:',JSON.stringify(hit));
 for(const [id,entry]of Object.entries(hit))
  if(!entry.good||entry.pointer==='none')throw Error('Untouchable control '+id+': '+JSON.stringify(entry));
 await page.tap('#pause');
 if(await page.$eval('#pause',n=>n.textContent)!=='再開')throw Error('Pause is not interactive');
 await page.tap('#pause');
 if(await page.$eval('#pause',n=>n.textContent)!=='一時停止')throw Error('Resume is not interactive');
 await page.tap('#reset');
 if(!(await page.$eval('#status',n=>n.textContent)).includes('元に戻し'))
  throw Error('Reset button did not work');
 await page.tap('#shake');
 if(!(await page.$eval('#status',n=>n.textContent)).includes('シェイク'))
  throw Error('Manual shake button did not work');
 const beforeShakes=await page.evaluate(()=>window.__shakeLab.shakes||0);
 await page.tap('#shake');
 const afterShakes=await page.evaluate(()=>window.__shakeLab.shakes||0);
 if(afterShakes<=beforeShakes)throw Error('Shake action had no effect');
 const range=await page.$eval('#count',n=>({min:n.min,max:n.max}));
 if(range.max!=='50')throw Error('Slider max '+range.max);
 await page.$eval('#count',node=>{node.value='50';node.dispatchEvent(new Event('input',{bubbles:true}));});
 const uiState=await page.evaluate(()=>({count:document.querySelector('#countValue').textContent,
  state:window.__shakeLab.activeCount}));
 if(uiState.count!=='50'||uiState.state!==50)throw Error('50-ball UI event failed '+JSON.stringify(uiState));
 await page.$eval('#sensitivity',node=>{node.value='2.2';node.dispatchEvent(new Event('input',{bubbles:true}));});
 if(await page.$eval('#sensitivityValue',n=>n.textContent)!=='2.2')
  throw Error('Sensitivity change did not update display');
 await page.$eval('#friction',node=>{node.value='2.3';node.dispatchEvent(new Event('input',{bubbles:true}));});
 if(await page.$eval('#frictionValue',n=>n.textContent)!=='2.3')
  throw Error('Friction change did not update display');
 const canvasHit=await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.id);
 if(canvasHit!=='scene')throw Error('Canvas shaking gestures blocked by overlay: '+canvasHit);
 console.log('PASS: mobile controls, sensor button hit target, shake and slider events');
}finally{await browser.close();}
