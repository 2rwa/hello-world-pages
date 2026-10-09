// Run with node rcm-lab/tests/smoke.cjs (and optionally RCM_BROWSER=1).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'synth-worklet.js'),'utf8');
let Proc;
vm.runInNewContext(js,{
 sampleRate:48000,
 Float32Array,Math,
 AudioWorkletProcessor:class{constructor(){this.port={onmessage:null,postMessage(){}}}},
 registerProcessor:(id,klass)=>{assert.equal(id,'rcm-voice-processor');Proc=klass}
},{filename:'synth-worklet.js'});
assert.ok(Proc,'AudioWorklet should register');
const pcm=new Float32Array(2048);
for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(i/2048*2*Math.PI)*.7+Math.sin(i/2048*6*Math.PI)*.3;
function render(mode,depth,pcmMode=true){
 const p=new Proc();p.receive({type:'sample',data:pcm,wavetable:pcmMode,rate:48000,baseMidi:60});
 p.receive({type:'params',params:{mode,pcmDepth:depth,blend:.27,fmIndex:4,ratio:2,cutoff:9500,attack:.005,sustain:.8,volume:.9}});
 p.receive({type:'on',note:60,velocity:1});
 const signal=[];
 for(let b=0;b<24;b++){
  const l=new Float32Array(128),r=new Float32Array(128);
  assert.equal(p.process([],[[l,r]]),true);
  for(let i=0;i<l.length;i++){assert.ok(Number.isFinite(l[i]));assert.equal(l[i],r[i]);signal.push(l[i])}
 }
 return signal;
}
function rms(a){return Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length)}
const fm=render('fm',5),pcmOnly=render('pcm',5),layer=render('layer',5);
const noExternal=render('rcm',0),rcm=render('rcm',5);
for(const [name,data] of Object.entries({fm,pcmOnly,layer,noExternal,rcm})){
 assert.ok(rms(data)>.005,name+' should sound');
 assert.ok(rms(data)<.9,name+' should not overload');
}
function diff(a,b){return Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0)/a.length)}
assert.ok(diff(noExternal,layer)<1e-8,'RCM with PCM depth=0 equals parallel layer');
assert.ok(diff(rcm,layer)>.015,'PCM input changes FM timbre');
assert.ok(diff(fm,pcmOnly)>.02,'FM and PCM modes differ');
const voice=new Proc();
for(let i=0;i<12;i++)voice.receive({type:'on',note:48+i,velocity:.8});
assert.equal(voice.voices.length,8,'voice stealing limits polyphony');
voice.receive({type:'panic'});
assert.equal(voice.voices.length,0);
console.log('DSP checks passed:',{rmsRCM:rms(rcm).toFixed(4),rmsFM:rms(fm).toFixed(4),rcmVsLayer:diff(rcm,layer).toFixed(4)});
if(process.env.RCM_BROWSER==='1')browserSmoke().catch(e=>{console.error(e);process.exitCode=1});
async function browserSmoke(){
 const puppeteer=require('puppeteer-core');
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.goto('http://127.0.0.1:8765/rcm-lab/',{waitUntil:'networkidle0'});
  await page.waitForFunction('!!window.__rcmTest');
  assert.equal(await page.$$eval('#keyboard button',nodes=>nodes.length),24);
  assert.equal(await page.$$eval('#controls input',nodes=>nodes.length),12);
  await page.click('#start');
  await page.waitForFunction('window.__rcmTest.getState().enabled',{timeout:15000});
  assert.match(await page.$eval('#status',e=>e.textContent),/AudioWorklet/);
  await page.click('[data-mode="layer"]');
  assert.equal(await page.evaluate(()=>window.__rcmTest.getState().mode),'layer');
  await page.click('[data-mode="rcm"]');
  await page.evaluate(()=>window.__rcmTest.onNote(60,'smoke'));
  await page.waitForFunction('window.__rcmTest.getState().voices === 1');
  await page.evaluate(()=>window.__rcmTest.offNote('smoke'));
  await page.click('#demo');await new Promise(r=>setTimeout(r,800));
  await page.click('#demo');await page.click('#panic');
  assert.deepEqual(errors,[],'no JavaScript exceptions');
  console.log('Browser checks passed: AudioWorklet started, keys/presets/modes/demo OK');
 }finally{await browser.close()}
}
