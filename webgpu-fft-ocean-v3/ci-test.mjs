import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_PATH,headless:true,
 args:process.env.WEBGPU_FLAGS?.split(' ')||[]
});
const quality=Number(process.env.WEBGPU_QUALITY||128);
const sun=Number(process.env.WEBGPU_SUN||31);
const mode=Number(process.env.WEBGPU_MODE||0);
const spray=Number(process.env.WEBGPU_SPRAY||0);
const lace=Number(process.env.WEBGPU_LACE||1.8);
const compare=process.env.WEBGPU_SPRAY_COMPARISON==='1';
let failed=false;
async function capture(amount,suffix){
 const page=await browser.newPage();
 page.on('console',m=>console.log('BROWSER',m.type(),m.text().slice(0,220)));
 page.on('pageerror',e=>console.error('BROWSER-JS',e.message));
 try{
  await page.setViewport({width:640,height:400,deviceScaleFactor:1});
  const search=new URLSearchParams({ci:'1',quality:String(quality),mode:String(mode),
    sun:String(sun),spray:String(amount),lace:String(lace)});
  await page.goto('http://127.0.0.1:8000/webgpu-fft-ocean-v3/?'+search,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.test||''),{timeout:180000});
  const reading=await page.evaluate(()=>{
   const state=window.__oceanState;
   const img=document.querySelector('canvas');
   const pixels=img.getContext('2d').getImageData(0,0,img.width,img.height).data;
   return {state,pixels:Array.from(pixels)};
  });
  const {state,pixels}=reading;
  if(state.phase!=='ok')throw Error(JSON.stringify(state));
  if(state.result?.probes!==27)throw Error('27-point GPU buoyancy readback failed');
  if(!(state.result?.particlesAlive>0))throw Error('GPU spray compute has no live particles');
  if(state.resolution!==quality||state.mode!==mode||state.sun!==sun||
     Math.abs(state.spray-amount)>0.01||Math.abs(state.lace-lace)>0.01)
    throw Error('UI parameter not reflected: '+JSON.stringify(state));
  if(state.result.sky.every((v,i)=>v===state.result.water[i]))
   throw Error('Sky/water separation failed');
  console.log('GPU STATE',JSON.stringify(state));
  await page.screenshot({path:'fft-ocean-v3-'+quality+'-mode'+mode+'-spray'+amount+suffix+'.png'});
  return pixels;
 } finally{await page.close();}
}
try{
 const pixels=await capture(spray,'');
 if(compare){
  const without=await capture(0,'-control');
  let different=0,sum=0,brightened=0,darkened=0;
  for(let k=0;k<pixels.length;k+=4){
   const d=Math.abs(pixels[k]-without[k])+Math.abs(pixels[k+1]-without[k+1])
     +Math.abs(pixels[k+2]-without[k+2]);
   const signed=pixels[k]+pixels[k+1]+pixels[k+2]-without[k]-without[k+1]-without[k+2];
   if(d>4)different++;
   if(signed>15)brightened++;
   if(signed < -15)darkened++;
   sum+=d;
  }
  console.log('SPRAY PIXEL DIFFERENCE',JSON.stringify({different,sum,brightened,darkened}));
  if(different<150)throw Error('GPU sprite render is not visually significant');
  if(brightened<=darkened)throw Error('Droplets darken the scene instead of appearing as bright water spray');
 }
 console.log('PASS FFT, foam, spray compute, particle readback and render');
}catch(e){failed=true;console.error('FAIL',e);}
finally{await browser.close();}
if(failed)process.exitCode=1;
