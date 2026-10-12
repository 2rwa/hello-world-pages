import puppeteer from 'puppeteer-core';
const headed=process.env.BIO_HEADLESS==='0';
const flags='--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --disable-vulkan-fallback-to-gl-for-testing --use-webgpu-adapter=swiftshader --enable-webgpu-developer-features --enable-dawn-features=allow_unsafe_apis --disable-dawn-features=use_dxc --use-gpu-in-tests --enable-unsafe-swiftshader --no-sandbox --disable-dev-shm-usage'.split(' ');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:!headed,args:flags});
try{
 console.log('Browser:',await browser.version(),'headed:',headed);
 const page=await browser.newPage();
 page.on('console',m=>console.log('OFFSCREEN:',m.type(),m.text()));
 page.on('pageerror',e=>console.log('PAGE ERROR:',e.message));
 await page.goto('http://127.0.0.1:8000/sdf-biolume/?ci=offscreen',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>['ok','error'].includes(window.__bioState?.phase),{timeout:90000});
 const state=await page.evaluate(()=>window.__bioState);
 console.log('Initial GPU:',JSON.stringify(state));
 if(!state.ok||state.pixels.bright<50)throw Error('GPU render missing or blank');
 const first=state.pixels.signature;
 // Pause animation before comparing exact GPU images, so time cannot produce false positives.
 await page.click('#pause');
 await page.$eval('#organic',e=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));});
 const star=await page.evaluate(()=>window.__bioDraw());
 await page.$eval('#organic',e=>{e.value='1';e.dispatchEvent(new Event('input',{bubbles:true}));});
 const amoeba=await page.evaluate(()=>window.__bioDraw());
 console.log('Organic morph:',JSON.stringify({star,amoeba}));
 if(star.signature===amoeba.signature)throw Error('Organic morph control did not change GPU result');
 if(Math.abs(star.nonDark-amoeba.nonDark)<12)throw Error('Organic silhouette difference too small: '+JSON.stringify({star,amoeba}));
 await page.$eval('#fusion',e=>{e.value='.62';e.dispatchEvent(new Event('input',{bubbles:true}));});
 const merged=await page.evaluate(()=>window.__bioDraw());
 console.log('Fusion change:',JSON.stringify(merged));
 if(first===merged.signature)throw Error('Fusion did not change raymarched pixels');
 await page.$eval('#arms',e=>{e.value='3';e.dispatchEvent(new Event('input',{bubbles:true}));});
 const fewer=await page.evaluate(()=>window.__bioDraw());
 console.log('Arm count change:',JSON.stringify(fewer));
 if(merged.signature===fewer.signature)throw Error('Arm count did not change raymarched pixels');
 await page.$eval('#style',e=>{e.value='2';e.dispatchEvent(new Event('input',{bubbles:true}));});
 const normals=await page.evaluate(()=>window.__bioDraw());
 if(normals.signature===fewer.signature)throw Error('Normal mode did not alter shading');
 await page.click('#reset');
 const reset=await page.$eval('#arms',e=>+e.value);
 if(reset!==5)throw Error('Reset failed');
 if(await page.$eval('#pause',e=>e.textContent)!=='再開')throw Error('Pause failed');
 await page.click('#pause');
 if(await page.$eval('#pause',e=>e.textContent)!=='停止')throw Error('Resume failed');
 if(await page.$eval('#organic',e=>+e.value)!==1)throw Error('Organic reset failed');
 const view=await browser.newPage();
 view.on('pageerror',e=>console.log('CANVAS ERROR:',e.message));
 await view.setViewport({width:900,height:650,deviceScaleFactor:1});
 await view.goto('http://127.0.0.1:8000/sdf-biolume/?ci=canvas',{waitUntil:'domcontentloaded'});
 await view.waitForFunction(()=>['ok','error'].includes(window.__bioState?.phase),{timeout:45000});
 const canvasState=await view.evaluate(()=>window.__bioState);
 console.log('Canvas state:',JSON.stringify(canvasState));
 if(!canvasState.ok){
  if(headed)throw Error('Headed canvas failed: '+JSON.stringify(canvasState));
  console.log('Headless canvas unavailable; authoritative GPU offscreen readback passed');
 }else{
  await view.screenshot({path:'sdf-biolume/canvas-smoke.png'});
  await view.$eval('#organic',e=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await view.evaluate(()=>window.__bioDraw());
  await view.screenshot({path:'sdf-biolume/canvas-star-comparison.png'});
  await view.$eval('#organic',e=>{e.value='1';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await view.evaluate(()=>window.__bioDraw());
  await view.screenshot({path:'sdf-biolume/canvas-amoeba-comparison.png'});
 }
}finally{await browser.close();}
