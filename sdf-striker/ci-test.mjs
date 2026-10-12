import puppeteer from 'puppeteer-core';
const chromePath=process.env.CHROME_PATH||'/usr/bin/google-chrome';
const flags=(process.env.WEBGPU_FLAGS||'--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --disable-vulkan-fallback-to-gl-for-testing --use-webgpu-adapter=swiftshader --enable-webgpu-developer-features --enable-dawn-features=allow_unsafe_apis --disable-dawn-features=use_dxc --use-gpu-in-tests --enable-unsafe-swiftshader --no-sandbox').split(/\s+/);
const browser=await puppeteer.launch({executablePath:chromePath,headless:true,args:[...flags,'--disable-dev-shm-usage']});
try {
  console.log('browser',await browser.version());
  const page=await browser.newPage();
  page.on('pageerror',error=>console.error('PAGE ERROR:',error));
  page.on('console',message=>console.log('BROWSER:',message.type(),message.text()));
  await page.goto('http://127.0.0.1:8000/sdf-striker/?ci=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>['ok','error'].includes(window.__sdfState?.phase),{timeout:90000});
  const outcome=await page.evaluate(()=>window.__sdfState);
  console.log('GPU test:',JSON.stringify(outcome));
  if(!outcome.ok||!outcome.pixels?.nonBlack||!outcome.pixels?.different)throw new Error('WebGPU SDF render/readback failed');
  const baseline=outcome.pixels;
  await page.$eval('#turn', slider => {slider.value='-160';slider.dispatchEvent(new Event('input',{bubbles:true}));});
  const rotated=await page.evaluate(()=>window.__sdfTestDraw());
  console.log('GPU rotated camera:',JSON.stringify(rotated));
  if(JSON.stringify(rotated.center)===JSON.stringify(baseline.center)&&JSON.stringify(rotated.sidePixels)===JSON.stringify(baseline.sidePixels))
    throw new Error('Camera slider had no effect on GPU output');
  await page.click('#reset');
  const turnValue=await page.$eval('#turn',slider=>Number(slider.value));
  if(turnValue!==24)throw new Error('Reset failed: turn='+turnValue);
  await page.click('#pause');
  if(await page.$eval('#pause',button=>button.textContent.trim())!=='再開')throw new Error('Pause UI failed');
  await page.click('#pause');
  if(await page.$eval('#pause',button=>button.textContent.trim())!=='停止')throw new Error('Resume UI failed');
  const canvasPage=await browser.newPage();
  canvasPage.on('pageerror',error=>console.error('CANVAS PAGE ERROR:',error));
  canvasPage.on('console',message=>console.log('CANVAS:',message.type(),message.text()));
  await canvasPage.setViewport({width:800,height:600,deviceScaleFactor:1});
  await canvasPage.goto('http://127.0.0.1:8000/sdf-striker/?ci=canvas',{waitUntil:'domcontentloaded'});
  try {
    await canvasPage.waitForFunction(()=>['ok','error'].includes(window.__sdfState?.phase),{timeout:45000});
  }catch(error){console.warn('Canvas path timed out:',error.message);}
  const canvasStatus=await canvasPage.evaluate(()=>window.__sdfState);
  console.log('Canvas diagnostic:',JSON.stringify(canvasStatus));
  if(canvasStatus?.ok){
    await canvasPage.screenshot({path:'sdf-striker/canvas-smoke.png'});
  } else {
    const messages=(canvasStatus?.errors||[]).join('\\n');
    if(/SharedImage|WebgpuSwapChain|swapchain|shared image|context configure|GPU device lost/i.test(messages))
      console.warn('Canvas unavailable in this headless GPU environment; offscreen shader/readback regression remains authoritative.');
    else throw new Error('Actual canvas render path failed: '+JSON.stringify(canvasStatus));
  }
} finally {await browser.close();}
