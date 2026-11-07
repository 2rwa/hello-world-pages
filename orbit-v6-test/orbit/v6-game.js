(function(root){
'use strict';
const F=root.OrbitPhysicsV6,R=root.OrbitRenderV6,V=root.OrbitV6Extras;
const GAME_URL="https://2rwa.github.io/tmp-202611/games/v6-orbit.html";
const canvas=document.getElementById('arena'),renderer=R.createRenderer(canvas);
const ui={score:document.getElementById('score'),best:document.getElementById('best'),level:document.getElementById('level'),lives:document.getElementById('lives'),remaining:document.getElementById('remaining'),status:document.getElementById('status'),energy:document.getElementById('energy'),energyFill:document.getElementById('energy-fill'),start:document.getElementById('start'),pause:document.getElementById('pause'),reset:document.getElementById('reset'),
 combo:document.getElementById('combo'),fullscreen:document.getElementById('fullscreen'),shell:document.getElementById('game-shell'),
 arenaWrap:document.getElementById('arena-wrap'),share:document.getElementById('share'),
 copyLink:document.getElementById('copy-link'),shareStatus:document.getElementById('share-status'),
 result:document.getElementById('result'),capture:document.getElementById('capture'),
 finalStage:document.getElementById('final-stage'),finalScore:document.getElementById('final-score'),
 finalCombo:document.getElementById('final-combo')};
const engine=F.createGame(20261104),world=engine.world;
let best=0,prev=0,left=false,right=false,pointer=null,pointerHeld=false;
try{best=Number(localStorage.getItem('orbitBreakerV6Best')||0)}catch(_){}
function snapshot(){
 return{state:world.state,score:world.score,best,level:world.level,lives:world.lives,
  combo:world.combo,bestCombo:world.bestCombo,lifeBonusClaimed:world.bonusClaimed,shell:V.stageShape(world.level),
  targets:world.targets.map(t=>({...t})),
  remaining:world.targets.length,frontHits:world.frontHits,rearHits:world.rearHits,wallHits:world.wallHits,
  energy:world.energy,chargedHits:world.chargedHits,paddleObjectHits:world.paddleObjectHits,damageCooldown:world.damageCooldown,
  speed:Math.hypot(world.ball.vx,world.ball.vy),expectedSpeed:engine.speed(),paddleAngle:world.paddleAngle,
  ball:{...world.ball},arenaScale:world.arenaScale,shrinkGoal:world.shrinkGoal,viewport:renderer.view(),elapsed:world.elapsed,events:world.events.slice()};
}
function updateHud(){
 if(world.score>best){best=world.score;try{localStorage.setItem('orbitBreakerV6Best',String(best))}catch(_){}}
 ui.score.textContent=world.score.toLocaleString('ja-JP');
 ui.best.textContent=best.toLocaleString('ja-JP');
 ui.level.textContent=world.level;
 ui.lives.textContent='♥'.repeat(world.lives)||'—';
 ui.combo.textContent=world.combo?'×'+world.combo:'×0';
 ui.remaining.textContent=world.targets.length;
 ui.energy.textContent=world.energy+'%';
 ui.energyFill.style.width=world.energy+'%';
 ui.energyFill.style.background=world.energy===0?'#ff7b8a':world.energy<=34?'#f3bf6d':'#6cebdc';
 ui.energyFill.parentElement.setAttribute('aria-valuenow',String(world.energy));
 ui.status.textContent=world.state==='playing'?'PLAYING':world.state==='ready'?'READY':world.state==='paused'?'PAUSED':world.state==='levelclear'?'CLEAR':'GAME OVER';
 ui.start.textContent=world.state==='playing'?'プレイ中':world.state==='levelclear'?'次のステージ':world.state==='gameover'?'もう一度':world.state==='paused'?'再開':'スタート';
 ui.pause.textContent=world.state==='paused'?'再開':'一時停止';
 ui.result.hidden=world.state!=='gameover';
 if(world.state==='gameover'){
  ui.finalStage.textContent=world.level;
  ui.finalScore.textContent=world.score.toLocaleString('ja-JP');
  ui.finalCombo.textContent=world.bestCombo;
 }
}
function begin(){
 engine.start();updateHud();renderer.draw(world);
}
function toggle(){engine.pause();updateHud();renderer.draw(world);}
function reset(){engine.reset();updateHud();renderer.draw(world);}
function canvasAngle(e){
 const p=renderer.worldPoint(e.clientX,e.clientY);
 const x=p.x-F.C.x,y=p.y-F.C.y;
 if(Math.hypot(x,y)<34)return null;
 return Math.atan2(y,x);
}
function setAngleFromEvent(e){
 const a=canvasAngle(e);
 if(a!==null){pointer=a;engine.setPaddleAngle(a,.016);renderer.draw(world);}
}
canvas.addEventListener('pointermove',e=>{
 if(e.pointerType==='mouse'||pointerHeld)setAngleFromEvent(e);
});
canvas.addEventListener('pointerdown',e=>{
 pointerHeld=true;setAngleFromEvent(e);
 try{canvas.setPointerCapture(e.pointerId)}catch(_){}
 if(world.state!=='playing')begin();
});
canvas.addEventListener('pointerup',()=>{pointerHeld=false});
canvas.addEventListener('pointercancel',()=>{pointerHeld=false});
canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')pointer=null});
const handled=new Set(['ArrowLeft','ArrowRight','KeyA','KeyD','Space','KeyP','KeyR']);
root.addEventListener('keydown',e=>{
 if(handled.has(e.code))e.preventDefault();
 if(e.code==='ArrowLeft'||e.code==='KeyA'){left=true;pointer=null;}
 if(e.code==='ArrowRight'||e.code==='KeyD'){right=true;pointer=null;}
 if(e.repeat&&(e.code==='Space'||e.code==='KeyP'||e.code==='KeyR'))return;
 if(e.code==='Space'){if(world.state==='playing')toggle();else begin();}
 if(e.code==='KeyP'){if(world.state==='playing'||world.state==='paused')toggle();}
 if(e.code==='KeyR')reset();
});
root.addEventListener('keyup',e=>{
 if(e.code==='ArrowLeft'||e.code==='KeyA')left=false;
 if(e.code==='ArrowRight'||e.code==='KeyD')right=false;
});
root.addEventListener('blur',()=>{left=false;right=false;pointerHeld=false;if(world.state==='playing'){engine.pause();updateHud();}});
ui.start.addEventListener('click',begin);
ui.pause.addEventListener('click',toggle);
ui.reset.addEventListener('click',reset);
root.OrbitFullscreenV6.install({shell:ui.shell,button:ui.fullscreen,exitButton:document.getElementById('fullscreen-exit')});
function shareMessage(message){ui.shareStatus.textContent=message;}
async function copyLink(){
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(GAME_URL);
  else throw new Error('clipboard unavailable');
  shareMessage('ゲームのリンクをコピーしました');
 }catch(_){
  const box=document.createElement('textarea');box.value=GAME_URL;
  box.style.position='fixed';box.style.left='-9999px';
  document.body.appendChild(box);box.select();
  const copied=typeof document.execCommand==='function'&&document.execCommand('copy');
  box.remove();
  shareMessage(copied?'ゲームのリンクをコピーしました':'リンク: '+GAME_URL);
 }
}
async function shareGame(){
 if(navigator.share){
  try{await navigator.share({title:'ORBIT BREAK v6',text:'ORBIT BREAK v6で遊ぼう！',url:GAME_URL});return;}
  catch(e){if(e?.name==='AbortError')return;}
 }
 await copyLink();
}
ui.share.addEventListener('click',shareGame);
ui.copyLink.addEventListener('click',copyLink);
function captureResultCanvas(){
 const image=document.createElement('canvas');image.width=800;image.height=766;
 const c=image.getContext('2d');
 c.fillStyle='#081126';c.fillRect(0,0,image.width,image.height);
 c.fillStyle='#79f3e5';c.font='900 30px system-ui';c.fillText('ORBIT BREAK v6',25,40);
 c.fillStyle='#fff8ec';c.font='bold 26px system-ui';
 c.fillText('FINAL STAGE '+world.level,25,79);
 c.fillText('SCORE '+world.score.toLocaleString('en-US'),400,79);
 const scale=Math.min(800/canvas.width,600/canvas.height);
 const w=canvas.width*scale,h=canvas.height*scale;
 c.drawImage(canvas,(800-w)/2,96+(600-h)/2,w,h);
 c.fillStyle='#b9d4ee';c.font='17px system-ui';
 c.fillText('MAX COMBO ×'+world.bestCombo+'   •   '+GAME_URL,25,733);
 return image;
}
function captureResult(){
 if(world.state!=='gameover')return;
 const png=captureResultCanvas().toDataURL('image/png');
 const link=document.createElement('a');
 link.download='orbit-break-v6-stage-'+world.level+'-score-'+world.score+'.png';
 link.href=png;document.body.appendChild(link);link.click();link.remove();
 shareMessage('記録画像を保存しました。友だちに共有できます');
}
ui.capture.addEventListener('click',captureResult);
function frame(time){
 const dt=prev?Math.min(.04,(time-prev)/1000):1/60;prev=time;
 if((left||right)&&!(left&&right)){
  const direction=(right?1:0)-(left?1:0);
  engine.setPaddleAngle(world.paddleAngle+direction*2.8*dt,dt);
 }else if(pointer!==null){
  // Mouse orientation is already applied by pointer events.
  world.paddleOmega*=.65;
 }else world.paddleOmega*=.75;
 engine.tick(dt);updateHud();renderer.draw(world);
 requestAnimationFrame(frame);
}
if(root.location&&new URLSearchParams(root.location.search).has('test')){
 root.__orbitV6Test=Object.freeze({
  inspect:snapshot,
  play:begin,pause:toggle,reset,
  setAngle:a=>{engine.setPaddleAngle(a,.016);updateHud();renderer.draw(world);},
  injectBall:(x,y,vx,vy)=>{engine.injectBall(x,y,vx,vy);renderer.draw(world);},
  clearTargets:()=>{engine.clearTargets();updateHud();renderer.draw(world);},
  tick:dt=>{engine.tick(dt);updateHud();renderer.draw(world);},
  setEnergy:v=>{world.energy=F.clamp(Math.round(v),0,F.ENERGY_MAX);updateHud();renderer.draw(world);},
  setTargets:targets=>{world.targets=targets.map(t=>({...t}));updateHud();renderer.draw(world);},
  setStage:n=>{world.level=n;engine.newLevel();world.state='playing';updateHud();renderer.draw(world);},
  captureDataURL:()=>captureResultCanvas().toDataURL('image/png'),
  outerRadius:(a)=>V.outerRadius(world.level,world.elapsed,a,world.arenaScale),
  skipCooldown:()=>{world.damageCooldown=0;},
  loseLife:()=>{engine.loseLife();updateHud();renderer.draw(world);}
 });
}
updateHud();renderer.draw(world);requestAnimationFrame(frame);
})(globalThis);
