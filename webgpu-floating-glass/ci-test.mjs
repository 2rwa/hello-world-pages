import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_PATH,headless:true,
 args:process.env.WEBGPU_FLAGS?.split(' ')||[]
});
const page=await browser.newPage();
page.on('console',msg=>console.log('BROWSER:',msg.type(),msg.text().slice(0,300)));
page.on('pageerror',err=>console.error('BROWSER JS:',err.stack));
await page.setViewport({width:480,height:300,deviceScaleFactor:1});
async function frame(tag){
 const output=await page.evaluate(()=>{
  const result=window.__glassDemo;
  const c=document.getElementById('view');
  return {result,pixels:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)};
 });
 if(output.result.phase!=='ok'||output.result.result.cascades!==5
   ||output.result.result.visible<480*300*.8)throw Error('Real GPU compute/render/readback failed: '+JSON.stringify(output.result));
 console.log('STATE',tag,JSON.stringify(output.result));
 await page.screenshot({path:'floating-glass-'+tag+'.png'});
 return output.pixels;
}
async function adjust(id,value){
 return page.evaluate(async(args)=>{
  const el=document.getElementById(args.id);
  if(!el)throw Error('Missing UI element '+args.id);
  el.value=args.value;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  await window.__renderOnce();
  return {out:document.getElementById(args.id+'Out')?.textContent,state:window.__glassDemo};
 },{id,value});
}
function countDifference(a,b,threshold){
 let changed=0,sum=0;
 for(let i=0;i<a.length;i+=4){
  const delta=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
  if(delta>threshold)changed++;
  sum+=delta;
 }
 return {changed,sum};
}
try{
 await page.goto('http://127.0.0.1:8000/webgpu-floating-glass/?ci=1&quality=128',
   {waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.test||''),{timeout:180000});
 const filled=await frame('glass');
 await adjust('mode','4');
 const without=await frame('no-glass');
 const sphereDiff=countDifference(filled,without,20);
 console.log('GLASS VS NO GLASS',JSON.stringify(sphereDiff));
 if(sphereDiff.changed<230)throw Error('Visible glass sphere is missing: '+sphereDiff.changed);
 await adjust('mode','0');
 const changedRadius=await adjust('ballSize','5.8');
 if(!changedRadius.out?.includes('5.8')||changedRadius.state.ballSize!==5.8)
  throw Error('Ball radius control not applied to render');
 const big=await frame('large-orb');
 const radiusDiff=countDifference(filled,big,20);
 console.log('BALL SIZE DIFFERENCE',JSON.stringify(radiusDiff));
 if(radiusDiff.changed<350)throw Error('Ball radius change did not redraw visible sphere');
 await adjust('ballSize','3.6');
 const adjustedIOR=await adjust('ior','1.06');
 if(adjustedIOR.state.ior!==1.06)throw Error('Refraction UI state not updated');
 const lowIOR=await frame('low-ior');
 const iorDiff=countDifference(filled,lowIOR,5);
 console.log('IOR PIXEL DIFFERENCE',JSON.stringify(iorDiff));
 if(iorDiff.changed<100)throw Error('Refraction strength has no visible effect');
 await adjust('ior','1.48');
 const changedFloat=await adjust('float','.25');
 if(changedFloat.state.float!==.25)throw Error('Float control state not updated');
 const floating=await frame('lower-float');
 const floatDiff=countDifference(filled,floating,20);
 console.log('FLOAT IMMERSION DIFFERENCE',JSON.stringify(floatDiff));
 if(floatDiff.changed<160)throw Error('Floating height not visually updated');
 console.log('PASS FFT×5 + refractive sphere + GPU readback + UI redraw');
}catch(error){console.error('FAIL:',error);process.exitCode=1;}
finally{await page.close();await browser.close();}
