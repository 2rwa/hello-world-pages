import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const root=process.cwd();
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 const filename=resolve(root,'.'+decodeURIComponent(pathname));
 if(!filename.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{const bytes=readFileSync(filename);const type=extname(filename)==='.html'?'text/html':'text/javascript';res.writeHead(200,{'content-type':type}).end(bytes);}catch{res.writeHead(404).end('missing');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port;
const flags=['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--disable-vulkan-fallback-to-gl-for-testing','--use-webgpu-adapter=swiftshader','--enable-webgpu-developer-features','--enable-dawn-features=allow_unsafe_apis','--disable-dawn-features=use_dxc','--use-gpu-in-tests','--enable-unsafe-swiftshader'];
let browser;
async function setRange(page,id,value){await page.locator('#'+id).evaluate((el,val)=>{el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}));},String(value));}
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:flags});
 const page=await browser.newPage({viewport:{width:1120,height:720}});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER ERROR',msg.text());});
 await page.goto('http://127.0.0.1:'+port+'/gaussian-raymarch-clownfish/index.html?ci=1',{waitUntil:'load'});
 await page.waitForFunction(()=>['ok','error'].includes(document.documentElement.dataset.gpuStage),null,{timeout:75000});
 const status=await page.evaluate(()=>({...document.documentElement.dataset}));
 console.log('GPU STATUS',JSON.stringify(status));
 if(status.gpuStage!=='ok') throw Error(status.gpuError||'GPU initialization failed');
 await page.locator('#auto').uncheck();
 mkdirSync('gaussian-raymarch-clownfish/test-screenshots',{recursive:true});
 async function grab(tag){ const result=await page.evaluate(()=>window.clownfishCiRender()); console.log(tag,JSON.stringify(result)); if(result.populated<50) throw Error('blank output: '+tag); const data=await page.locator('#ciPreview').evaluate(c=>c.toDataURL('image/png')); writeFileSync('gaussian-raymarch-clownfish/test-screenshots/'+tag+'.png',Buffer.from(data.split(',')[1],'base64')); return result; }
 const a=await grab('splat');
 await page.locator('#mode').selectOption('1'); const b=await grab('volume');
 await page.locator('#mode').selectOption('2'); const c=await grab('iso');
 if(new Set([a.hash,b.hash,c.hash]).size!==3) throw Error('different render modes produced identical output');
 await page.locator('#resolution').selectOption('480x270'); const resized=await page.evaluate(()=>window.clownfishCiRender());
 if(resized.width!==480||resized.height!==270||await page.locator('#resolutionVal').textContent()!=='480×270') throw Error('resolution selection failed');
 await page.locator('#resolution').selectOption('320x180');
 await page.locator('#count').selectOption('512'); const counted=await page.evaluate(()=>window.clownfishCiRender()); if(counted.hash===a.hash) throw Error('count selection ineffective');
 await setRange(page,'density',1.95); if(await page.locator('#densityVal').textContent()!=='1.95×') throw Error('density label not updated'); const d=await page.evaluate(()=>window.clownfishCiRender()); if(d.hash===counted.hash) throw Error('density change ineffective');
 await setRange(page,'glass',1.20); const e=await page.evaluate(()=>window.clownfishCiRender()); if(e.hash===d.hash) throw Error('glass radius ineffective');
 await setRange(page,'scale',1.35); const f=await page.evaluate(()=>window.clownfishCiRender()); if(f.hash===e.hash) throw Error('Gaussian scale ineffective');
 await page.locator('#regen').click(); const g=await page.evaluate(()=>window.clownfishCiRender()); if(g.hash===f.hash) throw Error('reseed had no effect');
 await page.mouse.move(760,420); await page.mouse.down(); await page.mouse.move(880,460,{steps:4}); await page.mouse.up(); const h=await page.evaluate(()=>window.clownfishCiRender()); if(h.hash===g.hash) throw Error('camera drag ineffective');
 await page.mouse.wheel(0,300); const i=await page.evaluate(()=>window.clownfishCiRender()); if(i.hash===h.hash) throw Error('wheel zoom ineffective');
 await page.locator('#reset').click(); const j=await page.evaluate(()=>window.clownfishCiRender()); if(j.hash!==g.hash) throw Error('reset did not restore pre-drag view');
 if(errors.length) throw Error('JS page errors: '+errors.join(' / '));
 console.log('PASS: clownfish photo Gaussian demo modes, resolution, UI, regenerate and camera controls');
} finally { await browser?.close(); server.close(); }
