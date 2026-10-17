import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:process.env.WEBGPU_FLAGS?.split(' ')||[]});
async function capture(radius,mode){
 const page=await browser.newPage();
 page.on('console',m=>console.log('BROWSER:',m.type(),m.text().slice(0,300)));
 page.on('pageerror',e=>console.error('BROWSER JS:',e.stack));
 await page.setViewport({width:480,height:300,deviceScaleFactor:1});
 try{
  await page.goto('http://127.0.0.1:8000/webgpu-curved-fft-ocean/?ci=1&quality=128&radius='+radius+'&mode='+mode,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.test||''),{timeout:180000});
  const data=await page.evaluate(()=>{
   const state=window.__curvedOceanState;
   const c=document.querySelector('canvas');
   return {state,pixels:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)};
  });
  console.log('GPU STATE',JSON.stringify(data.state));
  if(data.state.phase!=='ok'||data.state.result.cascades!==5||data.state.result.visible<480*300*.8)
   throw Error('GPU compute/raymarch/readback failed: '+JSON.stringify(data.state));
  await page.screenshot({path:'curved-fft-radius-'+radius+'-mode-'+mode+'.png'});
  return data.pixels;
 }finally{await page.close();}
}
try{
 const bent=await capture(3.48,0);
 const flatter=await capture(4.5,0);
 let different=0;
 for(let i=0;i<bent.length;i+=4)
  if(Math.abs(bent[i]-flatter[i])+Math.abs(bent[i+1]-flatter[i+1])+Math.abs(bent[i+2]-flatter[i+2])>16)different++;
 console.log('CURVATURE PIXEL DIFFERENCE',different);
 if(different<300)throw Error('Curvature radius control has no visible effect');
 await capture(3.48,3);
 console.log('PASS FFT × 5, spherical raymarch, GPU readback, curvature comparison');
}catch(e){console.error('FAIL',e);process.exitCode=1;}
finally{await browser.close();}
