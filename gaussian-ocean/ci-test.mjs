import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const server=spawn('python3',['-m','http.server','8768','--bind','127.0.0.1'],{stdio:'ignore'});
const logs=[];
let browser;
try {
  browser=await chromium.launch({headless:true,args:[
    '--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader',
    '--disable-vulkan-fallback-to-gl-for-testing','--use-webgpu-adapter=swiftshader',
    '--enable-webgpu-developer-features','--enable-dawn-features=allow_unsafe_apis',
    '--disable-dawn-features=use_dxc','--use-gpu-in-tests','--enable-unsafe-swiftshader'
  ]});
  const page=await browser.newPage({viewport:{width:960,height:540}});
  page.on('console',msg=>logs.push('console '+msg.type()+' '+msg.text()));
  page.on('pageerror',error=>logs.push('pageerror '+error.message));
  page.on('requestfailed',request=>logs.push('network '+request.url()+' '+request.failure()?.errorText));
  await page.goto('http://127.0.0.1:8768/gaussian-ocean/?ci=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.test==='ok' || document.querySelector('#gpuStatus').dataset.state==='error',{timeout:100000});
  const output=await page.evaluate(()=>({state:document.querySelector('#gpuStatus').dataset.state,checksum:document.querySelector('#gpuStatus').dataset.checksum,fatal:document.querySelector('#fatal').textContent}));
  if(output.state!=='ok'||Number(output.checksum)<200)throw Error(JSON.stringify(output));
  await page.locator('#seaState').fill('1.8');
  if(await page.locator('#seaStateVal').innerText()!=='1.80')throw Error('Wave energy UI failed');
  await page.locator('#pause').click();
  if(await page.locator('#pause').innerText()!=='RESUME')throw Error('Pause UI failed');
  await page.locator('#gaussianView').check();
  if(!await page.locator('#gaussianView').isChecked())throw Error('Debug UI failed');
  console.log('GAUSSIAN_OCEAN_GPU_PASS',JSON.stringify(output));
  console.log('GAUSSIAN_OCEAN_UI_PASS slider/pause/debug');
} catch(error) {
  console.error('GAUSSIAN_OCEAN_TEST_FAILED',error);
  for(const line of logs.slice(-60))console.error(line);
  process.exitCode=1;
} finally {
  await browser?.close();server.kill();
}
