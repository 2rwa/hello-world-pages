import {chromium} from "playwright";
const browser=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
const errors=[];
const context=await browser.newContext({viewport:{width:960,height:720},deviceScaleFactor:1});
const page=await context.newPage();
page.on("pageerror",e=>errors.push(e.message));
page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
try{
  const url=new URL("./index.html",import.meta.url).href;
  await page.goto(url,{waitUntil:"load"});
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent.includes("fps"),{timeout:20000});
  const init=await page.locator("#status").innerText();
  if(init.includes("エラー"))throw new Error(init);
  // Regression: compile success does not imply visible marbles.
  // Compare WebGL center pixels with a centered red marble vs an empty globe.
  const visibility=await page.evaluate(()=>{
    const cv=document.createElement("canvas");
    cv.style.cssText="position:absolute;left:-1000px;top:0;width:192px;height:192px";
    document.body.appendChild(cv);
    const renderer=makeMarbleRenderer(cv);
    renderer.setQuality("high");
    const gl=cv.getContext("webgl2");
    const cam={eye:[0,0,4.55],right:[1,0,0],up:[0,1,0],forward:[0,0,-1]};
    const hiddenGoal=[0,0,100];
    function pixel(balls){
      renderer.draw(balls,hiddenGoal,cam,0,0);
      gl.finish();
      const p=new Uint8Array(4);
      gl.readPixels(cv.width>>1,cv.height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);
      return {rgba:Array.from(p),error:gl.getError()};
    }
    const empty=pixel([]);
    const marble=pixel([{p:[0,0,0],r:.47,c:[1,.04,.05]}]);
    cv.remove();
    const delta=marble.rgba.slice(0,3).reduce((n,v,i)=>n+Math.abs(v-empty.rgba[i]),0);
    return {empty,marble,delta};
  });
  if(visibility.empty.error!==0||visibility.marble.error!==0||visibility.delta<35)
    throw new Error("Interior marble invisible through refractive shell: "+JSON.stringify(visibility));
  console.log("PASS: real pixel comparison finds interior marble.",visibility);
  await page.screenshot({path:"/tmp/marble-orbit-ready.png"});
  await page.locator("#start").click();
  await page.waitForTimeout(1200);
  const timer=Number(await page.locator("#timer").innerText());
  if(!(timer<75&&timer>70))throw new Error("Timer not running: "+timer);
  await page.locator("#pulse").click();
  if(!(await page.locator("#pulse").isDisabled()))throw new Error("Boost cooldown missing");
  await page.keyboard.down("ArrowRight");await page.waitForTimeout(250);await page.keyboard.up("ArrowRight");
  const b=await page.locator("canvas").boundingBox();
  await page.mouse.move(b.x+b.width*.46,b.y+b.height*.48);
  await page.mouse.down();await page.mouse.move(b.x+b.width*.59,b.y+b.height*.48,{steps:7});await page.mouse.up();
  await page.mouse.click(b.x+b.width*.43,b.y+b.height*.58);
  await page.locator("#quality").selectOption("low");
  await page.locator("#pause").click();
  if((await page.locator("#pause").innerText())!=="再開")throw new Error("Pause button state");
  await page.locator("#pause").click();
  await page.screenshot({path:"/tmp/marble-orbit-running.png"});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(600);
  const info=await page.evaluate(()=>{
    const gl=document.querySelector("canvas").getContext("webgl2");
    return {width:gl.canvas.width,height:gl.canvas.height,error:gl.getError()};
  });
  if(info.error!==0||info.width<=0||info.height<=0)throw new Error("Invalid WebGL state "+JSON.stringify(info));
  if(errors.length)throw new Error(errors.join("\n"));
  console.log("PASS: shader compile, WebGL2 frame, HUD timer, boost, keys, drag, tap, pause, responsive resize.",{timer,init,info});
}catch(e){console.error("FAIL",e);process.exitCode=1;}finally{await browser.close();}
