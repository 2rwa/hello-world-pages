import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const root=process.cwd();
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const filename=resolve(root,'.'+decodeURIComponent(pathname));
 if(!filename.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{let type=extname(filename)==='.html'?'text/html':'text/javascript';
  res.writeHead(200,{'content-type':type}).end(readFileSync(filename));}
 catch{res.writeHead(404).end('missing');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port;
const flags=['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader',
 '--disable-vulkan-fallback-to-gl-for-testing','--use-webgpu-adapter=swiftshader',
 '--enable-webgpu-developer-features','--enable-dawn-features=allow_unsafe_apis',
 '--disable-dawn-features=use_dxc','--use-gpu-in-tests','--enable-unsafe-swiftshader'];
let browser;
async function setRange(page,id,value){
 await page.locator('#'+id).evaluate((el,val)=>{el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}));},String(value));
}
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:flags});
 const page=await browser.newPage({viewport:{width:1100,height:700}});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER ERROR',msg.text());});
 await page.goto('http://127.0.0.1:'+port+'/gaussian-raymarch-hybrid/index.html?ci=1',{waitUntil:'load'});
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.gpuStage),null,{timeout:75000});
 const status=await page.evaluate(()=>({...document.documentElement.dataset}));
 console.log('GPU STATUS',JSON.stringify(status));
 if(status.gpuStage!=='ok')throw Error(status.gpuError||'GPU initialization failed');
 await page.locator('#auto').uncheck();
 mkdirSync('gaussian-raymarch-hybrid/test-screenshots',{recursive:true});
 const shots=[],hashes=[];
 async function check(tag){
  const result=await page.evaluate(()=>window.hybridCiRender());
  console.log(tag,JSON.stringify(result));
  if(result.populated<50)throw Error('blank output: '+tag);
  shots.push(result);hashes.push(result.hash);
  const data=await page.locator('#ciPreview').evaluate(c=>c.toDataURL('image/png'));
  writeFileSync('gaussian-raymarch-hybrid/test-screenshots/'+tag+'.png',Buffer.from(data.split(',')[1],'base64'));
  return result;
 }
 const first=await check('splat-sdf');
 await page.locator('#mode').selectOption('1');
 if(await page.locator('#renderMode').textContent()!=='Volume')throw Error('mode label failed');
 const volume=await check('volume-sdf');
 await page.locator('#mode').selectOption('2');
 const iso=await check('iso-sdf');
 if(new Set(hashes).size!==3)throw Error('three methods rendered identical output');
 await page.locator('#mode').selectOption('0');
 await page.locator('#resolution').selectOption('480x270');
 const resized=await page.evaluate(()=>window.hybridCiRender());
 if(resized.width!==480||resized.height!==270||await page.locator('#resolutionVal').textContent()!=='480×270')throw Error('resolution selection failed');
 await page.locator('#resolution').selectOption('320x180');
 await page.locator('#scene').selectOption('halo');const changed=await page.evaluate(()=>window.hybridCiRender());
 if(changed.hash===first.hash)throw Error('scene selection had no visual effect');
 await page.locator('#count').selectOption('32');const increased=await page.evaluate(()=>window.hybridCiRender());
 if(increased.hash===changed.hash||await page.locator('#countVal').textContent()!=='32')throw Error('count selection ineffective');
 await setRange(page,'density',2.2);
 if(await page.locator('#densityVal').textContent()!=='2.20×')throw Error('density output not updated');
 const dense=await page.evaluate(()=>window.hybridCiRender());if(dense.hash===increased.hash)throw Error('density did not alter image');
 await setRange(page,'glass',1.35);
 const bigger=await page.evaluate(()=>window.hybridCiRender());if(bigger.hash===dense.hash)throw Error('sphere radius did not alter image');
 await setRange(page,'scale',1.35);
 const spread=await page.evaluate(()=>window.hybridCiRender());if(spread.hash===bigger.hash)throw Error('Gaussian scale did not alter image');
 await page.locator('#regen').click();
 const regen=await page.evaluate(()=>window.hybridCiRender());if(regen.hash===spread.hash)throw Error('regeneration had no effect');
 await page.mouse.move(750,410);await page.mouse.down();await page.mouse.move(860,460,{steps:4});await page.mouse.up();
 const rotated=await page.evaluate(()=>window.hybridCiRender());if(rotated.hash===regen.hash)throw Error('camera drag did not alter image');
 await page.mouse.wheel(0,300);
 const zoom=await page.evaluate(()=>window.hybridCiRender());if(zoom.hash===rotated.hash)throw Error('wheel zoom did not alter image');
 await page.locator('#reset').click();
 const reset=await page.evaluate(()=>window.hybridCiRender());if(reset.hash!==regen.hash)throw Error('reset did not restore view');
 if(errors.length)throw Error('JS errors: '+errors.join(' / '));
 console.log('PASS: real GPU readback for 3 modes + resolution + camera + UI updates');
}finally{await browser?.close();server.close();}
