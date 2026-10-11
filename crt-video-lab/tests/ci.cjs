// UI + real GPU render/readback integration test. No fake shader or fake renderer.
const puppeteer=require('puppeteer-core');
const fs=require('node:fs');
(async()=>{
  const executablePath=process.env.CHROME_BIN||'/usr/bin/google-chrome';
  const chrome=await puppeteer.launch({executablePath,headless:true,args:[
    '--no-sandbox','--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-webgpu','--enable-features=Vulkan',
    '--use-vulkan=swiftshader','--disable-vulkan-fallback-to-gl-for-testing',
    '--use-webgpu-adapter=swiftshader','--enable-webgpu-developer-features',
    '--enable-dawn-features=allow_unsafe_apis','--disable-dawn-features=use_dxc',
    '--use-gpu-in-tests','--enable-unsafe-swiftshader'
  ]});
  try{
    const page=await chrome.newPage();
    await page.setViewport({width:1380,height:960,deviceScaleFactor:1});
    page.on('console',msg=>{if(['error','warning'].includes(msg.type()))console.log('console:',msg.type(),msg.text());});
    page.on('pageerror',error=>console.error('pageerror:',error));
    const url=process.env.TEST_URL||'http://127.0.0.1:8765/crt-video-lab/?ci=1';
    console.log('Chrome:',await chrome.version(),'URL:',url);
    await page.goto(url,{waitUntil:'networkidle2',timeout:30000});
    await page.waitForFunction(()=>window.__crtLab?.frames>=3||window.__crtLab?.phase==='error',{timeout:60000});
    const state=await page.evaluate(()=>window.__crtLab);
    if(state.phase==='error')throw new Error('WebGPU startup/render error: '+state.lastError);
    if(state.frames<3)throw new Error('No rendered video frames');
    console.log('pipeline stage:',state.phase,'frames:',state.frames);
    const probe=await page.evaluate(()=>window.__crtProbe());
    console.log('GPU readback:',JSON.stringify(probe));
    if(probe.lastFault||probe.bright<30||probe.sum<8000)throw new Error('Readback failed / blank image / validation error');
    const before=probe.frameCount;
    await page.select('#compareMode','1');
    await page.waitForFunction(oldCount=>window.__crtLab.frames>oldCount,{timeout:20000},before);
    const after=await page.evaluate(()=>window.__crtProbe());
    if(after.config.compare!==1)throw new Error('Original-view control not applied');
    await page.$eval('#setting-noise',element=>{
      element.value='0.9';
      element.dispatchEvent(new Event('input',{bubbles:true}));
    });
    const noise=await page.evaluate(()=>window.__crtProbe());
    if(Math.abs(noise.config.noise-.9)>.0001)throw new Error('Slider state did not update');
    if(noise.frameCount<=after.frameCount)throw new Error('Slider did not trigger GPU rerender');
    await page.select('#compareMode','.5');
    const split=await page.evaluate(()=>window.__crtProbe());
    if(split.config.compare!==0.5)throw new Error('Comparison split not applied');
    fs.mkdirSync('crt-video-lab/test-artifacts',{recursive:true});
    await page.screenshot({path:'crt-video-lab/test-artifacts/crt-webgpu-actual.png',fullPage:true});
    fs.writeFileSync('crt-video-lab/test-artifacts/result.json',JSON.stringify({state,probe,after,noise,split},null,2));
    console.log('PASS: shader compilation, GPU draws, actual output pixels, compare control, noise slider, screenshot');
  }finally{await chrome.close();}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
