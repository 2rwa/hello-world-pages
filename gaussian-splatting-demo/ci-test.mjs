import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('gaussian-splatting-demo');
const server = createServer((req,res)=>{
  const name = new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(name==='favicon.ico'){res.writeHead(204).end();return;}
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
 await page.locator('#auto').uncheck();
 await page.locator('#count').selectOption('1500');
 if(await page.locator('#countVal').innerText()!=='1,500')throw Error('Count UI not updated');
 mkdirSync('gaussian-splatting-demo/test-screenshots',{recursive:true});
 const hashes=[];
 for(const scene of ['galaxy','torus','flower','shell']){
  await page.locator('#scene').selectOption(scene);
  const result=await page.evaluate(()=>window.gsCiRender());
  if(result.populated<20)throw Error(scene+' produced blank image');
  hashes.push(result.hash);
  const png=await page.locator('#ciPreview').evaluate(canvas=>canvas.toDataURL('image/png'));
  writeFileSync('gaussian-splatting-demo/test-screenshots/'+scene+'.png',Buffer.from(png.split(',')[1],'base64'));
  console.log('SCENE',scene,JSON.stringify(result));
 }
 if(new Set(hashes).size!==4)throw Error('Not all scenes generated distinct images');
 const before=hashes[3];
 await page.locator('#points').check();
 const pts=await page.evaluate(()=>window.gsCiRender());
 if(pts.hash===before||pts.populated<20)throw Error('Point mode did not change the rendered output');
 await page.locator('#points').uncheck();
 await page.locator('#opacity').evaluate(e=>{e.value='1.4';e.dispatchEvent(new Event('input',{bubbles:true}));});
 if(await page.locator('#opacityVal').innerText()!=='1.40×')throw Error('Opacity UI did not update');
 const opacity=await page.evaluate(()=>window.gsCiRender());
 if(opacity.hash===before)throw Error('Opacity slider did not affect GPU output');
 await page.locator('#size').evaluate(e=>{e.value='1.65';e.dispatchEvent(new Event('input',{bubbles:true}));});
 if(await page.locator('#sizeVal').innerText()!=='1.65×')throw Error('Size UI did not update');
 const size=await page.evaluate(()=>window.gsCiRender());
 if(size.hash===opacity.hash)throw Error('Size slider did not affect GPU output');
 await page.locator('#regen').click();
 const regenerated=await page.evaluate(()=>window.gsCiRender());
 if(regenerated.hash===size.hash)throw Error('Regenerate did not change scene data');
 await page.mouse.move(650,420);
 await page.mouse.down();
 await page.mouse.move(770,460,{steps:4});
 await page.mouse.up();
 const rotated=await page.evaluate(()=>window.gsCiRender());
 if(rotated.hash===regenerated.hash)throw Error('Pointer drag did not rotate camera');
 await page.mouse.wheel(0,300);
 const zoomed=await page.evaluate(()=>window.gsCiRender());
 if(zoomed.hash===rotated.hash)throw Error('Mouse wheel did not zoom');
 await page.locator('#reset').click();
 const reset=await page.evaluate(()=>window.gsCiRender());
 if(reset.hash!==regenerated.hash)throw Error('Reset camera did not restore view');
 if(errors.length)throw Error('Page JS exception: '+errors.join(' | '));
 console.log('PASS: four scenes, GPU screenshots, pointer rotation, wheel zoom, camera reset and UI parameter changes');
}finally{await browser?.close();server.close();}