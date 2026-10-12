import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:process.env.WEBGPU_FLAGS?.split(' ')||[]});
try {
 const page=await browser.newPage();
 page.on('console',m=>console.log('browser',m.text()));
 page.on('pageerror',e=>console.error('pageerror',e.message));
 const quality=Number(process.env.WEBGPU_QUALITY||128);
 const mode=Number(process.env.WEBGPU_MODE||0);
 const sun=Number(process.env.WEBGPU_SUN||31);
 await page.goto('http://127.0.0.1:8000/webgpu-fft-ocean-v2/?ci=1&quality='+quality+'&mode='+mode+'&sun='+sun,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.test||''),{timeout:180000});
 const result=await page.evaluate(()=>({state:window.__oceanState,text:document.getElementById('status').textContent}));
 console.log(JSON.stringify(result,null,2));
 await page.screenshot({path:'fft-ocean-v2-'+quality+'-mode'+mode+'-sun'+sun+'.png'});
 if(result.state.resolution!==quality||result.state.mode!==mode||result.state.sun!==sun)
 throw Error('UI query controls not reflected: '+JSON.stringify(result.state));
 if(result.state.result.probes!==27)throw Error('27 point buoyancy GPU readback failed');
 if(result.state.result.sky.every((v,i)=>v===result.state.result.water[i]))throw Error('Sky and water not separated');
 if(result.state.phase!=='ok')throw Error(result.text);
} finally { await browser.close(); }
