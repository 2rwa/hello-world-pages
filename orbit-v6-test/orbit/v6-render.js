(function(root){
'use strict';
const F=root.OrbitPhysicsV6,V=root.OrbitV6Extras;
function createRenderer(canvas){
 const ctx=canvas.getContext('2d'),{C,ARENA,PADDLE_R,PADDLE_THICK,PADDLE_HALF,TAU}=F;
 const stars=Array.from({length:75},(_,i)=>({x:(67+i*157)%800,y:(41+i*101)%600,size:i%7===0?1.5:.8}));
 function circle(x,y,r){ctx.beginPath();ctx.arc(x,y,r,0,TAU);}
 function pathVertices(vertices){ctx.beginPath();vertices.forEach((v,i)=>i===0?ctx.moveTo(v.x,v.y):ctx.lineTo(v.x,v.y));ctx.closePath();}
 function drawBackground(w){
  const g=ctx.createRadialGradient(C.x,C.y,20,C.x,C.y,420);
  g.addColorStop(0,'#172c4d');g.addColorStop(.58,'#0f1d37');g.addColorStop(1,'#080e20');
  ctx.fillStyle=g;ctx.fillRect(0,0,800,600);
  for(const s of stars){
    ctx.globalAlpha=.25;ctx.fillStyle='#b3d9ff';circle(s.x,s.y,s.size);ctx.fill();
  }ctx.globalAlpha=1;
  ctx.save();V.traceBoundary(ctx,w.level,w.elapsed);ctx.clip();
  const rg=ctx.createRadialGradient(C.x,C.y,30,C.x,C.y,ARENA);
  rg.addColorStop(0,'#142746');rg.addColorStop(.72,'#0d1b35');rg.addColorStop(1,'#162845');
  ctx.fillStyle=rg;ctx.fillRect(C.x-ARENA,C.y-ARENA,ARENA*2,ARENA*2);
  ctx.strokeStyle='#89a6df0d';ctx.lineWidth=1;
  for(let x=C.x-ARENA;x<C.x+ARENA;x+=32){ctx.beginPath();ctx.moveTo(x,C.y-ARENA);ctx.lineTo(x,C.y+ARENA);ctx.stroke();}
  for(let y=C.y-ARENA;y<C.y+ARENA;y+=32){ctx.beginPath();ctx.moveTo(C.x-ARENA,y);ctx.lineTo(C.x+ARENA,y);ctx.stroke();}
  ctx.strokeStyle='#ffffff0d';ctx.lineWidth=1;
  for(let r of [65,132,185]){circle(C.x,C.y,r);ctx.stroke();}
  ctx.restore();
  ctx.save();ctx.shadowBlur=20;ctx.shadowColor='#7169e7';ctx.strokeStyle='#7574d4';ctx.lineWidth=5;
  V.traceBoundary(ctx,w.level,w.elapsed);ctx.stroke();
  ctx.shadowBlur=0;ctx.strokeStyle='#b4b6ff66';ctx.lineWidth=1.5;V.traceBoundary(ctx,w.level,w.elapsed);ctx.stroke();
  for(let i=0;i<48;i++){
   const a=i*TAU/48,r=ARENA+8,p=C;
   ctx.strokeStyle=i%4===0?'#9b9add70':'#4d628f55';ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r);
   ctx.lineTo(p.x+Math.cos(a)*(r+(i%4===0?8:3)),p.y+Math.sin(a)*(r+(i%4===0?8:3)));ctx.stroke();
  }ctx.restore();
 }
 function drawTarget(t,elapsed){
  ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.rotation);
  ctx.shadowBlur=17;ctx.shadowColor=t.variant==='inflate'?'#ffc24e':t.variant==='split'?'#ff7db2':t.variant==='split-child'?'#ffb6d0':t.kind==='triangle'?'#fcb56a':t.kind==='circle'?'#66ebd5':'#b29afc';
  const fill=t.variant==='inflate'?'#ffd873':t.variant==='split'?'#ff8ea8':t.variant==='split-child'?'#ffc3d5':t.kind==='triangle'?'#ffc87e':t.kind==='circle'?'#78e9dc':'#b9a5ff';
  ctx.fillStyle=fill;ctx.strokeStyle='#ffffff8c';ctx.lineWidth=1;
  const vertices=F.targetVertices({...t,x:0,y:0,rotation:0});
  if(t.kind==='circle')circle(0,0,t.r);
  else pathVertices(vertices);
  ctx.fill();ctx.shadowBlur=0;ctx.stroke();
  ctx.fillStyle='#ffffff63';
  circle(-t.r*.24,-t.r*.28,2.8);ctx.fill();
  if(t.hp>1){ctx.strokeStyle=t.variant==='inflate'?'#fff1aa':'#ff4459';ctx.lineWidth=3;circle(0,0,t.r*.52);ctx.stroke();}
  if(t.variant==='inflate'){ctx.strokeStyle='#fff6bf';ctx.lineWidth=1.5;circle(0,0,t.r*.78);ctx.stroke();}
  if(t.variant==='split'){ctx.fillStyle='#fff3f7';circle(-t.r*.29,0,t.r*.19);ctx.fill();circle(t.r*.29,0,t.r*.19);ctx.fill();}
  if(t.variant==='split-child'){ctx.strokeStyle='#ff5b88';ctx.lineWidth=1.5;circle(0,0,t.r*.6);ctx.stroke();}
  ctx.restore();
 }
 function drawPaddle(w){
  const a=w.paddleAngle,half=F.paddleHalfAt(w.level),from=a-half,to=a+half;
  ctx.save();ctx.lineCap='round';
  ctx.shadowBlur=24;ctx.shadowColor=w.damageCooldown>0?'#ff526a':'#69f6e4';
  ctx.strokeStyle=w.damageCooldown>0?'#ff526a':'#37bed4';ctx.lineWidth=PADDLE_THICK;
  ctx.beginPath();ctx.arc(C.x,C.y,PADDLE_R,from,to);ctx.stroke();
  ctx.shadowBlur=0;
  ctx.strokeStyle=w.damageCooldown>0?'#ffdfdd':'#ccfffb';ctx.lineWidth=5;
  ctx.beginPath();ctx.arc(C.x,C.y,PADDLE_R-PADDLE_THICK/2+1,from+.012,to-.012);ctx.stroke();
  ctx.strokeStyle='#9feaff';ctx.lineWidth=4;
  ctx.beginPath();ctx.arc(C.x,C.y,PADDLE_R+PADDLE_THICK/2-1,from+.016,to-.016);ctx.stroke();
  ctx.fillStyle='#aaf6f3';
  for(const theta of [from,to]){circle(C.x+Math.cos(theta)*PADDLE_R,C.y+Math.sin(theta)*PADDLE_R,7);ctx.fill();}
  ctx.restore();
 }
 function drawBall(w){
  const b=w.ball;
  const charged=w.energy>0;
  const glow=charged?(w.energy<=34?'#ffcb74':'#7dffef'):'#ff7189';
  for(let i=0;i<w.trail.length;i++){
   const p=w.trail[i],alpha=(i+1)/w.trail.length;
   ctx.fillStyle=charged?'rgba(120,255,248,'+(alpha*.23)+')':'rgba(255,118,139,'+(alpha*.16)+')';
   circle(p.x,p.y,2+alpha*5);ctx.fill();
  }
  ctx.save();ctx.shadowColor=glow;ctx.shadowBlur=charged?28:12;ctx.fillStyle=charged?'#f5ffff':'#586b88';
  circle(b.x,b.y,b.r);ctx.fill();ctx.shadowBlur=0;
  ctx.strokeStyle=glow;ctx.lineWidth=charged?2.5:1;circle(b.x,b.y,b.r+3);ctx.stroke();
  if(charged){ctx.fillStyle='#eaffff';circle(b.x-2,b.y-2,1.9);ctx.fill();}
  ctx.restore();
 }
 function overlay(w){
  if(w.state==='playing')return;
  ctx.save();const title=w.state==='gameover'?'GAME OVER':w.state==='paused'?'PAUSED':w.state==='levelclear'?'ARENA CLEAR':'READY?';
  const hint=w.state==='gameover'?'記録画像を保存して友だちにシェア！':w.state==='levelclear'?'次のステージへ':w.state==='paused'?'スペースで再開':'クリック / スペースでスタート';
  ctx.fillStyle='#071326b9';ctx.fillRect(250,245,300,116);
  ctx.textAlign='center';ctx.fillStyle='#f5ffff';ctx.font='800 36px system-ui';ctx.fillText(title,400,287);
  ctx.fillStyle='#8ff5ee';ctx.font='600 15px system-ui';ctx.fillText(hint,400,325);
  ctx.fillStyle='#b4c6e3';ctx.font='12px system-ui';
  ctx.fillText(w.state==='gameover'?'FINAL STAGE '+w.level+'  /  SCORE '+w.score:w.state==='levelclear'?'TOTAL SCORE '+w.score:'残り '+w.targets.length+' OBJECTS',400,347);
  ctx.restore();
 }
 function draw(w){
  drawBackground(w);
  for(const t of w.targets)drawTarget(t,w.elapsed);
  drawPaddle(w);
  drawBall(w);
  if(w.combo>=2){ctx.save();ctx.textAlign='center';ctx.fillStyle='#ffe3a4';ctx.shadowColor='#ffb768';ctx.shadowBlur=11;ctx.font='900 23px system-ui';ctx.fillText(w.combo+' COMBO',C.x,C.y-ARENA-16);ctx.restore();}
  if(w.damageCooldown>0&&w.state==='playing'){
    ctx.save();ctx.font='bold 19px system-ui';ctx.textAlign='center';
    ctx.fillStyle='#ff8799';ctx.shadowColor='#ff415c';ctx.shadowBlur=12;
    ctx.fillText('PADDLE HIT!  LIFE −1',C.x,C.y-14);
    ctx.restore();
  }
  overlay(w);
 }
 return{draw};
}
root.OrbitRenderV6={createRenderer};
})(globalThis);
