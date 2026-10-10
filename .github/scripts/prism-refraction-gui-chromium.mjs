import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

mkdirSync('artifacts/gui',{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{timeout:30000});
const context=browser.contexts()[0];
const page=context.pages()[0]??await context.newPage();
const runtimeErrors=[];
page.on('console',msg=>{if(msg.type()==='error')runtimeErrors.push(msg.text())});
page.on('pageerror',e=>runtimeErrors.push('JS: '+e.message));
const target=process.env.PRISM_TEST_URL||
 'https://2rwa.github.io/hello-world-pages/prism-refraction-lab/?ubuntu-gui=1';
let report={target,engine:'graphical-chrome-under-xvfb'};
try{
 const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
 report.httpStatus=response?.status()??null;
 const started=Date.now();
 let state={};
 while(Date.now()-started<100000){
  state=await page.evaluate(()=>({
   status:window.__labTest?.status??null,
   stage:window.__labTest?.stage??null,
   frames:window.__labTest?.frames??0,
   presentation:window.__labTest?.presentation??null,
   presentedFrames:window.__labTest?.presentedFrames??0,
   error:window.__labTest?.error??null,
   lost:window.__labTest?.lost??null,
   width:document.querySelector('#screen')?.width,
   height:document.querySelector('#screen')?.height
  }));
  if(state.status==='error')break;
  if(state.status==='ok'&&state.frames>=3&&
    (state.presentation!=='offscreen-webgpu-canvas2d'||state.presentedFrames>=2))break;
  await page.waitForTimeout(700);
 }
 report.state=state;
 const image=await page.screenshot({path:'artifacts/gui/prism-chromium-before.png',animations:'disabled'});
 const png=PNG.sync.read(image);
 let sum=0,sum2=0,min=255,max=0,bright=0,samples=0;
 // Sample only stage area, not the controls/text overlay. Require real image variation.
 for(let y=110;y<Math.min(png.height-60,620);y+=8){
  for(let x=Math.floor(png.width*.42);x<Math.min(png.width-40,1100);x+=8){
   const i=(y*png.width+x)*4;
   const intensity=(png.data[i]+png.data[i+1]+png.data[i+2])/3;
   sum+=intensity;sum2+=intensity*intensity;
   min=Math.min(min,intensity);max=Math.max(max,intensity);
   if(intensity>35)bright++;samples++;
  }
 }
 report.picture={width:png.width,height:png.height,min,max,
  stdev:Math.sqrt(Math.max(0,sum2/samples-(sum/samples)**2)),bright,samples};
 const slider=page.locator('#morph');
 await slider.evaluate(el=>{
  el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await page.waitForTimeout(1000);
 report.morphReadout=await page.locator('#morphVal').textContent();
 await page.screenshot({path:'artifacts/gui/prism-chromium-after.png'});
 report.runtimeErrors=runtimeErrors;
 writeFileSync('artifacts/gui/report.json',JSON.stringify(report,null,2));
 console.log('VISIBLE CHROMIUM:',JSON.stringify(report));
 assert.equal(report.httpStatus,200,'Pages HTTP response');
 assert.equal(state.status,'ok','WebGPU error on real GUI path');
 assert.ok(state.frames>=3,'Canvas renderer did not advance');
 assert.ok(png.width>=800&&png.height>=500,'Desktop screenshot unexpectedly small');
 assert.ok(report.picture.stdev>4&&report.picture.max-report.picture.min>35,
  'Browser screenshot appears blank or flat');
 assert.equal(report.morphReadout,'1.00','GUI slider input did not update');
 console.log('PASS: graphical Chromium real window, screenshot pixels, morph interaction');
}catch(e){
 report.error=e.stack||String(e);
 report.runtimeErrors=runtimeErrors;
 writeFileSync('artifacts/gui/report.json',JSON.stringify(report,null,2));
 try{await page.screenshot({path:'artifacts/gui/prism-chromium-error.png'})}catch{}
 console.error(report.error);
 process.exitCode=1;
}finally{await browser.close()}
