export const W=540,H=960,TAU=Math.PI*2;
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const angleDiff=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const defaults={mode:'hybrid',speed:1200,turn:540,life:.45,width:5,stagger:45,autoShot:true,allLayers:true};
export function createState(seed=0xDEAF1234){return {time:0,score:0,combo:0,wave:0,spawnTimer:.3,seed:seed>>>0,enemySerial:0,laserSerial:0,
player:{x:270,y:800,hp:5,inv:0,shotCD:0},enemies:[],bullets:[],shots:[],effects:[],locks:[],lockTimer:0,lasers:[],
demo:true,paused:false,over:false,lockHeld:false,explosions:0};}
export function rand(s){s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0;return s.seed/4294967296;}
export function spawnEnemy(s,x,y=-30,layer='ground',boss=false){
const e={id:++s.enemySerial,x,y,bx:x,r:boss?58:layer==='ground'?20:17,hp:boss?42:layer==='ground'?4:3,maxHp:boss?42:layer==='ground'?4:3,
layer,boss,phase:rand(s)*TAU,speed:boss?22:layer==='ground'?43:85,t:0,fireCD:1+rand(s)*2,dead:false};s.enemies.push(e);return e;}
export function spawnWave(s){s.wave++;const n=s.wave%5===0?7:5;for(let i=0;i<n;i++){
const lane=(i-(n-1)/2)*72;spawnEnemy(s,clamp(270+lane,44,496),-35-(i%3)*49,s.wave%2===0&&i%3===0?'air':'ground');}
if(s.wave%5===0)spawnEnemy(s,270,-170,'ground',true);}
export function acquire(s,opt){if(s.locks.length>=8)return false;let chosen=null,best=Infinity;
for(const e of s.enemies){if(e.dead||e.y<48||e.y>s.player.y-70||(!opt.allLayers&&e.layer!=='ground'))continue;
const count=s.locks.filter(v=>v===e.id).length;if(count>=(e.boss?4:1))continue;
const reach=72+(s.player.y-e.y)*.29;if(Math.abs(e.x-s.player.x)>reach)continue;
const rank=Math.abs(e.x-s.player.x)*.7+Math.abs(s.player.y-e.y)*.12+count*100;if(rank<best){chosen=e;best=rank;}}
if(!chosen)return false;s.locks.push(chosen.id);s.effects.push({x:chosen.x,y:chosen.y,t:0,life:.17,r:21,color:'#58eaff',kind:'ring'});return true;}
export function launch(s,opt){const locks=s.locks.splice(0);locks.forEach((id,i)=>{const side=i%2===0?-1:1;s.lasers.push({
id:++s.laserSerial,target:id,mode:opt.mode,delay:i*opt.stagger/1000,t:0,
x:s.player.x+side*(12+Math.floor(i/2)*4),y:s.player.y-18,ox:s.player.x+side*(12+Math.floor(i/2)*4),oy:s.player.y-18,
angle:-Math.PI/2+side*(.55+Math.floor(i/2)*.11),side,hit:false,trail:[],depth:0});});return locks.length;}
function bezier(p0,p1,p2,p3,t){const u=1-t;return {x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,
y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y};}
export function advanceLaser(l,target,dt,opt,clock){
if(l.hit)return false;l.t+=dt;if(l.t<l.delay)return false;if(!target){l.hit=true;return false;}
const age=l.t-l.delay,goal={x:target.x,y:target.y};
if(l.mode==='bezier'){const t=clamp(age/(Math.max(.24,distance({x:l.ox,y:l.oy},goal)/opt.speed)),0,1);
const dx=goal.x-l.ox,dy=goal.y-l.oy,p0={x:l.ox,y:l.oy},p1={x:l.ox+l.side*145,y:l.oy-165},p2={x:l.ox+dx*.7-l.side*85,y:l.oy+dy*.75};
const p=bezier(p0,p1,p2,goal,1-(1-t)*(1-t));l.x=p.x;l.y=p.y;}
else{const flare=l.mode==='hybrid'?clamp((.23-age)/.23,0,1):0;
const aim=Math.atan2(goal.y-l.y,goal.x-l.x),initial=-Math.PI/2+l.side*1.08,desired=aim+angleDiff(aim,initial)*flare;
const maxTurn=opt.turn*Math.PI/180*dt*(l.mode==='hybrid'?1.12:1);
l.angle+=clamp(angleDiff(l.angle,desired),-maxTurn,maxTurn);
l.x+=Math.cos(l.angle)*opt.speed*dt;l.y+=Math.sin(l.angle)*opt.speed*dt;}
l.trail.push({x:l.x,y:l.y,time:clock});if(l.trail.length>230)l.trail.shift();
while(l.trail.length&&clock-l.trail[0].time>opt.life)l.trail.shift();
if(distance(l,goal)<=Math.max(target.r*.72,opt.speed*dt*1.7))return true;
if(age>3.3||l.x< -220||l.x>W+220||l.y< -320||l.y>H+200)l.hit=true;
return false;}
export function destroy(s,e,bonus=0){if(e.dead)return;e.dead=true;s.explosions++;s.score+=100*(1+Math.min(127,bonus));
s.effects.push({x:e.x,y:e.y,t:0,life:e.boss?.9:.5,r:e.boss?110:38,color:e.layer==='ground'?'#ffb557':'#85dafa',kind:'blast'});}
export function step(s,dt,input,opt){
if(s.paused||s.over)return;dt=clamp(dt,0,1/30);s.time+=dt;
if(s.demo)input={dx:Math.sin(s.time*.87)*.75,dy:Math.cos(s.time*.61)*.12,fire:true,lock:true,release:false};
const p=s.player;p.inv=Math.max(0,p.inv-dt);p.shotCD-=dt;const len=Math.hypot(input.dx||0,input.dy||0)||1;
p.x=clamp(p.x+(input.dx||0)/len*310*dt,22,W-22);p.y=clamp(p.y+(input.dy||0)/len*310*dt,180,H-35);
if(Number.isFinite(input.moveX)&&Number.isFinite(input.moveY)){p.x=clamp(p.x+(input.moveX-p.x)*Math.min(1,dt*14),22,W-22);p.y=clamp(p.y+(input.moveY-p.y)*Math.min(1,dt*14),180,H-35);}
if(input.fire&&p.shotCD<=0){s.shots.push({x:p.x-8,y:p.y-22},{x:p.x+8,y:p.y-22});p.shotCD=.105;}
if(s.spawnTimer<=0){spawnWave(s);s.spawnTimer=4.2;}else s.spawnTimer-=dt;
for(const e of s.enemies){e.t+=dt;e.y+=e.speed*dt;e.x=clamp(e.bx+Math.sin(e.t*(e.boss?.65:1.8)+e.phase)*(e.boss?55:28),26,W-26);
e.fireCD-=dt;if(e.y>80&&e.y<H-110&&e.fireCD<=0){s.bullets.push({x:e.x,y:e.y,vx:clamp((p.x-e.x)*.12,-85,85),vy:e.boss?175:130});e.fireCD=e.boss?.6:2.1+rand(s)*1.5;}if(e.y>H+90)e.dead=true;}
for(const b of s.shots){b.y-=920*dt;for(const e of s.enemies){if(!e.dead&&e.layer==='air'&&Math.hypot(b.x-e.x,b.y-e.y)<e.r){e.hp--;b.y=-999;if(e.hp<=0)destroy(s,e);break;}}}
s.shots=s.shots.filter(b=>b.y>-50);
for(const b of s.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;if(!s.demo&&p.inv<=0&&Math.hypot(b.x-p.x,b.y-p.y)<14){p.hp--;p.inv=1.4;b.y=2000;
s.effects.push({x:p.x,y:p.y,t:0,life:.6,r:48,color:'#ff606d',kind:'blast'});if(p.hp<=0){s.over=true;s.demo=false;}}}
s.bullets=s.bullets.filter(b=>b.y<1050&&b.x>-50&&b.x<W+50);
s.lockTimer-=dt;if(input.lock&&s.lockTimer<=0){acquire(s,opt);s.lockTimer=s.demo?.09:.105;}
if(s.demo){if(s.locks.length>=5||s.time%1.3>1.15){if(s.locks.length)launch(s,opt);}}else if(input.release)launch(s,opt);
for(const l of s.lasers){const target=s.enemies.find(e=>!e.dead&&e.id===l.target);
if(advanceLaser(l,target,dt,opt,s.time)&&target){target.hp-=5;
s.effects.push({x:target.x,y:target.y,t:0,life:.28,r:26,color:'#7cffff',kind:'blast'});
if(target.hp<=0){s.combo=Math.min(7,s.combo+1);destroy(s,target,2**s.combo-1);}else s.combo=Math.max(0,s.combo-1);l.hit=true;}
while(l.trail.length&&s.time-l.trail[0].time>opt.life)l.trail.shift();}
s.lasers=s.lasers.filter(l=>!l.hit||l.trail.length>1);s.enemies=s.enemies.filter(e=>!e.dead);
for(const f of s.effects)f.t+=dt;s.effects=s.effects.filter(f=>f.t<f.life);
if(s.bullets.length>200)s.bullets.splice(0,s.bullets.length-200);
if(s.shots.length>90)s.shots.splice(0,s.shots.length-90);
if(s.lasers.length>32)s.lasers.splice(0,s.lasers.length-32);}
