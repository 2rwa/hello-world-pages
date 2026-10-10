import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const url='https://2rwa.github.io/hello-world-pages/prism-refraction-lab/?safaridriver=1';
mkdirSync('artifacts/safari',{recursive:true});
const result={url,driver:'native SafariDriver',started:new Date().toISOString()};
let child,sessionId,driverLog='';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(path,method='GET',data){
 const res=await fetch('http://127.0.0.1:4444'+path,{
  method,headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),
  signal:AbortSignal.timeout(17000)
 });
 const body=await res.json();
 if(body.value?.error)throw Error('SafariDriver '+body.value.error+': '+body.value.message);
 return body;
}
try{
 child=spawn('/usr/bin/safaridriver',['-p','4444'],{stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',x=>driverLog+=x.toString());child.stderr.on('data',x=>driverLog+=x.toString());
 await sleep(1500);
 const started=await api('/session','POST',{capabilities:{alwaysMatch:{browserName:'safari'}}});
 sessionId=started.value?.sessionId??started.sessionId;
 if(!sessionId)throw Error('No SafariDriver session: '+JSON.stringify(started).slice(0,2000));
 result.sessionId='acquired';
 await api('/session/'+sessionId+'/url','POST',{url});
 let state={}; const deadline=Date.now()+45000;
 while(Date.now()<deadline){
  const reply=await api('/session/'+sessionId+'/execute/sync','POST',{
   script:`return {status:window.__labTest?.status||null,stage:window.__labTest?.stage||null,
    error:window.__labTest?.error||null,frames:window.__labTest?.frames||0,
    presentation:window.__labTest?.presentation||null,gpu:!!navigator.gpu};`,
   args:[]
  });
  state=reply.value;
  if(state.status==='ok'||state.status==='error')break;
  await sleep(900);
 }
 result.state=state;
 const image=await api('/session/'+sessionId+'/screenshot');
 if(typeof image.value==='string'){
  const buffer=Buffer.from(image.value,'base64');
  writeFileSync('artifacts/safari/safaridriver-native-safari.png',buffer);
  result.imageBytes=buffer.byteLength;
 }
 result.ok=state.status==='ok'&&state.frames>=2&&result.imageBytes>10000;
 if(!result.ok)throw Error('Native Safari app WebGPU render failed: '+JSON.stringify(state));
 console.log('PASS native Safari.app WebGPU + DOM + screenshot',JSON.stringify(state));
}catch(e){
 result.error=e.stack||String(e);
 console.error('SafariDriver test:',result.error);
 process.exitCode=1;
}finally{
 if(sessionId){try{await api('/session/'+sessionId,'DELETE')}catch{}}
 if(child){child.kill();await sleep(200)}
 result.driverLog=driverLog.slice(0,2400);
 writeFileSync('artifacts/safari/native-driver-report.json',JSON.stringify(result,null,2));
 console.log('NATIVE SAFARIDRIVER REPORT:',JSON.stringify(result).slice(0,5000));
}
