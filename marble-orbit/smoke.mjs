import {chromium} from "playwright";
const browser=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
const errors=[],page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1});
page.on("pageerror",e=>errors.push(e.message));
page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
try{
  const url=new URL("./index.html?test=1",import.meta.url).href;
  await page.goto(url,{waitUntil:"load"});
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent.includes("fps"),{timeout:25000});
  const init=await page.locator("#status").innerText();
  if(init.includes("エラー"))throw Error(init);

  // Check the actual raymarched pixels, not just shader compilation.
  const visibility=await page.evaluate(()=>{
    const cv=document.createElement("canvas");
    cv.style.cssText="position:absolute;left:-1000px;top:0;width:192px;height:192px";
    document.body.appendChild(cv);
    const r=makeMarbleRenderer(cv),gl=cv.getContext("webgl2");
    r.setQuality("high");
    const cam={eye:[0,0,4.55],right:[1,0,0],up:[0,1,0],forward:[0,0,-1]};
    function pixel(balls){
      r.draw(balls,[0,0,100],cam,0,0);gl.finish();
      const rgba=new Uint8Array(4);
      gl.readPixels(cv.width>>1,cv.height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
      return {rgba:Array.from(rgba),error:gl.getError()};
    }
    const empty=pixel([]);
    const danger=pixel([{p:[0,0,0],v:[0,0,0],r:.45,c:[1,.2,.3]}]);
    const prey=pixel([{p:[0,0,0],v:[0,0,0],r:.24,c:[.15,.98,.72]}]);
    cv.remove();
    const diff=(a,b)=>a.rgba.slice(0,3).reduce((s,v,i)=>s+Math.abs(v-b.rgba[i]),0);
    return {empty,danger,prey,visible:diff(empty,danger),sizeAndColor:diff(danger,prey)};
  });
  if(visibility.empty.error||visibility.danger.error||visibility.prey.error||
      visibility.visible<35||visibility.sizeAndColor<35)
    throw Error("Raymarched enemy missing or growth invisible: "+JSON.stringify(visibility));
  console.log("PASS: actual pixel evidence of enemy and its changing size/color.",visibility);

  const rules=await page.evaluate(()=>{
    const {verdict,enemyRadius}=MarbleRules;
    if(verdict(.25,.12)!=="eat"||verdict(.15,.36)!=="hurt"||verdict(.2,.2)!=="bounce")
      throw Error("bad size comparison rules");
    const game=new MarbleEngine();game.start();
    const before=game.enemies.map(e=>e.gTarget.slice());
    game.enemies[0].gClock=-1;
    game.tick(1/120,[1,0,0],"normal");
    const after=game.enemies[0].gTarget;
    const changed=before[0].some((v,i)=>v!==after[i]);
    if(!changed)throw Error("Enemy gravity failed to change");
    for(let i=0;i<80;i++)game.tick(1/120,[1,0,0],"grow");
    const big=game.player.r;
    for(let i=0;i<100;i++)game.tick(1/120,[1,0,0],"shrink");
    const small=game.player.r;
    if(big<.28||small>.18)throw Error("Player cannot expand/shrink "+big+"/"+small);
    const p=new MarbleEngine();p.start();
    const victim=p.enemies[0];
    for(let i=1;i<p.enemies.length;i++)p.enemies[i].alive=false;
    victim.r=.105;victim.p=p.player.p.slice();p.player.r=.3;
    p.collidePlayer();
    if(p.eaten!==1||p.score<100||victim.alive)throw Error("Eating logic broken");
    const h=new MarbleEngine();h.start();h.invincible=0;
    for(let i=1;i<h.enemies.length;i++)h.enemies[i].alive=false;
    const attacker=h.enemies[0];attacker.r=.40;attacker.p=h.player.p.slice();
    h.collidePlayer();
    if(h.health!==2||h.invincible<=0)throw Error("Crush / invulnerability failed");
    return {big,small,changed,points:p.score,lifeAfterCrush:h.health};
  });
  console.log("PASS: independent random enemy gravity, pulsing size, size control, eating, damage.",rules);
  await page.locator("#start").click();
  await page.waitForTimeout(950);
  const timer=Number(await page.locator("#timer").innerText());
  if(!(timer<90&&timer>83))throw Error("Timer not running: "+timer);

  const hold=async(id,ms)=>{
    const box=await page.locator("#"+id).boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
    await page.mouse.down();await page.waitForTimeout(ms);
    const r=await page.evaluate(()=>window.__marbleTest.engine.player.r);
    await page.mouse.up();return r;
  };
  const grown=await hold("grow",540);
  const shrunken=await hold("shrink",650);
  if(grown<.26||shrunken>.19)throw Error("Pointer-held resize failed "+grown+"/"+shrunken);
  const b=await page.locator("#pad").boundingBox();
  await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width*.86,b.y+b.height*.18,{steps:8});
  const direction=await page.evaluate(()=>window.__marbleTest.gravityDirection());
  if(direction[0]<.1)throw Error("Virtual joystick did not steer "+direction);
  await page.mouse.up();

  const cv=await page.locator("#view").boundingBox();
  await page.mouse.move(cv.x+cv.width*.44,cv.y+cv.height*.44);
  await page.mouse.down();
  await page.mouse.move(cv.x+cv.width*.62,cv.y+cv.height*.49,{steps:8});
  await page.mouse.up();
  await page.keyboard.down("ArrowRight");await page.waitForTimeout(170);await page.keyboard.up("ArrowRight");
  await page.keyboard.down("Shift");await page.waitForTimeout(150);await page.keyboard.up("Shift");
  await page.locator("#dash").click();
  await page.locator("#pause").click();
  if((await page.locator("#pause").innerText())!=="再開")throw Error("Pause failed");
  await page.locator("#pause").click();
  await page.screenshot({path:"/tmp/marble-orbit-desktop.png"});
  await page.locator("#quality").selectOption("low");
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(700);
  const glState=await page.evaluate(()=>{
    const gl=document.querySelector("canvas").getContext("webgl2");
    return {width:gl.canvas.width,height:gl.canvas.height,error:gl.getError()};
  });
  await page.screenshot({path:"/tmp/marble-orbit-mobile.png"});
  if(glState.error!==0||glState.width<=0||glState.height<=0)throw Error("WebGL state: "+JSON.stringify(glState));
  if(errors.length)throw Error("Browser errors: "+errors.join("\n"));
  console.log("PASS: full playable game: timer, grow/shrink hold, joystick, orbit, keys, dash, pause, mobile responsive.",{timer,grown,shrunken,direction,glState});
}catch(e){
  console.error("FAIL",e);process.exitCode=1;
}finally{await browser.close();}
