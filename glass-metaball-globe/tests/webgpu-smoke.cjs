const puppeteer = require('puppeteer-core');
const {execFileSync} = require('node:child_process');
const chrome = process.env.CHROME_BIN || execFileSync('which',['google-chrome']).toString().trim();
(async () => {
  const browser = await puppeteer.launch({executablePath:chrome,headless:true,args:[
    '--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-webgpu','--enable-features=Vulkan',
    '--use-vulkan=swiftshader','--disable-vulkan-fallback-to-gl-for-testing',
    '--use-webgpu-adapter=swiftshader','--enable-webgpu-developer-features',
    '--enable-dawn-features=allow_unsafe_apis','--disable-dawn-features=use_dxc',
    '--use-gpu-in-tests','--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage();
    page.on('console',m=>console.log('[browser]',m.type(),m.text()));
    page.on('pageerror',e=>console.error('[pageerror]',e.message));
    await page.goto('http://127.0.0.1:8765/glass-metaball-globe/?ci=1',{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>['ok','failed'].includes(document.body.dataset.testStep),{timeout:180000});
    const result=await page.evaluate(()=>window.__testState);
    console.log('Shader + render + GPU readback:',JSON.stringify(result));
    if(result.step!=='ok')throw Error('WebGPU failure: '+result.detail);
    const versions=[];
    for(const count of [0,24,64]){
      const v=await page.evaluate(async count=>{
        window.__simDebug.configure({glass:count,opaque:0});
        const pixels=await window.__ciDraw();
        return {count,glassCount:window.__simDebug.bodies.filter(b=>b.glass).length,pixels};
      },count);
      console.log('GLASS FIELD RENDER:',JSON.stringify(v));
      if(v.glassCount!==count)throw Error('Count regression '+count);
      versions.push(v);
    }
    if(versions[0].pixels.checksum===versions[2].pixels.checksum)throw Error('Glass surface did not change image at count=64');
    console.log('WEBGPU GLASS METABALL CI: OK');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
