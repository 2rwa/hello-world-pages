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

function checkNoOuterHalo(onPixels,offPixels,orbCenter,orbRadius){
 // Pixel rays match the fragment shader's perspective camera. Changes beyond
 // 1.35x the glass silhouette indicate a leaked enlarged-bound/marching halo.
 const eye=[Math.sin(.07)*20,7,-Math.cos(.07)*20];
 const target=[0,2.5,0];
 const sub=(a,b)=>a.map((v,i)=>v-b[i]);
 const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
 const norm=v=>{const length=Math.sqrt(dot(v,v));return v.map(x=>x/length);};
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const fwd=norm(sub(target,eye));
 const side=norm(cross([0,1,0],fwd)),up=cross(fwd,side);
 const eyeToOrb=sub(eye,orbCenter);
 let outsideChanges=0,insideChanges=0;
 for(let py=0;py<300;py++){
  for(let px=0;px<480;px++){
   const ndcX=((px+.5)/480*2-1)*(480/300)*Math.tan(.44);
   const ndcY=(1-(py+.5)/300*2)*Math.tan(.44);
   const ray=norm(fwd.map((v,i)=>v+side[i]*ndcX+up[i]*ndcY));
   const halfB=dot(eyeToOrb,ray);
   const discriminant=halfB*halfB-dot(eyeToOrb,eyeToOrb)+(orbRadius*1.35)**2;
   const insideProjection=discriminant>=0&&-halfB+Math.sqrt(Math.max(0,discriminant))>0;
   const p=(py*480+px)*4;
   const d=Math.abs(onPixels[p]-offPixels[p])+
     Math.abs(onPixels[p+1]-offPixels[p+1])+
     Math.abs(onPixels[p+2]-offPixels[p+2]);
   if(d>3){if(insideProjection)insideChanges++;else outsideChanges++;}
  }
 }
 return {insideChanges,outsideChanges};
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
 // Validate the real 100-sphere GPU position computation and fragment loop.
 await adjust('ballSize','3.6');
 await adjust('ior','1.48');
 await adjust('float','.65');
 await adjust('ballCount','100');
 await adjust('spread','65');
 await adjust('distance','155');
 await adjust('altitude','47');
 const many=await frame('100-glass-balls');
 const manyState=await page.evaluate(()=>window.__glassDemo);
 if(manyState.count!==100 || manyState.result.count!==100 ||
    manyState.result.positions.length!==400)throw Error('100 position GPU buffer not present');
 const uniquePos=new Set();
 const waveHeights=[];
 for(let n=0;n<100;n++){
  const p=manyState.result.positions.slice(n*4,n*4+4);
  if(!p.every(Number.isFinite))throw Error('Invalid GPU position '+n);
  uniquePos.add([Math.round(p[0]*10),Math.round(p[2]*10)].join(','));
  waveHeights.push(p[1]);
 }
 if(uniquePos.size<95)throw Error('Sphere centers overlap or do not vary');
 if(Math.max(...waveHeights)-Math.min(...waveHeights)<0.03)throw Error('Spheres do not sample varying FFT heights');
 console.log('100 SPHERES',JSON.stringify({count:manyState.count,uniquePositions:uniquePos.size,heightRange:Math.max(...waveHeights)-Math.min(...waveHeights)}));
 await adjust('ballCount','1');
 const one=await frame('one-glass-ball');
 const manyDiff=countDifference(many,one,14);
 console.log('100 VS 1',JSON.stringify(manyDiff));
 if(manyDiff.changed<250)throw Error('100 sphere count does not affect image');
 await adjust('ballCount','3');
 await adjust('spread','32');
 await adjust('distance','35');
 await adjust('altitude','10');
 await adjust('ior','1.76');
 await adjust('bounces','1');
 const singleBounce=await frame('one-bounce');
 const oneBounceState=await page.evaluate(()=>window.__glassDemo);
 if(oneBounceState.result.bounces!==1)throw Error('Bounce 1 not sent to GPU');
 await adjust('bounces','8');
 const eightBounce=await frame('eight-bounces');
 const eightBounceState=await page.evaluate(()=>window.__glassDemo);
 if(eightBounceState.result.bounces!==8)throw Error('Bounce 8 not sent to GPU');
 const bounceDiff=countDifference(singleBounce,eightBounce,0);
 console.log('BOUNCE 1 VS 8',JSON.stringify(bounceDiff));
 if(bounceDiff.changed<8)throw Error('Bounce slider has no visible effect');
 const display=await page.$eval('#perf',x=>x.textContent);
 if(!display.includes('3 balls')||!display.includes('8 bounces'))
  throw Error('Performance and bounce display not updated '+display);
 // Verify explicit meniscus ON/OFF changes the actual GPU-rendered water geometry.
 // Make the contact circle large enough that the result is visible at 480x300.
 await adjust('ballCount','1');
 await adjust('ballSize','6.5');
 await adjust('float','0');
 await adjust('distance','20');
 await adjust('altitude','7');
 await adjust('ior','1.48');
 await adjust('bounces','2');
 const onSetting=await adjust('meniscus','1');
 if(onSetting.state.meniscus!==true||onSetting.state.result.meniscus!==true)
  throw Error('Meniscus ON did not reach renderer');
 const withMeniscus=await frame('meniscus-on');
 const offSetting=await adjust('meniscus','0');
 if(offSetting.state.meniscus!==false||offSetting.state.result.meniscus!==false)
  throw Error('Meniscus OFF did not reach renderer');
 const noMeniscus=await frame('meniscus-off');
 const contactDifference=countDifference(withMeniscus,noMeniscus,3);
 console.log('MENISCUS ON VS OFF',JSON.stringify(contactDifference));
 if(contactDifference.changed<40)throw Error('Meniscus switch does not visibly change FFT water geometry');
 const orbState=await page.evaluate(()=>window.__glassDemo.result.positions.slice(0,4));
 const halo=checkNoOuterHalo(withMeniscus,noMeniscus,orbState.slice(0,3),orbState[3]);
 console.log('MENISCUS PROJECTED HALO CHECK',JSON.stringify(halo));
 if(halo.outsideChanges>50)throw Error('Meniscus affects pixels well outside sphere contact: '+JSON.stringify(halo));
 if(halo.insideChanges<20)throw Error('Meniscus contact geometry is not visibly represented');
 await adjust('meniscus','1');
 const deeper=await adjust('float','-.5');
 if(deeper.state.float!==-.5)throw Error('Submerged float position is not selectable');
 const partlySubmerged=await frame('float-minus-0.5');
 const immersionDifference=countDifference(withMeniscus,partlySubmerged,10);
 console.log('FLOAT 0 VS -0.5',JSON.stringify(immersionDifference));
 if(immersionDifference.changed<150)throw Error('Changing immersion did not redraw the sphere');
 console.log('PASS MENISCUS ON/OFF + IN-WATER FLOAT RANGE');
 console.log('PASS FFT×5 + 100 spheres + 1..8 glass bounces + GPU readback + UI redraw');
}catch(error){console.error('FAIL:',error);process.exitCode=1;}
finally{await page.close();await browser.close();}
