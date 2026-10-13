import {W,H} from './game.js';
const TAU=Math.PI*2;
function line(ctx,x1,y1,x2,y2,color,width=1){
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
}
function ellipse(ctx,x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);ctx.fill()}
export function ground(ctx,g){
 const t=g.time;ctx.clearRect(0,0,W,H);
 const sky=ctx.createLinearGradient(0,0,0,H);
 sky.addColorStop(0,'#101c3d');sky.addColorStop(.4,'#081629');sky.addColorStop(1,'#020b17');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 const aura=ctx.createRadialGradient(480,75,12,480,100,440);aura.addColorStop(0,'#2e879250');aura.addColorStop(1,'#01091800');ctx.fillStyle=aura;ctx.fillRect(0,0,W,600);
 // The track converges toward the upper vanishing region: angled 2D top-down projection.
 ctx.beginPath();ctx.moveTo(338,74);ctx.lineTo(622,74);ctx.lineTo(930,H);ctx.lineTo(30,H);ctx.closePath();
 const floor=ctx.createLinearGradient(0,70,0,600);floor.addColorStop(0,'#193044');floor.addColorStop(.6,'#102438');floor.addColorStop(1,'#14263c');
 ctx.fillStyle=floor;ctx.fill();ctx.save();ctx.clip();
 for(let k=-10;k<=10;k++){
  const tx=480+k*40;const bx=480+k*125;
  line(ctx,tx,74,bx,600,k===0?'#5cf8ed33':'#509ca72a',k%2===0?2:1);
 }
 for(let k=0;k<26;k++){
  const f=((k/23+t*.22)%1);
  const y=74+Math.pow(f,2.0)*570;
  const span=145+(y-74)*.56;
  line(ctx,480-span,y,480+span,y, f>.7?'#77ddf026':'#73f4f01b',f>.8?2:1);
 }
 for(let k=0;k<14;k++){
  const z=((k*.129+t*.36)%1);const y=77+z*z*540;const w=5+z*24;
  ctx.fillStyle=k%2?'#14cfc025':'#66ccf030';ctx.fillRect(480-120-z*310,y,w,2+z*6);
  ctx.fillRect(480+120+z*310-w,y,w,2+z*6);
 }
 ctx.restore();
 line(ctx,338,74,30,600,'#56dce777',3);line(ctx,622,74,930,600,'#56dce777',3);
 line(ctx,335,74,0,600,'#84b7e422');line(ctx,625,74,960,600,'#84b7e422');
 // Slanted gantry ribs, atmospheric lights, and deep side platforms.
 for(let side=0;side<2;side++){
  const s=side===0?-1:1;
  for(let k=0;k<7;k++){
   const z=((k/7+t*.095)%1),y=80+z*z*560;
   const x=480+s*(155+z*305);
   line(ctx,x,y,x+s*(16+z*60),y+10+z*29,'#86dded28',1+z*2);
   ellipse(ctx,x,y,2+z*3,1+z*2,k%2?'#65d3ff77':'#f89b7788');
  }
 }
 for(let i=0;i<20;i++){const q=i*91.91;const x=(q*11.23)%960,y=((q*9.77+t*3)%580+580)%580;
  ellipse(ctx,x,y,.5+(i%3)*.4,.5,'#a6d7ff44');
 }
 const vignette=ctx.createRadialGradient(480,330,100,480,300,620);vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#000915cc');ctx.fillStyle=vignette;ctx.fillRect(0,0,960,600);
}
function ship(ctx,p,time){
 ctx.save();ctx.translate(p.x,p.y);if(p.inv>0&&Math.sin(time*39)>0)ctx.globalAlpha=.42;
 ellipse(ctx,10,25,31,9,'#03101acc');
 const engine=Math.sin(time*36)*5;
 ellipse(ctx,-13,28,7,17+engine,'#4deef066');ellipse(ctx,13,28,7,17+engine,'#4deef066');
 ctx.shadowBlur=19;ctx.shadowColor='#53cfff';
 ctx.fillStyle='#132e55';ctx.strokeStyle='#9df5ff';ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(0,-32);ctx.lineTo(14,-9);ctx.lineTo(33,13);ctx.lineTo(32,24);ctx.lineTo(9,16);
 ctx.lineTo(0,22);ctx.lineTo(-9,16);ctx.lineTo(-32,24);ctx.lineTo(-33,13);ctx.lineTo(-14,-9);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.shadowBlur=0;ctx.fillStyle='#3b9fb5';ctx.beginPath();ctx.moveTo(0,-23);ctx.lineTo(8,-1);ctx.lineTo(0,12);ctx.lineTo(-8,-1);ctx.closePath();ctx.fill();
 ctx.fillStyle='#e1ffff';ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(5,-5);ctx.lineTo(0,0);ctx.lineTo(-5,-5);ctx.closePath();ctx.fill();
 line(ctx,-22,9,-9,9,'#ffb374',3);line(ctx,9,9,22,9,'#ffb374',3);
 ctx.restore();
}
function drawPickups(ctx,g){
 for(const p of g.pickups){
  const yy=p.y+Math.sin(g.time*6)*5;
  ellipse(ctx,p.x,p.y+14,14,5,'#000a15bb');
  ctx.save();ctx.translate(p.x,yy);ctx.rotate(g.time*1.9);ctx.shadowBlur=16;ctx.shadowColor=p.kind==='heal'?'#ff8b89':'#ffff7e';
  ctx.strokeStyle=p.kind==='heal'?'#ffaaa0':'#fff5a1';ctx.lineWidth=3;ctx.strokeRect(-9,-9,18,18);
  ctx.fillStyle=p.kind==='heal'?'#ff837a':'#fff597';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.rotate(-g.time*1.9);ctx.fillText(p.kind==='heal'?'+':'P',0,0);ctx.restore();
 }
}
export function actors(ctx,g,withFallback=null){
 ctx.clearRect(0,0,W,H);
 // Ground shadows imply that liquid enemies hover above the oblique battlefield.
 for(const e of g.enemies){ellipse(ctx,e.x+12,e.y+e.rad*.84,e.rad*.75,e.rad*.22,'#02061655')}
 if(withFallback)withFallback(ctx,g);
 for(const e of g.enemies){
  const r=e.rad;ctx.save();ctx.translate(e.x,e.y);
  ellipse(ctx,-r*.23,-r*.2,Math.max(2,r*.115),Math.max(2,r*.13),'#e4ffffb0');
  ellipse(ctx,r*.19,-r*.16,Math.max(1,r*.08),Math.max(1,r*.085),'#07203990');
  if(e.hp<e.maxhp&&!e.small){const bw=r*1.5;ctx.fillStyle='#071829cc';ctx.fillRect(-bw/2,-r-13,bw,4);ctx.fillStyle='#a9fff2';ctx.fillRect(-bw/2,-r-13,bw*Math.max(0,e.hp/e.maxhp),4)}
  ctx.restore();
 }
 for(const b of g.shots){
  ctx.save();ctx.shadowBlur=16;ctx.shadowColor='#7bfaff';line(ctx,b.x,b.y+13,b.x-b.vx*.018,b.y-12,'#bffeff',4);ctx.restore();
 }
 for(const b of g.hostiles){
  ctx.save();ctx.shadowBlur=17;ctx.shadowColor='#fe798a';
  ellipse(ctx,b.x,b.y,7,9,'#ff907e');ellipse(ctx,b.x-1,b.y-2,2,3,'#ffefbe');ctx.restore();
 }
 drawPickups(ctx,g);
 for(const s of g.particles){
  ctx.globalAlpha=Math.max(0,1-s.age/s.life);ellipse(ctx,s.x,s.y,s.size*(1-s.age/s.life),s.size*.5*(1-s.age/s.life),s.color)
 }
 ctx.globalAlpha=1;
 if(g.status==='running'||g.status==='paused'||g.status==='over')ship(ctx,g.player,g.time);
 if(g.shock>0){ctx.save();ctx.strokeStyle='#baffef';ctx.lineWidth=4;ctx.globalAlpha=g.shock/.58;ctx.shadowBlur=34;ctx.shadowColor='#85ffec';
  ctx.beginPath();ctx.arc(g.player.x,g.player.y,30+(1-g.shock/.58)*560,0,TAU);ctx.stroke();ctx.restore();}
 if(g.player.inv>0){ctx.save();ctx.strokeStyle='#92fff655';ctx.lineWidth=2;ctx.beginPath();ctx.arc(g.player.x,g.player.y,27+4*Math.sin(g.time*15),0,TAU);ctx.stroke();ctx.restore()}
}