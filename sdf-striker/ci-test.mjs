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
} finally {await browser.close();}
