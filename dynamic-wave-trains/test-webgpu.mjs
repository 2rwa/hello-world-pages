import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium']
  .find(existsSync);
if(!chrome)throw Error('Chrome/Chromium is not installed on this runner');
console.log('Browser:',chrome);
const browser=await chromium.launch({
 executablePath:chrome,headless:true,
 args:[
  '--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
  '--disable-vulkan-fallback-to-gl-for-testing',
  '--use-webgpu-adapter=swiftshader',
  '--enable-webgpu-developer-features',
  '--enable-dawn-features=allow_unsafe_apis',
  '--disable-dawn-features=use_dxc',
  '--use-gpu-in-tests','--enable-unsafe-swiftshader',
 ],
});
try {
 const page=await browser.newPage({viewport:{width:960,height:540}});
 page.on('console',message=>console.log('browser console:',message.type(),message.text()));
 page.on('pageerror',error=>console.error('page error:',error));
 const target='http://127.0.0.1:8765/dynamic-wave-trains/?ci=1';
 await page.goto(target,{waitUntil:'load',timeout:30000});
 await page.waitForFunction(()=>{
  const doc=document.documentElement;
  return doc.dataset.test==='ok'||doc.dataset.test==='failed';
 },null,{timeout:90000});
 const result=await page.evaluate(()=>({
  stage:document.documentElement.dataset.stage,
  status:document.documentElement.dataset.test,
  report:window.__oceanTest||null,
  detail:document.getElementById('errorText').textContent,
 }));
 console.log('GPU render result:',JSON.stringify(result,null,2));
 if(result.status!=='ok'||!result.report?.ok)throw Error('GPU render failed: '+JSON.stringify(result));
 if(result.report.colors<12)throw Error('Readback has insufficient image variation');
 await page.evaluate(()=>{
  const control=document.getElementById('ctrl-height');
  control.value='2';
  control.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const sliderText=await page.locator('#ctrl-height').evaluate(node=>
  node.parentElement.querySelector('output').textContent);
 if(!sliderText.startsWith('2.00'))throw Error('Height slider UI did not update: '+sliderText);
 console.log('PASS: compiled WGSL, real offscreen draw, GPU readback, UI state propagation');
} finally {
 await browser.close();
}
