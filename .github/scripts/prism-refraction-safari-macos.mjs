import {execFileSync,spawn} from 'node:child_process';
import {writeFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {webkit} from 'playwright';
const url=process.env.PRISM_TEST_URL||'https://2rwa.github.io/hello-world-pages/prism-refraction-lab/?mac-gui=1';
mkdirSync('artifacts/safari',{recursive:true});
const report={url,platform:process.platform,architecture:process.arch,steps:[]};
function shell(cmd,args=[],timeout=18000){
 try{return execFileSync(cmd,args,{encoding:'utf8',timeout}).trim()}
 catch(e){report.steps.push({action:cmd,error:String(e).slice(0,450)});return ''}
}
try{
 report.safariVersion=shell('defaults',['read','/Applications/Safari.app/Contents/Info','CFBundleShortVersionString']);
 const opened=shell('open',['-a','Safari',url]);
 report.steps.push({action:'open Safari',result:opened});
 await new Promise(r=>setTimeout(r,6500));
 report.nativeURL=shell('osascript',['-e','tell application "Safari" to get URL of front document'],12000);
 report.nativeVersion=shell('osascript',['-e','tell application "Safari" to get version'],12000);
 report.screenshotResult=shell('/usr/sbin/screencapture',['-x','artifacts/safari/native-safari-desktop.png'],15000);
 report.nativeScreenshot=existsSync('artifacts/safari/native-safari-desktop.png')?statSync('artifacts/safari/native-safari-desktop.png').size:0;
 const browser=await webkit.launch({headless:true,timeout:60000});
 const page=await browser.newPage({viewport:{width:1200,height:780}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
 let probe={};
 for(let i=0;i<30;i++){
  probe=await page.evaluate(()=>({
   gpu:!!navigator.gpu,
   status:window.__labTest?.status,
   stage:window.__labTest?.stage,
   presentation:window.__labTest?.presentation,
   error:window.__labTest?.error,
   frames:window.__labTest?.frames||0
  }));
  if(probe.status==='ok'||probe.status==='error')break;
  await page.waitForTimeout(700);
 }
 await page.screenshot({path:'artifacts/safari/playwright-webkit.png'});
 report.webkit={httpStatus:response?.status(),...probe,errors};
 await browser.close();
}catch(e){report.error=e.stack||String(e)}
finally{
 writeFileSync('artifacts/safari/report.json',JSON.stringify(report,null,2));
 console.log('SAFARI/M1 REPORT:',JSON.stringify(report));
}
if(report.nativeScreenshot<2000) {
 console.error('FAIL: Native Safari desktop screenshot not available');
 process.exitCode=1;
}else console.log('Native Safari screenshot captured',report.nativeScreenshot,'bytes');
if(report.webkit?.gpu && report.webkit?.status==='error'){
 console.error('FAIL: Apple WebKit WebGPU compile/runtime error:',report.webkit.error);
 process.exitCode=1;
}else if(report.webkit?.gpu && report.webkit?.status==='ok' && report.webkit.frames>=2){
 console.log('PASS: Apple Silicon WebKit WebGPU pipeline, GUI scene and animation');
}else{
 console.warn('Apple WebKit WebGPU not fully validated; state=',report.webkit?.status,
  'GPU exposed=',report.webkit?.gpu,'error=',report.error);
}
// Native Safari.app and Playwright WebKit are separate: Native screenshots alone
// cannot establish successful native Safari WebGPU rendering.
