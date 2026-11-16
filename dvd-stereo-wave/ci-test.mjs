import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:process.env.WEBGPU_FLAGS.split(/\s+/),dumpio:true});
try{
 console.log('Chrome',await browser.version());
 const page=await browser.newPage();page.on('console',m=>console.log('PAGE',m.text()));page.on('pageerror',e=>console.error('PAGEERROR',e));
 await page.setViewport({width:1200,height:1000});await page.goto('http://127.0.0.1:8000/dvd-stereo-wave/?ci=1');
 await page.waitForFunction(()=>['ok','error'].includes(document.body.dataset.gpu),{timeout:120000});
 const result=await page.evaluate(()=>({status:document.body.dataset.gpu,detail:document.getElementById('status').textContent,test:window.__stereoTest}));
 console.log(JSON.stringify(result));await page.screenshot({path:'dvd-stereo-wave.png',fullPage:true});
 if(result.status!=='ok'||!result.test)throw Error(result.detail);
}finally{await browser.close();}
