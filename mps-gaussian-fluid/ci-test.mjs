import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
const logs=[];
let browser;
try {
  browser=await chromium.launch({
    headless:true,
    args:[
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--use-vulkan=swiftshader',
      '--disable-vulkan-fallback-to-gl-for-testing',
      '--use-webgpu-adapter=swiftshader',
      '--enable-webgpu-developer-features',
      '--enable-dawn-features=allow_unsafe_apis',
      '--disable-dawn-features=use_dxc',
      '--use-gpu-in-tests',
      '--enable-unsafe-swiftshader'
    ]
  });
  const page=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:1});
  page.on('console',msg=>logs.push('console '+msg.type()+' '+msg.text()));
  page.on('pageerror',err=>logs.push('pageerror '+err.message));
  page.on('requestfailed',request=>logs.push('network '+request.url()+' '+request.failure()?.errorText));
  await page.goto('http://127.0.0.1:8765/mps-gaussian-fluid/?ci=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.gpuTest==='ok' ||
    document.documentElement.dataset.gpuStage==='error',{timeout:100000});
  const result=await page.evaluate(()=>({...document.documentElement.dataset}));
  if(result.gpuStage==='error')throw Error('GPU error: '+result.gpuError);
  if(result.gpuTest!=='ok'||Number(result.gpuPixels)<40)throw Error('GPU readback invalid: '+JSON.stringify(result));
  await page.locator('#pause').click();
  if(await page.locator('#pause').innerText()!=='再開')throw Error('Pause button did not update');
  await page.locator('#pause').click();
  await page.locator('#rigidity').fill('1.3');
  if(await page.locator('#v-rigidity').innerText()!=='1.3')throw Error('Rigidity UI did not update');
  await page.locator('#count').selectOption('216');
  if(await page.locator('#particleCount').innerText()!=='216')throw Error('Particle reset did not update');
  await page.locator('#shake').click();
  console.log('WEBGPU_PASS',JSON.stringify(result));
  console.log('UI_PASS pause rigidity count shake');
} catch(error) {
  console.error('WEBGPU_TEST_FAILED',error);
  for(const line of logs.slice(-60))console.error(line);
  process.exitCode=1;
} finally {
  await browser?.close();
  server.kill();
}
