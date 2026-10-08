import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('gaussian-splatting-demo');
const server = createServer((req,res)=>{
  const name = new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  const path=resolve(join(root,name));
  if(!path.startsWith(root+'/')&&!path.startsWith(root+'\\')){res.writeHead(403).end();return;}
  try{const body=readFileSync(path);res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html':'text/javascript'}).end(body);}
  catch{res.writeHead(404).end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const flags=[
 '--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader',
 '--disable-vulkan-fallback-to-gl-for-testing','--use-webgpu-adapter=swiftshader',
 '--enable-webgpu-developer-features','--enable-dawn-features=allow_unsafe_apis',
 '--disable-dawn-features=use_dxc','--use-gpu-in-tests','--enable-unsafe-swiftshader',
];
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:flags});
 const page=await browser.newPage({viewport:{width:960,height:600}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')console.log('BROWSER:',m.text())});
 await page.goto(`http://127.0.0.1:${port}/?ci=1`,{waitUntil:'load'});
 await page.waitForFunction(()=>['error','ok'].includes(document.documentElement.dataset.gpuStage),null,{timeout:45000});
 const data=await page.evaluate(()=>({...document.documentElement.dataset}));
 console.log('GPU TEST',JSON.stringify(data));
 if(data.gpuStage!=='ok'||Number(data.gpuPixels)<20)throw Error(data.gpuError||'No rendered Gaussian pixels');
 await page.locator('#scene').selectOption('shell');
 await page.locator('#count').selectOption('1500');
 await page.locator('#points').check();
 if(await page.locator('#countVal').innerText()!=='1,500')throw Error('Count UI not updated');
 if(errors.length)throw Error('Page JS exception: '+errors.join(' | '));
 console.log('PASS: WGSL, pipeline, draw, validation, GPU pixel readback and UI controls');
}finally{await browser?.close();server.close();}