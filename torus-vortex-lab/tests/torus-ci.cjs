const fs=require('fs');
const path=require('path');
const {chromium}=(()=>{try{return require('playwright-core')}catch{return require('playwright')}})();
(async()=>{
 const args=[
  '--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-webgpu',
  '--enable-features=Vulkan','--use-vulkan=swiftshader',
  '--disable-vulkan-fallback-to-gl-for-testing','--use-webgpu-adapter=swiftshader',
  '--enable-webgpu-developer-features','--enable-dawn-features=allow_unsafe_apis',
  '--disable-dawn-features=use_dxc','--use-gpu-in-tests','--enable-unsafe-swiftshader'
 ];
 const executablePath=process.env.CHROME_BIN||'/usr/bin/google-chrome';
 const browser=await chromium.launch({executablePath,headless:true,args});
 const page=await browser.newPage({viewport:{width:900,height:660}});
 const diagnostics=[];
 page.on('console',message=>diagnostics.push('console:'+message.type()+':'+message.text()));
 page.on('pageerror',error=>diagnostics.push('pageerror:'+error.message));
 try{
  await page.goto('http://127.0.0.1:8765/torus-vortex-lab/?ci=1',{waitUntil:'load'});
  await page.waitForFunction(()=>['ok','error'].includes(document.body.dataset.testStatus),null,{timeout:60000});
  const initial=await page.evaluate(()=>({
   status:document.body.dataset.testStatus,hash:document.body.dataset.frameHash,
   range:document.body.dataset.frameRange,message:document.querySelector('#status').textContent
  }));
  console.log('Initial GPU readback:',initial);
  if(initial.status!=='ok'||Number(initial.range)<12)
   throw Error('Initial GPU readback failed: '+JSON.stringify(initial));
  await page.locator('#smokeDensity').evaluate(el=>{
   el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForFunction(previous=>
    document.body.dataset.testStatus==='error'||document.body.dataset.frameHash!==previous,
    initial.hash,{timeout:30000});
  const changed=await page.evaluate(()=>({
   status:document.body.dataset.testStatus,hash:document.body.dataset.frameHash,
   range:document.body.dataset.frameRange
  }));
  if(changed.status!=='ok'||changed.hash===initial.hash)
   throw Error('Smoke slider did not change rendered pixels: '+JSON.stringify(changed));
  console.log('Smoke density changed GPU pixels:',changed);
  const panel=page.locator('#panel');
  if(!await panel.evaluate(el=>el.open))throw Error('Desktop panel unexpectedly closed');
  await page.locator('#panel>summary').click();
  if(await panel.evaluate(el=>el.open))throw Error('Control panel did not collapse');
  await page.locator('#panel>summary').click();
  await page.locator('#reset').click();
  if(await page.locator('#smokeDensity').inputValue()!=='1.35')
   throw Error('Reset failed to restore smoke density');
  await page.evaluate(()=>{
   const preview=document.querySelector('#probe');preview.hidden=false;
   preview.style.cssText='position:fixed;left:8px;top:8px;width:640px;height:480px;image-rendering:pixelated;z-index:10000';
  });
  fs.mkdirSync('test-artifacts',{recursive:true});
  await page.locator('#probe').screenshot({path:path.join('test-artifacts','torus-readback.png')});
  console.log('PASS: WGSL compile, pipeline, draw, submit, readback, slider pixels, panel, reset');
 }catch(error){
  console.error('FAILED',error);
  console.error(diagnostics.join('\n'));
  fs.mkdirSync('test-artifacts',{recursive:true});
  await page.screenshot({path:path.join('test-artifacts','torus-error.png')}).catch(()=>{});
  process.exitCode=1;
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
