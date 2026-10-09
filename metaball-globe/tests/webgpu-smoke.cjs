const puppeteer = require('puppeteer-core');
const {execFileSync} = require('node:child_process');
const chrome = process.env.CHROME_BIN || execFileSync('which', ['google-chrome']).toString().trim();
(async () => {
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true,
    args: [
      '--no-sandbox', '--disable-dev-shm-usage',
      '--enable-unsafe-webgpu', '--enable-features=Vulkan',
      '--use-vulkan=swiftshader', '--disable-vulkan-fallback-to-gl-for-testing',
      '--use-webgpu-adapter=swiftshader', '--enable-webgpu-developer-features',
      '--enable-dawn-features=allow_unsafe_apis', '--disable-dawn-features=use_dxc',
      '--use-gpu-in-tests', '--enable-unsafe-swiftshader'
    ]
  });
  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('[browser]', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('[pageerror]', err.message));
    await page.goto('http://127.0.0.1:8765/metaball-globe/?ci=1', {waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(() => ['ok','failed'].includes(document.body.dataset.testStep), {timeout:120000});
    const info = await page.evaluate(() => window.__testState);
    console.log('WebGPU pipeline / submit / readback:', JSON.stringify(info));
    if(info.step !== 'ok') throw Error('WebGPU smoke test failed: '+info.detail);
    const result = await page.evaluate(() => {
      const physics = window.__simDebug;
      physics.reset();
      let worst = 0, outside = 0, checks = 0;
      for(let frame=0;frame<300;frame++) {
        physics.simulate(1/120);
        const bodies=physics.bodies;
        for(let i=0;i<bodies.length;i++) {
          const a=bodies[i], da=Math.hypot(...a.pos);
          outside=Math.max(outside, da+a.radius-2.4);
          for(let j=i+1;j<bodies.length;j++) {
            const b=bodies[j];
            const d=Math.hypot(...a.pos.map((v,k)=>v-b.pos[k]));
            const min=a.radius+b.radius+(a.glass!==b.glass?.15:.008);
            worst=Math.max(worst,min-d); checks++;
          }
        }
      }
      return {checks,maxOverlap:worst,maxOutside:outside};
    });
    console.log('Physics:', JSON.stringify(result));
    if(result.maxOverlap > .03 || result.maxOutside > .03) throw Error('Collision boundary invariant failed');
    console.log('METABALL GLOBE CI: OK');
  } finally { await browser.close(); }
})().catch(err => {console.error(err);process.exitCode=1;});
