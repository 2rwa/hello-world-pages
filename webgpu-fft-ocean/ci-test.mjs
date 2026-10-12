import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:process.env.WEBGPU_FLAGS?.split(' ')||[]});
try {
 const page=await browser.newPage();
 page.on('console',m=>console.log('browser',m.text()));
 page.on('pageerror',e=>console.error('pageerror',e.message));
 await page.goto('http://127.0.0.1:8000/webgpu-fft-ocean/?ci=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.test||''),{timeout:180000});
 const result=await page.evaluate(()=>({state:window.__oceanState,text:document.getElementById('status').textContent}));
 console.log(JSON.stringify(result,null,2));
 await page.screenshot({path:'fft-ocean-ci.png'});
 if(result.state.phase!=='ok')throw Error(result.text);
} finally { await browser.close(); }
