import {W,H,clamp} from './flight.mjs';
const TAU=Math.PI*2;
function polygon(c,n,r){c.beginPath();for(let i=0;i<n;i++){const a=i*TAU/n-Math.PI/2;if(i===0)c.moveTo(Math.cos(a)*r,Math.sin(a)*r);else c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();}
export function drawScene(c,s){
const t=s.time;c.clearRect(0,0,W,H);const bg=c.createLinearGradient(0,0,0,H);
bg.addColorStop(0,'#030918');bg.addColorStop(.55,'#0a263b');bg.addColorStop(1,'#070f21');c.fillStyle=bg;c.fillRect(0,0,W,H);
c.save();c.strokeStyle='#246583';c.lineWidth=1;
for(let j=-1;j<23;j++){const y=((j*64+t*40)%1120)-65,q=clamp((y+200)/(H+200),.05,1);c.globalAlpha=.11+.18*q;c.beginPath();c.moveTo(270-310*q,y);c.lineTo(270+310*q,y);c.stroke();}
for(let k=-6;k<=6;k++){c.beginPath();c.moveTo(270+k*12,-60);c.lineTo(270+k*69,H);c.stroke();}c.restore();
for(let i=0;i<30;i++){const x=(i*173+71)%W,y=(i*157+Math.floor(t*9)*(1+i%3))%H;c.fillStyle=i%4===0?'#4b83a2':'#29465f';c.fillRect(x,y,i%5===0?2:1,i%3===0?3:1);}
for(let i=0;i<18;i++){const x=(i*137+38)%W,y=(i*229+Math.floor(t*42))%(H+160)-80,q=.4+.6*clamp(y/H,0,1),sz=(11+(i*17)%30)*q;
c.fillStyle=i%3===0?'#183f52':'#132f42';c.strokeStyle='#2a607b';c.lineWidth=.8;c.fillRect(x-sz/2,y-sz/3,sz,sz*.66);c.strokeRect(x-sz/2,y-sz/3,sz,sz*.66);
c.fillStyle='#4dc3db';c.globalAlpha=.32;c.fillRect(x-sz*.24,y-sz*.1,sz*.48,1);c.globalAlpha=1;}
for(const e of s.enemies){if(e.y< -80||e.y>H+80)continue;const ground=e.layer==='ground';c.save();c.translate(e.x,e.y);
c.scale(ground?.85:1,ground?.85:1);c.shadowColor=ground?'#ff9e5b':'#45dbff';c.shadowBlur=e.boss?22:8;c.strokeStyle=ground?'#e7995f':'#70c9e9';c.lineWidth=e.boss?3:2;c.fillStyle=ground?'#50354c':'#194a5b';
if(e.boss){c.rotate(e.t*.25);polygon(c,8,e.r);c.fill();c.stroke();c.fillStyle='#df9371';polygon(c,6,e.r*.52);c.fill();c.strokeStyle='#ffe0ba';c.stroke();}
else if(ground){c.rotate(e.t*.7);polygon(c,6,e.r);c.fill();c.stroke();c.fillStyle='#ffaf61';c.fillRect(-5,-5,10,10);}
else{c.beginPath();c.moveTo(0,-e.r);c.lineTo(e.r,e.r*.65);c.lineTo(0,e.r*.25);c.lineTo(-e.r,e.r*.65);c.closePath();c.fill();c.stroke();c.fillStyle='#a4f8ff';c.fillRect(-4,-4,8,6);}
if(e.hp<e.maxHp){c.shadowBlur=0;c.fillStyle='#152331';c.fillRect(-e.r,-e.r-13,e.r*2,4);c.fillStyle='#75f1de';c.fillRect(-e.r,-e.r-13,e.r*2*Math.max(0,e.hp/e.maxHp),4);}c.restore();}
c.save();c.fillStyle='#e8ffb1';c.shadowBlur=10;c.shadowColor='#effc7a';for(const b of s.shots)c.fillRect(b.x-2,b.y-15,4,27);
c.fillStyle='#fd8b82';c.shadowColor='#ff5148';for(const b of s.bullets){c.beginPath();c.arc(b.x,b.y,4.2,0,TAU);c.fill();}c.restore();
if((!s.demo&&s.lockHeld)||(s.demo&&s.locks.length>0)){c.save();c.strokeStyle='#2f9fae';c.fillStyle='#30ddf5';c.globalAlpha=.22;c.beginPath();
c.moveTo(s.player.x-45,s.player.y-75);c.lineTo(s.player.x-235,70);c.lineTo(s.player.x+235,70);c.lineTo(s.player.x+45,s.player.y-75);c.closePath();c.fill();c.stroke();c.restore();}
for(let i=0;i<s.locks.length;i++){const e=s.enemies.find(x=>x.id===s.locks[i]);if(!e)continue;c.save();c.translate(e.x,e.y);c.rotate(t*1.9+i*.1);
c.strokeStyle='#6df5ff';c.lineWidth=1.6;c.shadowColor='#60ffff';c.shadowBlur=11;const size=e.r+9+Math.sin(t*10+i)*2;
for(let j=0;j<4;j++){c.rotate(Math.PI/2);c.beginPath();c.moveTo(size-8,-size);c.lineTo(size,-size);c.lineTo(size,-size+8);c.stroke();}
c.restore();c.fillStyle='#d2ffff';c.font='bold 11px monospace';c.textAlign='center';c.fillText(String(i+1),e.x,e.y-e.r-17);}
for(const e of s.effects){const q=e.t/e.life;c.save();c.globalAlpha=(1-q)*.82;c.strokeStyle=e.color;c.fillStyle=e.color;c.shadowBlur=20;c.shadowColor=e.color;c.lineWidth=e.kind==='ring'?2:4;
c.beginPath();c.arc(e.x,e.y,(e.kind==='ring'?.45:.18)*e.r+e.r*q,0,TAU);c.stroke();
if(e.kind==='blast'){for(let j=0;j<10;j++){const a=j*TAU/10+e.x*.04,r=e.r*q;c.fillRect(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r,3,3);}}c.restore();}
const p=s.player;c.save();c.translate(p.x,p.y);if(p.inv>0&&Math.sin(t*24)>0)c.globalAlpha=.5;c.shadowColor='#5bdeff';c.shadowBlur=18;c.fillStyle='#1d668a';c.strokeStyle='#c2f6ff';c.lineWidth=2;c.beginPath();
c.moveTo(0,-24);c.lineTo(10,-4);c.lineTo(25,11);c.lineTo(13,18);c.lineTo(0,12);c.lineTo(-13,18);c.lineTo(-25,11);c.lineTo(-10,-4);c.closePath();c.fill();c.stroke();
c.fillStyle='#d5ffff';c.beginPath();c.moveTo(0,-15);c.lineTo(5,4);c.lineTo(-5,4);c.closePath();c.fill();c.fillStyle='#edb77a';c.fillRect(-14,17,5,12+Math.sin(t*31)*3);c.fillRect(9,17,5,12+Math.sin(t*31+2)*3);c.restore();
if(s.over){c.fillStyle='#040916cc';c.fillRect(0,0,W,H);c.fillStyle='#fda9ac';c.textAlign='center';c.font='900 38px system-ui';c.fillText('GAME OVER',W/2,H*.47);c.font='17px system-ui';c.fillText('SPACE / PLAY TO RESTART',W/2,H*.53);}
}
export function drawLaserCanvas(ctx,s,opt){
ctx.save();ctx.clearRect(0,0,W,H);ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.lineJoin='round';
for(const l of s.lasers){if(l.trail.length<2)continue;const pts=l.trail;
for(const [factor,color,alpha] of [[6,'#36c8ff',.11],[3.6,'#36e9ff',.28],[1.6,'#8bf8ff',.55],[.62,'#ffffff',.95]]){
for(let i=1;i<pts.length;i++){const q=clamp(1-(s.time-pts[i].time)/opt.life,0,1);if(q<=0)continue;ctx.globalAlpha=q*q*alpha;ctx.strokeStyle=color;ctx.lineWidth=opt.width*factor*(.65+.35*q);ctx.beginPath();ctx.moveTo(pts[i-1].x,pts[i-1].y);ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();}}
if(!l.hit){ctx.globalAlpha=.9;const head=ctx.createRadialGradient(l.x,l.y,0,l.x,l.y,21);head.addColorStop(0,'#ffffff');head.addColorStop(.14,'#a7faff');head.addColorStop(.4,'#38cbff70');head.addColorStop(1,'#38cbff00');ctx.fillStyle=head;ctx.fillRect(l.x-21,l.y-21,42,42);}}
ctx.restore();}