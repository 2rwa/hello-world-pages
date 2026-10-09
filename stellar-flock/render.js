'use strict';
const polygon=(c,pts)=>{c.beginPath();c.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);c.closePath()};
FlightGame.prototype.draw=function(){
 const c=this.ctx,W=this.W,H=this.H,t=this.time;
 c.save();c.setTransform(this.canvas.width/W,0,0,this.canvas.height/H,0,0);
 const bg=c.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#07122b');bg.addColorStop(.50,'#0a1027');bg.addColorStop(1,'#070b20');c.fillStyle=bg;c.fillRect(0,0,W,H);
 c.save();c.globalCompositeOperation='screen';for(const a of this.bgDust){const y=(a.y*H+t*a.s*3)%(H+150)-75;const glow=c.createRadialGradient(a.x,y,0,a.x,y,a.r);glow.addColorStop(0,'#294c8b13');glow.addColorStop(1,'#25438700');c.fillStyle=glow;c.beginPath();c.arc(a.x,y,a.r,0,TWO);c.fill()}c.restore();
 c.save();for(const s of this.stars){const y=s.y*H;c.fillStyle=`rgba(171,220,255,${s.light*(.65+.35*Math.sin(t*2+s.x))})`;c.fillRect(s.x,y,s.r,s.r+(s.speed*.65))}c.restore();
 c.save();c.strokeStyle='#3662a412';c.lineWidth=1;const horizon=H*.65;for(let i=0;i<=11;i++){const x=i*W/10-W/20;c.beginPath();c.moveTo(W/2+(x-W/2)*.15,horizon);c.lineTo(x+(x-W/2)*.25,H);c.stroke()}for(let i=0;i<12;i++){const q=i/12;c.beginPath();c.moveTo(0,horizon+(H-horizon)*q*q);c.lineTo(W,horizon+(H-horizon)*q*q);c.stroke()}c.restore();
 if(this.mode==='playing'&&this.jolt>0)c.translate(rnd(-this.jolt,this.jolt)*.3,rnd(-this.jolt,this.jolt)*.3);
 // Enemy targeting guides: lock-on instead of aiming manually.
 if(this.mode==='playing'){
  const targets=this.targets();c.save();for(let i=0;i<Math.min(3,targets.length);i++){const e=targets[i],rr=23+Math.sin(t*6+i)*2;c.strokeStyle=i?'#6ef1ff57':'#8afcffe3';c.lineWidth=i?1:1.7;c.setLineDash(i?[2,5]:[8,5]);c.beginPath();c.arc(e.x,e.y,rr,0,TWO);c.stroke();c.setLineDash([]);for(let a=0;a<4;a++){let ang=a*Math.PI/2+t*(i?-.4:.55);c.beginPath();c.arc(e.x,e.y,rr+5,ang,ang+.2);c.stroke()}}
  if(targets.length){c.lineWidth=.7;c.strokeStyle='#38d9ed22';c.setLineDash([2,9]);c.beginPath();c.moveTo(this.player.x,this.player.y-25);c.lineTo(targets[0].x,targets[0].y);c.stroke()}c.restore()
 }
 // Dive targets trail luminous wingmarks.
 for(const e of this.enemies){if(!e.alive)continue;if(e.state==='dive'){c.save();c.globalAlpha=.24;c.strokeStyle=e.variant===2?'#f566cf':'#56f7ed';c.lineWidth=4;c.shadowBlur=14;c.shadowColor=c.strokeStyle;c.beginPath();c.moveTo(e.x-e.side*16,e.y-30);c.lineTo(e.x-e.side*24,e.y-57);c.stroke();c.restore()}
  this.drawEnemy(c,e,t)
 }
 for(const b of this.enemyShots){c.save();c.shadowColor='#ff719c';c.shadowBlur=13;c.strokeStyle='#ff6eaa';c.lineWidth=3;c.beginPath();if(b.trail.length){c.moveTo(b.trail[0].x,b.trail[0].y);for(const p of b.trail)c.lineTo(p.x,p.y)}c.stroke();c.fillStyle='#fff1bd';c.beginPath();c.arc(b.x,b.y,3.6,0,TWO);c.fill();c.restore()}
 // Missile ballet: layered curved neon/smoke trails with independently homing rockets.
 for(const m of this.missiles){if(m.trail.length<2)continue;c.save();c.lineCap='round';c.lineJoin='round';const pts=m.trail;
  c.globalCompositeOperation='lighter';c.shadowBlur=16;c.shadowColor=`hsla(${m.hue},100%,67%,.65)`;c.strokeStyle=`hsla(${m.hue},95%,56%,.30)`;c.lineWidth=m.burst?11:7;c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);c.stroke();
  c.shadowBlur=6;c.strokeStyle=`hsla(${m.hue},100%,80%,.9)`;c.lineWidth=m.burst?2.8:2.2;c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);c.stroke();
  c.fillStyle='#ffffff';c.shadowColor='#ffffff';c.shadowBlur=15;c.beginPath();c.arc(m.x,m.y,m.burst?3.5:2.8,0,TWO);c.fill();c.restore()
 }
 for(const r of this.rings){c.save();c.strokeStyle=`hsla(${r.hue},100%,75%,${r.life/.3*.7})`;c.lineWidth=2;c.shadowColor=c.strokeStyle;c.shadowBlur=16;c.beginPath();c.arc(r.x,r.y,r.r,0,TWO);c.stroke();c.restore()}
 for(const p of this.particles){c.fillStyle=`hsla(${p.hue},100%,73%,${clamp(p.life/.5,0,1)})`;c.fillRect(p.x-p.r/2,p.y-p.r/2,p.r,p.r)}
 for(const p of this.textPop){c.save();c.globalAlpha=Math.min(1,p.t*1.7);c.textAlign='center';c.font='bold 13px monospace';c.shadowColor='#8ffbed';c.shadowBlur=7;c.fillStyle='#e3fff5';c.fillText(p.text,p.x,p.y);c.restore()}
 this.drawPlayer(c,t);
 if(this.mode==='playing'&&this.combo>=3){c.save();c.textAlign='center';c.shadowColor='#f66ca2';c.shadowBlur=12;c.fillStyle='#ff9cc5';c.font='bold 18px system-ui';c.fillText(`CHAIN × ${this.combo}`,W/2,H-40);c.restore()}
 if(this.waveFlash>0){c.save();c.globalAlpha=Math.min(1,this.waveFlash,.6);c.fillStyle='#a0eaff';c.font='800 27px system-ui';c.textAlign='center';c.shadowColor='#45d3ff';c.shadowBlur=18;c.fillText('WAVE '+String(this.wave).padStart(2,'0'),W/2,H*.53);c.restore()}
 if(this.hitFlash>0){c.fillStyle=`rgba(255,74,140,${this.hitFlash*.25})`;c.fillRect(0,0,W,H)}
 const vg=c.createRadialGradient(W/2,H*.48,H*.15,W/2,H*.48,H*.85);vg.addColorStop(0,'#00000000');vg.addColorStop(1,'#00000066');c.fillStyle=vg;c.fillRect(0,0,W,H);
 c.restore()
};
FlightGame.prototype.drawEnemy=function(c,e,t){const hue=e.variant===2?320:e.variant===1?35:178,flap=Math.sin(t*4+e.phase)*.17,s=1+(e.variant===2?.14:0);c.save();c.translate(e.x,e.y);if(e.state==='dive')c.rotate(Math.sin(e.diveT*3)*.26*e.side);c.scale(s,s);
 c.shadowColor=`hsl(${hue} 100% 60%)`;c.shadowBlur=13;c.fillStyle=e.variant===2?'#f66ac0':e.variant===1?'#e3a656':'#55eaca';
 polygon(c,[[-22,-5],[-10,-4],[-6,-13],[0,-16],[6,-13],[10,-4],[22,-5],[17,5+flap*15],[9,3],[7,15],[0,9],[-7,15],[-9,3],[-17,5+flap*15]]);c.fill();c.shadowBlur=0;c.fillStyle='#071a38';polygon(c,[[-13,-1],[-6,1],[0,-5],[6,1],[13,-1],[7,7],[0,3],[-7,7]]);c.fill();c.fillStyle='#e9feff';c.fillRect(-2.5,-9,5,8);c.fillStyle='#ffffff60';c.fillRect(-21,-8,6,2);c.fillRect(15,-8,6,2);
 if(e.hp>1){c.strokeStyle='#ffe5ff99';c.beginPath();c.arc(0,0,20,0,TWO);c.stroke()}c.restore()};
FlightGame.prototype.drawPlayer=function(c,t){const p=this.player;c.save();c.translate(p.x,p.y);const blink=p.invul>0&&Math.sin(t*24)>0;if(blink)c.globalAlpha=.42;
 c.save();c.globalCompositeOperation='lighter';const jet=c.createLinearGradient(0,0,0,58);jet.addColorStop(0,'#72faffaa');jet.addColorStop(.5,'#3faaff55');jet.addColorStop(1,'#1468dd00');c.fillStyle=jet;c.beginPath();c.moveTo(-12,18);c.lineTo(0,48+rnd(-3,8));c.lineTo(12,18);c.closePath();c.fill();c.restore();
 c.shadowColor='#5edfff';c.shadowBlur=19;c.fillStyle='#63d5ef';polygon(c,[[0,-30],[9,-14],[14,-3],[29,9],[30,18],[13,14],[7,25],[0,18],[-7,25],[-13,14],[-30,18],[-29,9],[-14,-3],[-9,-14]]);c.fill();c.shadowBlur=0;c.fillStyle='#102a57';polygon(c,[[0,-23],[6,-5],[0,13],[-6,-5]]);c.fill();c.fillStyle='#e1ffff';polygon(c,[[0,-22],[4,-4],[0,3],[-4,-4]]);c.fill();c.strokeStyle='#b4f7ff';c.lineWidth=1.5;c.beginPath();c.moveTo(-27,12);c.lineTo(-14,8);c.moveTo(27,12);c.lineTo(14,8);c.stroke();
 if(p.invul>0){c.strokeStyle='#7deeff98';c.shadowColor='#57dfff';c.shadowBlur=14;c.lineWidth=1.5;c.beginPath();c.arc(0,0,34+Math.sin(t*8)*2,0,TWO);c.stroke()}c.restore();
};
window.flockGame=new FlightGame();