import puppeteer from 'puppeteer-core';
const chromeFlags=(process.env.WEBGPU_FLAGS||'').split(' ').filter(Boolean);
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:chromeFlags});
async function capture(spheres,bounces,opacity,steps,tag){
 const page=await browser.newPage();
 page.on('console',msg=>console.log('BROWSER',msg.type(),msg.text().slice(0,300)));
 page.on('pageerror',err=>console.error('PAGE ERROR',err.message));
 try{
  await page.setViewport({width:640,height:400,deviceScaleFactor:1});
  const opts=new URLSearchParams({ci:'1',quality:'128',spheres:String(spheres),bounces:String(bounces),opacity:String(opacity),steps:String(steps)});
  await page.goto('http://127.0.0.1:8000/webgpu-pelagic-amoeba/?'+opts,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.test||''),{timeout:180000});
  const reading=await page.evaluate(()=>{
   const state=window.__oceanState;
   const canvas=document.querySelector('#view');
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   return {state,pixels:Array.from(pixels)};
  });
  if(reading.state.phase!=='ok')throw Error(JSON.stringify(reading.state));
  if(reading.state.result?.probes!==27)throw Error('No 27-point FFT buoyancy');
  if(reading.state.amoeba.count!==spheres||reading.state.amoeba.bounces!==bounces)
    throw Error('SDF UI parameters missing '+JSON.stringify(reading.state.amoeba));
  if(reading.state.result.sky.every((v,i)=>v===reading.state.result.water[i]))
    throw Error('Ocean and sky have identical colors');
  console.log('GPU SUCCESS',JSON.stringify(reading.state));
  await page.screenshot({path:'pelagic-amoeba-'+tag+'.png'});
  return reading.pixels;
 } finally{await page.close();}
}
function pixelsDifferent(a,b){
 let changed=0,sum=0;
 for(let index=0;index<a.length;index+=4){
  const delta=Math.abs(a[index]-b[index])+Math.abs(a[index+1]-b[index+1])+Math.abs(a[index+2]-b[index+2]);
  sum+=delta;
  if(delta>15)changed++;
 }
 return {changed,sum};
}
try{
 const baseline=await capture(3,0,0,24,'baseline');
 const glass=await capture(3,1,1,64,'3spheres');
 const shape=await capture(12,1,1,64,'12spheres');
 const added=pixelsDifferent(glass,baseline);
 const morphology=pixelsDifferent(shape,glass);
 console.log('GLASS vs BASELINE',JSON.stringify(added));
 console.log('12 vs 3 SPHERES',JSON.stringify(morphology));
 if(added.changed<150)throw Error('SDF raymarch did not visibly alter ocean image');
 if(morphology.changed<50)throw Error('Changing sphere count did not visibly alter body');
 console.log('PASS WebGPU FFT ocean, SDF glass raymarch, refraction compositing, sphere count');
}catch(err){console.error('FAIL',err);process.exitCode=1;}
finally{await browser.close();}
