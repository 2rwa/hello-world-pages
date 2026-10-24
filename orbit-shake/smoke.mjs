import {chromium} from "playwright";
const browser=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
const errors=[],page=await browser.newPage({viewport:{width:1000,height:720}});
page.on("pageerror",e=>errors.push(e.message));
page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
try{
 const url=new URL("./index.html?test=1",import.meta.url).href;
 await page.goto(url,{waitUntil:"load"});
 await page.waitForFunction(()=>document.querySelector("#status")?.textContent.includes("fps"),{timeout:25000});
 const status=await page.locator("#status").innerText();
 if(status.includes("ERROR"))throw Error(status);
 const test=await page.evaluate(()=>{
  const dbg=window.__orbitShakeTest;
  const game=dbg.game;
  if(!dbg||!game)throw Error("debug hook missing");
  const lookA=dbg.cam(0),lookB=dbg.cam(17);
  if(Math.hypot(...lookA.eye.map((v,i)=>v-lookB.eye[i]))<2)
   throw Error("auto orbit camera did not move");
  if(getComputedStyle(document.querySelector("#view")).pointerEvents!=="none")
   throw Error("canvas still accepts view manipulation");
  if(document.querySelector("#pad")||document.querySelector("#grow"))
   throw Error("touch joystick or size controls must not exist");
  if(!dbg.onOrientation({beta:0,gamma:0}))
   throw Error("orientation event failed");
  dbg.onOrientation({beta:-20,gamma:25});
  const dir=dbg.getRawTilt();
  if(!(dir[0]>.65&&dir[1]>.55))throw Error("tilt mapping: "+dir);
  dbg.recenter();
  if(dbg.getRawTilt().some(v=>Math.abs(v)>.001))throw Error("calibration failed");
  const {verdict}=TiltRules;
  if(verdict(.36,.15)!=="prey"||verdict(.19,.37)!=="danger"||verdict(.19,.19)!=="neutral")
   throw Error("size verdict rules invalid");
  game.reset();game.start();
  const first=game.enemies[0],oldTarget=first.target.slice();
  first.change=-1;
  game.tick(.01,[.8,.5],lookA);
  if(first.target.every((v,i)=>v===oldTarget[i]))
   throw Error("enemy independent gravity did not change");
  const before=game.player.p.slice();
  for(let i=0;i<45;i++)game.tick(.01,[1,0],lookA);
  if(Math.hypot(...before.map((v,i)=>v-game.player.p[i]))<.07)
   throw Error("tilt did not move player along wall");
  const shellLen=Math.hypot(...game.player.p);
  if(Math.abs(shellLen+game.player.r-1.51)>.00001)
   throw Error("ball left sphere surface");
  const noShakeRadius=game.player.r;
  if(!game.shake()||game.shake())throw Error("shake/cooldown rule broken");
  for(let i=0;i<25;i++)game.tick(.01,[0,0],lookA);
  const grown=game.player.r;
  if(grown<.30||grown<=noShakeRadius)throw Error("shake failed to enlarge ball");
  for(let i=0;i<145;i++)game.tick(.01,[0,0],lookA);
  const shrunk=game.player.r;
  if(shrunk>.21)throw Error("ball failed to shrink after shake");
  const catchGame=new TiltArena();catchGame.start();
  for(let i=1;i<catchGame.enemies.length;i++)catchGame.enemies[i].alive=false;
  const prey=catchGame.enemies[0];prey.r=.12;prey.p=catchGame.player.p.slice();
  catchGame.collide();
  if(prey.alive||catchGame.caught!==1||catchGame.score!==120)
   throw Error("capture logic failed");
  const hurtGame=new TiltArena();hurtGame.start();hurtGame.invincible=0;
  for(let i=1;i<hurtGame.enemies.length;i++)hurtGame.enemies[i].alive=false;
  const threat=hurtGame.enemies[0];threat.r=.35;threat.p=hurtGame.player.p.slice();
  hurtGame.collide();
  if(hurtGame.health!==2)throw Error("crushing damage failed");
  // Restore ready state for full UI run.
  game.reset();
  return {autoOrbit:lookB.eye,tilt:dir,surface:shellLen,grown,shrunk,catchCount:catchGame.caught,damaged:hurtGame.health};
 });
 console.log("PASS: auto camera, motion-only UI, tilt, calibration, random enemy gravity, spherical physics, shake growth, capture, damage.",test);
 const pixels=await page.evaluate(()=>{
  const c=document.createElement("canvas");
  c.style.cssText="position:absolute;left:-2000px;top:0;width:192px;height:192px";
  document.body.appendChild(c);
  const renderer=makeMarbleRenderer(c),gl=c.getContext("webgl2");
  renderer.setQuality("high");
  const camera={eye:[0,0,4.55],right:[1,0,0],up:[0,1,0],forward:[0,0,-1]};
  function read(balls){
   renderer.draw(balls,[0,0,100],camera,0,0);gl.finish();
   const p=new Uint8Array(4);
   gl.readPixels(c.width>>1,c.height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);
   return {color:Array.from(p),error:gl.getError()};
  }
  const bg=read([]),enemy=read([{p:[0,0,0],r:.32,c:[1,.17,.23]}]);
  c.remove();
  return {bg,enemy,diff:bg.color.reduce((s,v,i)=>s+Math.abs(v-enemy.color[i]),0)};
 });
 if(pixels.bg.error||pixels.enemy.error||pixels.diff<45)
  throw Error("Raymarched interior invisible "+JSON.stringify(pixels));
 console.log("PASS: refractive shell transmits visible raymarched enemy pixels.",pixels);
 await page.locator("#begin").click();
 const state=await page.evaluate(()=>{
  const t=window.__orbitShakeTest;
  t.onOrientation({beta:0,gamma:0});
  t.onOrientation({beta:15,gamma:22});
  const tilt=t.getRawTilt();
  const shaken=t.onMotion({acceleration:{x:21,y:3,z:0}});
  return {mode:t.game.mode,tilt,shaken,burst:t.game.burst,cooldown:t.game.cooldown};
 });
 if(state.mode!=="running"||state.burst<=0||state.cooldown<1.5||!state.shaken)
  throw Error("Live sensor event / shake not received: "+JSON.stringify(state));
 await page.locator("#quality").selectOption("low");
 await page.waitForTimeout(800);
 await page.screenshot({path:"/tmp/orbit-shake-desktop.png"});
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(600);
 await page.screenshot({path:"/tmp/orbit-shake-mobile.png"});
 const glstate=await page.evaluate(()=>{
  const gl=document.querySelector("#view").getContext("webgl2");
  const old=gl.getError(),next=gl.getError();
  const balls=window.__orbitShakeTest.game.active;
  return {width:gl.canvas.width,height:gl.canvas.height,old,next,lost:gl.isContextLost(),
   invalidBalls:balls.filter(b=>[...b.p,b.r].some(x=>!Number.isFinite(x))).length};
 });
 if(glstate.width<60||glstate.height<60||glstate.next||glstate.lost||glstate.invalidBalls)
  throw Error("WebGL state corrupted "+JSON.stringify(glstate));
 await page.locator("#pause").click();
 if((await page.locator("#pause").innerText())!=="再開")throw Error("pause failed");
 await page.locator("#pause").click();
 if(errors.length)throw Error("Browser errors: "+errors.join("\n"));
 console.log("PASS: phone sensor simulation, real WebGL2 rendering, portrait layout, pause/restart safety.",{state,glstate});
}catch(e){
 console.error("FAIL:",e);process.exitCode=1;
}finally{await browser.close();}
