const puppeteer=require('puppeteer-core');
(async()=>{
 const browser=await puppeteer.launch({
   executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
   headless:true,
   args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-webgpu',
     '--enable-features=Vulkan','--use-vulkan=swiftshader',
     '--disable-vulkan-fallback-to-gl-for-testing','--use-webgpu-adapter=swiftshader',
     '--enable-webgpu-developer-features','--enable-dawn-features=allow_unsafe_apis',
     '--disable-dawn-features=use_dxc','--use-gpu-in-tests','--enable-unsafe-swiftshader']
 });
 try{
   const page=await browser.newPage();
   page.on('console',msg=>console.log('[browser]',msg.type(),msg.text()));
   page.on('pageerror',err=>console.error('[pageerror]',err));
   await page.goto('http://127.0.0.1:8765/gaussian-pde-field/?ci=1',{waitUntil:'networkidle0'});
   await page.waitForFunction(()=>{
     const status=document.documentElement.dataset.webgpuStatus;
     return status==='ok'||status==='error';
   },{timeout:45000,polling:200});
   const result=await page.evaluate(()=>({
     status:document.documentElement.dataset.webgpuStatus,
     stage:document.documentElement.dataset.webgpuStage,
     error:document.documentElement.dataset.webgpuError,
     lost:document.documentElement.dataset.webgpuLost,
     pixels:document.documentElement.dataset.webgpuPixels,
   }));
   console.log('Gaussian PDE GPU result:',JSON.stringify(result,null,2));
   if(result.status!=='ok'||result.stage!=='done'||!result.pixels)throw new Error('GPU validation/readback failed: '+JSON.stringify(result));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});