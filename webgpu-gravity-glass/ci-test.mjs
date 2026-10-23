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
}finally{await browser.close();}
