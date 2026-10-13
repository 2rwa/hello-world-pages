import puppeteer from 'puppeteer-core';
import {stat} from 'node:fs/promises';
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
 headless:true,
 args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl-software-rendering','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']
});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',err=>errors.push('pageerror '+err.stack));
page.on('console',msg=>{if(msg.type()==='error')errors.push('console '+msg.text())});
page.on('response',response=>{if(response.status()>=400)errors.push('HTTP '+response.status()+' '+response.url())});
const base=process.env.TEST_URL||'http://127.0.0.1:8000/metaball-skirmish/';
const assert=(condition,message)=>{if(!condition)throw Error(message)};
try{
 await page.setViewport({width:1100,height:820,deviceScaleFactor:1});
 await page.goto(base,{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>window.__liquidStrike?.debug,{timeout:12000});
 const initial=await page.evaluate(()=>window.__liquidStrike.debug);
 assert(initial.status==='title','initial state not title: '+JSON.stringify(initial));
 await page.click('#start');
 await page.waitForFunction(()=>window.__liquidStrike.debug.time>1.4,{timeout:10000});
 const state=await page.evaluate(()=>window.__liquidStrike.debug);
 assert(state.status==='running'&&state.wave===1,'game did not start '+JSON.stringify(state));
 assert(state.gl,'WebGL2 metaball shader did not compile/initialize: '+JSON.stringify(state));
 assert(state.blobCount>0,'no metaball geometry rendered: '+JSON.stringify(state));
 assert(state.shots>0,'no automatic shooting: '+JSON.stringify(state));
 const before=state.playerX;
 await page.keyboard.down('ArrowRight');await new Promise(r=>setTimeout(r,500));await page.keyboard.up('ArrowRight');
 const after=await page.evaluate(()=>window.__liquidStrike.debug.playerX);
 assert(after-before>70,'keyboard motion failed '+before+' '+after);
 await page.keyboard.press('KeyP');
 assert((await page.evaluate(()=>window.__liquidStrike.debug.status))==='paused','pause did not work');
 const freeze=await page.evaluate(()=>window.__liquidStrike.debug.time);
 await new Promise(r=>setTimeout(r,350));
 assert((await page.evaluate(()=>window.__liquidStrike.debug.time))===freeze,'paused game advanced');
 await page.click('#start');
 assert((await page.evaluate(()=>window.__liquidStrike.debug.status))==='running','resume reset game instead of resuming');
 const bombs=await page.evaluate(()=>window.__liquidStrike.debug.bombs);
 await page.click('#bomb');
 assert((await page.evaluate(()=>window.__liquidStrike.debug.bombs))===bombs-1,'bomb decrement failed');
 const preScore=await page.evaluate(()=>{const g=window.__liquidStrike.game;g.enemy(g.player.x,g.player.y-220,0);return g.score});
 await page.waitForFunction(score=>window.__liquidStrike.game.score>score,{timeout:6500},preScore);
 assert(errors.length===0,'Browser errors: '+errors.join('; '));
 await page.screenshot({path:'metaball-skirmish-smoke.png',fullPage:true});
 assert((await stat('metaball-skirmish-smoke.png')).size>20000,'screenshot too small');
 const success=await page.evaluate(()=>window.__liquidStrike.debug);
 console.log('PASS:',JSON.stringify(success),'Screenshot metaball-skirmish-smoke.png');
}finally{
 await browser.close();
}
