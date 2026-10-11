// UI + real GPU render/readback integration test. No fake shader or fake renderer.
const puppeteer=require('puppeteer-core');
const fs=require('node:fs');
(async()=>{
  const executablePath=process.env.CHROME_BIN||'/usr/bin/google-chrome';
  const chrome=await puppeteer.launch({executablePath,headless:true,args:[
    '--no-sandbox','--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
    '--enable-unsafe-webgpu','--enable-features=Vulkan',
    '--use-vulkan=swiftshader','--disable-vulkan-fallback-to-gl-for-testing',
    '--use-webgpu-adapter=swiftshader','--enable-webgpu-developer-features',
    '--enable-dawn-features=allow_unsafe_apis','--disable-dawn-features=use_dxc',
    '--use-gpu-in-tests','--enable-unsafe-swiftshader'
  ]});
  try{
    const page=await chrome.newPage();
    await page.setViewport({width:1380,height:960,deviceScaleFactor:1});
    page.on('console',msg=>{if(['error','warning'].includes(msg.type()))console.log('console:',msg.type(),msg.text());});
    page.on('pageerror',error=>console.error('pageerror:',error));
    const url=process.env.TEST_URL||'http://127.0.0.1:8765/crt-video-lab/?ci=1';
    console.log('Chrome:',await chrome.version(),'URL:',url);
    await page.goto(url,{waitUntil:'networkidle2',timeout:30000});
    await page.waitForFunction(()=>window.__crtLab?.frames>=3||window.__crtLab?.phase==='error',{timeout:60000});
    const state=await page.evaluate(()=>window.__crtLab);
    if(state.phase==='error')throw new Error('WebGPU startup/render error: '+state.lastError);
    if(state.frames<3)throw new Error('No rendered video frames');
    console.log('pipeline stage:',state.phase,'frames:',state.frames);
    const probe=await page.evaluate(()=>window.__crtProbe());
    console.log('GPU readback:',JSON.stringify(probe));
    if(probe.lastFault||probe.bright<30||probe.sum<8000)throw new Error('Readback failed / blank image / validation error');
    const before=probe.frameCount;
    await page.select('#compareMode','1');
    await page.waitForFunction(oldCount=>window.__crtLab.frames>oldCount,{timeout:20000},before);
    const after=await page.evaluate(()=>window.__crtProbe());
    if(after.config.compare!==1)throw new Error('Original-view control not applied');
    await page.$eval('#setting-noise',element=>{
      element.value='0.9';
      element.dispatchEvent(new Event('input',{bubbles:true}));
    });
    const noise=await page.evaluate(()=>window.__crtProbe());
    if(Math.abs(noise.config.noise-.9)>.0001)throw new Error('Slider state did not update');
    if(noise.frameCount<=after.frameCount)throw new Error('Slider did not trigger GPU rerender');
    await page.select('#compareMode','.5');
    const split=await page.evaluate(()=>window.__crtProbe());
    if(split.config.compare!==0.5)throw new Error('Comparison split not applied');
    // Exercise the actual browser getUserMedia path with Chrome's fake hardware device.
    const beforeCamera=split.frameCount;
    await page.click('#cameraStart');
    await page.waitForFunction(()=>window.__crtLab.cameraActive||!!window.__crtLab.cameraError,{timeout:35000});
    const cameraState=await page.evaluate(()=>({
      diagnostic:{...window.__crtLab},
      tracks:window.__crtTest.stream?.getTracks().map(track=>({
        kind:track.kind,state:track.readyState
      })),
      resolution:[window.__crtTest.video.videoWidth,window.__crtTest.video.videoHeight]
    }));
    console.log('camera state:',JSON.stringify(cameraState));
    if(!cameraState.diagnostic.cameraActive)throw new Error('Camera did not start: '+cameraState.diagnostic.cameraError);
    if(!cameraState.tracks.some(track=>track.kind==='video'&&track.state==='live'))
      throw new Error('No active camera video track');
    if(cameraState.tracks.some(track=>track.kind==='audio'))
      throw new Error('Microphone was requested although its checkbox defaults to OFF');
    if(cameraState.resolution.some(dim=>dim<1))throw new Error('Camera video has invalid dimensions');
    await page.waitForFunction(oldCount=>window.__crtLab.frames>oldCount,{timeout:20000},beforeCamera);
    const cameraGpu=await page.evaluate(()=>window.__crtProbe());
    if(cameraGpu.lastFault||cameraGpu.bright<30)throw new Error('Camera processing GPU output blank');
    await page.select('#compareMode','1');
    const normal=await page.evaluate(()=>window.__crtProbe());
    const initialMirror=await page.$eval('#mirror',el=>el.checked);
    await page.click('#mirror');
    const reversed=await page.evaluate(()=>window.__crtProbe());
    if(reversed.config.mirror===Number(initialMirror))
      throw new Error('Mirror checkbox did not affect GPU uniform');
    const redDiff=Math.abs(normal.checkpoints.left[0]-reversed.checkpoints.left[0]);
    console.log('mirror GPU pixel difference:',redDiff,normal.checkpoints.left,reversed.checkpoints.left);
    if(redDiff<25)throw new Error('Camera mirror did not alter GPU pixels');
    await page.select('#cameraResolution','640x480');
    await page.waitForFunction(()=>window.__crtLab.cameraActive,{timeout:30000});
    const resolutionAfter=await page.evaluate(()=>window.__crtTest.video.videoWidth);
    if(resolutionAfter<1)throw new Error('Camera did not restart at a requested resolution');
    // Emulate mobile viewport orientation while the live camera is active.
    await page.setViewport({width:390,height:844,deviceScaleFactor:1});
    await page.select('#videoRotation','auto');
    await page.waitForFunction(()=>window.__crtLab.layout?.viewport[0]===390&&window.__crtLab.layout?.output[1]>window.__crtLab.layout?.output[0],{timeout:20000});
    const portrait=await page.evaluate(()=>{
      const info=window.__crtLab.layout,box=document.getElementById('screen').getBoundingClientRect();
      return {info,css:[box.width,box.height],stageWidth:document.getElementById('stage').clientWidth};
    });
    if(portrait.css[0]>portrait.stageWidth+1||
       Math.abs(portrait.css[0]/portrait.css[1]-portrait.info.output[0]/portrait.info.output[1])>0.012)
      throw new Error('Portrait canvas is stretched/cropped: '+JSON.stringify(portrait));
    console.log('mobile portrait layout:',JSON.stringify(portrait));
    await page.select('#videoRotation','1');
    await page.waitForFunction(()=>window.__crtLab.layout?.rotation===1,{timeout:15000});
    const manual=await page.evaluate(()=>window.__crtProbe());
    const nativeHeight=await page.evaluate(()=>window.__crtTest.video.videoHeight);
    if(manual.width!==nativeHeight){
      throw new Error('Manual 90-degree GPU output width does not match input height: '+manual.width);
    }
    if(manual.checkpoints.left[0]===manual.checkpoints.right[0]){
      console.log('Rotated image is vertically organized (expected)');
    }
    fs.mkdirSync('crt-video-lab/test-artifacts',{recursive:true});
    await page.screenshot({path:'crt-video-lab/test-artifacts/crt-mobile-portrait.png',fullPage:true});
    await page.setViewport({width:844,height:390,deviceScaleFactor:1});
    await page.select('#videoRotation','auto');
    await page.waitForFunction(()=>window.__crtLab.layout?.viewport[0]===844&&window.__crtLab.layout?.output[0]>window.__crtLab.layout?.output[1],{timeout:15000});
    const landscape=await page.evaluate(()=>{
      const info=window.__crtLab.layout,box=document.getElementById('screen').getBoundingClientRect();
      return {info,css:[box.width,box.height],stageWidth:document.getElementById('stage').clientWidth};
    });
    if(landscape.css[0]>landscape.stageWidth+1||
       Math.abs(landscape.css[0]/landscape.css[1]-landscape.info.output[0]/landscape.info.output[1])>0.012)
      throw new Error('Landscape canvas is stretched/cropped: '+JSON.stringify(landscape));
    console.log('mobile landscape layout:',JSON.stringify(landscape));
    await page.setViewport({width:1380,height:960,deviceScaleFactor:1});
    await page.evaluate(()=>{window.__crtTest.previousCameraTrack=window.__crtTest.stream.getVideoTracks()[0];});
    await page.click('#cameraOff');
    await page.waitForFunction(()=>window.__crtLab.input==='demo'&&!window.__crtLab.cameraActive,{timeout:20000});
    const ended=await page.evaluate(()=>window.__crtTest.previousCameraTrack.readyState);
    if(ended!=='ended')throw new Error('Camera track leaked after turning camera off: '+ended);
    // Permission failures should be nonfatal; the demo should keep playing.
    await page.evaluate(()=>{
      window.__originalGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('blocked','NotAllowedError');};
    });
    await page.click('#cameraStart');
    await page.waitForFunction(()=>!!window.__crtLab.cameraError,{timeout:15000});
    const denied=await page.evaluate(()=>({error:window.__crtLab.cameraError,
      input:window.__crtLab.input,ready:window.__crtLab.ok}));
    await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=window.__originalGetUserMedia;});
    if(denied.input!=='demo'||!denied.ready||!denied.error.includes('権限'))
      throw new Error('Denied camera permission corrupted existing video source');
    console.log('PASS: camera start, live video track, privacy-default mic off, GPU camera path, GPU mirror, resolution switch, track cleanup, permission denial');
    fs.mkdirSync('crt-video-lab/test-artifacts',{recursive:true});
    await page.screenshot({path:'crt-video-lab/test-artifacts/crt-webgpu-actual.png',fullPage:true});
    fs.writeFileSync('crt-video-lab/test-artifacts/result.json',JSON.stringify({state,probe,after,noise,split},null,2));
    console.log('PASS: shader compilation, GPU readback, compare, controls, getUserMedia camera lifecycle, mirror, cleanup, screenshot');
  }finally{await chrome.close();}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
