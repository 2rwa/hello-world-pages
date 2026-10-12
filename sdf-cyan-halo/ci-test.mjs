import puppeteer from 'puppeteer-core';
import {stat} from 'node:fs/promises';
const flags='--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --disable-vulkan-fallback-to-gl-for-testing --use-webgpu-adapter=swiftshader --enable-webgpu-developer-features --enable-dawn-features=allow_unsafe_apis --disable-dawn-features=use_dxc --use-gpu-in-tests --enable-unsafe-swiftshader --no-sandbox --disable-dev-shm-usage'.split(' ');
const headed=process.env.HALO_HEADED==='1';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:!headed,args:flags});
try{
 console.log('Chrome:',await browser.version(),'headed:',headed);
 const page=await browser.newPage();
 page.on('console',m=>console.log('Console:',m.type(),m.text()));
 page.on('pageerror',e=>console.log('PageError:',e.stack));
 await page.setViewport({width:880,height:700,deviceScaleFactor:1});
 await page.goto('http://127.0.0.1:8000/sdf-cyan-halo/?ci=offscreen',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>['ok','error'].includes(window.__haloState?.phase),{timeout:120000});
 const first=await page.evaluate(()=>window.__haloState);
 console.log('Offscreen:',JSON.stringify(first));
 if(!first.ok||first.partCount<60||first.pixels.bright<15)throw Error('Offscreen WebGPU incomplete: '+JSON.stringify(first));
 const firstSign=first.pixels.signature;
 await page.$eval('#halo',e=>{e.value='1.34';e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(sig=>window.__haloState?.pixels?.signature!==sig, {timeout:120000},firstSign);
 const changed=await page.evaluate(()=>window.__haloState);
 console.log('Halo resized:',JSON.stringify(changed));
 if(!changed.ok||changed.pixels.signature===firstSign)throw Error('Halo slider did not change GPU pixels');
 await page.$eval('#mode',e=>{e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}));});
 const secondSign=changed.pixels.signature;
 await page.waitForFunction(sig=>window.__haloState?.pixels?.signature!==sig,{timeout:120000},secondSign);
 const normals=await page.evaluate(()=>window.__haloState);
 if(!normals.ok)throw Error('Normal mode did not render');
 await page.click('#reset');
 if(await page.$eval('#halo',e=>+e.value)!==1)throw Error('Reset did not update halo slider');
 // Model is actual 3D signed-distance data: check CPU mirror and primitive packing.
 const sdf=await page.evaluate(async()=>{
  const m=await import('./model.js');const cpu=await import('./sdf-cpu.js');
  const p=m.buildScene(),v=m.packScene(p);
  return {count:p.length,packed:v.length,helmet:cpu.sceneDistance([0,1.27,0],p).distance,
   empty:cpu.sceneDistance([5,5,5],p).distance,far:cpu.sceneDistance([0,0,8],p).distance};
 });
 console.log('SDF CPU:',JSON.stringify(sdf));
 if(sdf.count<60||sdf.packed!==2048||sdf.helmet>=0||sdf.empty<1||sdf.far<1)throw Error('Invalid SDF geometry: '+JSON.stringify(sdf));
 const view=await browser.newPage();
 view.on('pageerror',e=>console.log('CanvasPageError:',e.message));
 await view.setViewport({width:900,height:660,deviceScaleFactor:1});
 await view.goto('http://127.0.0.1:8000/sdf-cyan-halo/?ci=canvas',{waitUntil:'domcontentloaded'});
 await view.waitForFunction(()=>['ok','error'].includes(window.__haloState?.phase),{timeout:90000});
 const canvasState=await view.evaluate(()=>window.__haloState);
 console.log('Canvas:',JSON.stringify(canvasState));
 if(canvasState.ok){
  await view.screenshot({path:'sdf-cyan-halo/canvas-smoke.png'});
  const screenshot=await stat('sdf-cyan-halo/canvas-smoke.png');
  if(screenshot.size<5000)throw Error('Screenshot unexpectedly small '+screenshot.size);
  console.log('Canvas screenshot:',screenshot.size);
 }else if(headed)throw Error('Headed canvas failed: '+JSON.stringify(canvasState));
 else console.log('Headless swapchain unavailable, offscreen readback validated WGSL/render');
}finally{await browser.close();}
