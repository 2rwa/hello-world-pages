import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
function browserPath(){
 for(const n of ['google-chrome','google-chrome-stable','chromium','chromium-browser'])try{return execFileSync('which',[n],{encoding:'utf8'}).trim()}catch{}
 throw Error('Chrome/Chromium was not found');
}
const browser=await chromium.launch({headless:true,executablePath:browserPath(),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1260,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto('http://127.0.0.1:8765/splat-drift/?smoke=1');
 await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',{timeout:10000});
 await page.waitForTimeout(650);
 let state=await page.evaluate(()=>window.__SPLAT_DEBUG__.getState());
 assert.equal(state.state,'running');assert.ok(state.splats>1000,'must render real Gaussian instances');
 assert.deepEqual(state.resolution,[480,270]);
 await page.locator('#resolution').selectOption('960');
 state=await page.evaluate(()=>window.__SPLAT_DEBUG__.getState());
 assert.deepEqual(state.resolution,[960,540],'resolution selector must resize GPU canvas');
 const beforeX=state.ship.x;
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(350);await page.keyboard.up('ArrowRight');
 state=await page.evaluate(()=>window.__SPLAT_DEBUG__.getState());
 assert.ok(state.ship.x>beforeX+.2,'keyboard motion must affect ship position');
 await page.locator('#pulse').click();
 state=await page.evaluate(()=>window.__SPLAT_DEBUG__.getState());
 assert.ok(state.cooldown>0,'pulse must start cooldown');
 assert.notEqual(await page.locator('#pulseFill').getAttribute('style'),'width: 100%;','pulse meter must update');
 await page.keyboard.press('p');assert.equal((await page.evaluate(()=>window.__SPLAT_DEBUG__.getState())).state,'paused');
 await page.locator('#start').click();assert.equal((await page.evaluate(()=>window.__SPLAT_DEBUG__.getState())).state,'running');
 await page.locator('#restart').click();state=await page.evaluate(()=>window.__SPLAT_DEBUG__.getState());assert.equal(state.health,3);assert.equal(state.score,0);
 mkdirSync('splat-drift/test-output',{recursive:true});await page.screenshot({path:'splat-drift/test-output/browser-smoke.png'});
 assert.deepEqual(errors,[],'no uncaught browser errors');
 console.log('PASS browser gameplay, WebGL2 splats, controls, resolution, pulse, restart',state);
}finally{await browser.close()}
