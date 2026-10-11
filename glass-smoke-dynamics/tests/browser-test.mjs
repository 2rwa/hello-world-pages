import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {testPhysics,defaults,createWorld,stepWorld} from '../physics.js';
const result=testPhysics();
console.log('PHYSICS UNIT TEST',result);
assert.ok(result.passed,'3D gravity, shell containment and smoke exclusion physics');
const pairCfg={...defaults,ballCount:2,smokeCount:0,gravity:0,restitution:.9};
const pair=createWorld(pairCfg,82);
for(const ball of pair.balls){ball.r=.2;ball.mass=.008;}
pair.balls[0].p=[-.12,0,0];pair.balls[1].p=[.12,0,0];pair.balls[0].v=[1,0,0];pair.balls[1].v=[-1,0,0];
stepWorld(pair,pairCfg,1/60);
assert.ok(Math.hypot(...pair.balls[0].p.map((v,i)=>v-pair.balls[1].p[i]))>=pair.balls[0].r+pair.balls[1].r-.002,'sphere-sphere depenetration');
assert.ok(pair.balls[0].v[0]<0&&pair.balls[1].v[0]>0,'sphere-sphere impulse');

const launchArgs=[
 '--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-webgpu',
 '--enable-features=Vulkan','--use-vulkan=swiftshader',
 '--disable-vulkan-fallback-to-gl-for-testing','--use-webgpu-adapter=swiftshader',
 '--enable-webgpu-developer-features','--enable-dawn-features=allow_unsafe_apis',
 '--disable-dawn-features=use_dxc','--use-gpu-in-tests','--enable-unsafe-swiftshader'
];
const executablePath=process.env.CHROME_BIN||'/usr/bin/google-chrome';
const browser=await chromium.launch({executablePath,headless:true,args:launchArgs});
const page=await browser.newPage({viewport:{width:1152,height:780}});
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text());else if(message.text().includes('GPU'))console.log('PAGE',message.text())});
page.on('pageerror',error=>errors.push('pageerror: '+error.message));
try{
 await page.goto('http://127.0.0.1:8765/glass-smoke-dynamics/?ci=1',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.__app?.ready||document.documentElement.dataset.gpuPhase==='error',{timeout:80000});
 let phase=await page.evaluate(()=>({phase:window.__gpuPhase,error:window.__gpuError||'',log:window.__app?.renderer.log,warnings:window.__app?.renderer.shaderWarnings}));
 console.log('WEBGPU PIPELINE',phase);
 assert.equal(phase.error,'','Shader/device should initialize on SwiftShader');
 assert.equal(phase.phase,'pipeline-ready');
 const makeSnapshot=async(mode)=>page.evaluate(async m=>window.__app.snapshot(m),mode);
 await page.evaluate(()=>{window.__app.setControl('quality','low');window.__app.setControl('smokeCount',220);});
 const full=await makeSnapshot(0),shell=await makeSnapshot(1),smoke=await makeSnapshot(2),glass=await makeSnapshot(3),bare=await makeSnapshot(4);
 const dist=(a,b)=>{
  let error=0,changed=0;
  for(let i=0;i<a.pixels.length;i+=4){
   const delta=Math.abs(a.pixels[i]-b.pixels[i])+Math.abs(a.pixels[i+1]-b.pixels[i+1])+Math.abs(a.pixels[i+2]-b.pixels[i+2]);
   error+=delta;if(delta>25)changed++;
  }
  return {meanChannelDifference:error/(a.pixels.length*.75),changedFraction:changed/(a.pixels.length/4)};
 };
 const signals={full:{mean:full.mean,variance:full.variance},shell:{mean:shell.mean,variance:shell.variance},smoke:{mean:smoke.mean,variance:smoke.variance},glass:{mean:glass.mean,variance:glass.variance},
  fullToShell:dist(full,shell),fullToSmoke:dist(full,smoke),fullToGlass:dist(full,glass),smokeToShell:dist(smoke,shell),glassToShell:dist(glass,shell),smokeToBare:dist(smoke,bare),glassToBare:dist(glass,bare),shellToBare:dist(shell,bare)};
 console.log('OFFSCREEN GPU READBACK',JSON.stringify(signals));
 assert.ok(full.gpuComplete&&shell.gpuComplete&&smoke.gpuComplete&&glass.gpuComplete,'queue.onSubmittedWorkDone must complete');
 assert.ok(full.variance>8,'Scene must contain visible rendered structure, not a blank clear');
 assert.ok(signals.smokeToBare.meanChannelDifference>.12,'Smoke must contribute visible pixels');
 assert.ok(signals.glassToBare.meanChannelDifference>.12,'Refractive marbles must contribute visible pixels');
 assert.ok(signals.fullToShell.meanChannelDifference>.14,'Combined scene must differ from empty shell');
 assert.ok(signals.shellToBare.meanChannelDifference>.05,'Glass shell must change pixels');
 const png=new PNG({width:full.width,height:full.height});
 png.data=Buffer.from(full.pixels);fs.writeFileSync('glass-smoke-gpu-readback.png',PNG.sync.write(png));
 // UI: direct input + range slider linkage; controls must reach the physics simulation.
 const slider=id=>page.locator('#range-'+id);
 await slider('gravity').evaluate(el=>{el.value='-11';el.dispatchEvent(new Event('input',{bubbles:true}))});
 const gravity=await page.evaluate(()=>({num:document.getElementById('num-gravity').value,config:window.__app.cfg.gravity,position:window.__app.world.balls[0].p[1]}));
 assert.equal(gravity.num,'-11');assert.equal(gravity.config,-11);
 const posBefore=gravity.position;
 await page.evaluate(()=>window.__app.step(40));
 const posAfter=await page.evaluate(()=>window.__app.world.balls[0].p[1]);
 assert.ok(posAfter>posBefore+.1,'reverse gravity should produce upward movement');
 const changed=await makeSnapshot(0);
 assert.ok(changed.gpuComplete);
 // Mobile drawer actually opens and its sliders stay usable.
 await page.setViewportSize({width:390,height:844});
 await page.locator('#settings-toggle').click();
 assert.ok(await page.locator('#settings').evaluate(el=>el.classList.contains('open')));
 assert.equal(await page.locator('#settings-toggle').getAttribute('aria-expanded'),'true');
 await slider('buoyancy').evaluate(el=>{el.value='2.8';el.dispatchEvent(new Event('input',{bubbles:true}))});
 assert.equal(await page.evaluate(()=>window.__app.cfg.buoyancy),2.8);
 const mobile=await makeSnapshot(0);assert.ok(mobile.gpuComplete&&mobile.variance>5);
 await page.locator('#close-panel').click();
 assert.ok(!(await page.locator('#settings').evaluate(el=>el.classList.contains('open'))));
 console.log('MOBILE UI & GPU PASS',{width:mobile.width,height:mobile.height,variance:mobile.variance});
 assert.equal(errors.filter(e=>/WGSL|validation|WebGPU.*error|TypeError|ReferenceError/.test(e)).length,0,'Browser JS/WebGPU errors: '+errors.join('; '));
 console.log('PASS: physics, shader compile, actual GPU submit/readback, glass, smoke, shell, interaction, reverse gravity, desktop/mobile controls');
}catch(err){
 console.error('WEBGPU TEST FAILURE',err,errors);
 console.error('GPU STATE',await page.evaluate(()=>({phase:window.__gpuPhase,error:window.__gpuError,status:document.getElementById('status')?.textContent})).catch(()=>({})));
 process.exitCode=1;
}finally{await browser.close();}
