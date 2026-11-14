// Deterministic Canvas 2D overlay. All coordinates use the 270px sticker space.
const TAU=Math.PI*2, ink='#173041', gold='#ffe26c', aqua='#94eaff', rose='#ff91ab';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n)};
const smooth=(a,b,x)=>{const q=clamp((x-a)/(b-a),0,1);return q*q*(3-2*q)};
export const dailyEntries=[
['おはよう','wake'],['了解！','ack'],['ありがとう','thanks'],['ごめん…','sorry'],
['えっ!?','shock'],['じーっ','stare'],['おつかれ','tired'],['やった！','jump']];
export const nodEffects=['nod','nod','heart','nod','burst','burst','idea','nod'];
export function dailyMotion(type,t){
 const phase=t*TAU, wave=Math.sin(phase), pulse=(1-Math.cos(phase))/2, twice=(1-Math.cos(phase*2))/2;
 let x=0,y=-.38,gx=0,gy=.08,pupil=.28,lid=.98,tear=1.20,lx=0,ly=0;
 switch(type){
 case 'wake': {const wake=smooth(.08,.32,t)*(1-smooth(.82,1,t));y=-.47+.46*wake-.10*Math.sin(phase*2)*wake;gy=.08+.16*wake;lid=-.18+1.16*wake;pupil=.25+.08*wake;tear=1.19+.035*wave;ly=.15*Math.sin(phase*2);break;}
 case 'ack': y=-.32-.21*twice;gy=.12-.58*twice;lid=.97-.48*twice;tear=1.20+.035*wave;ly=.14*Math.sin(phase*2);break;
 case 'thanks': y=-.38+.23*pulse;gx=.09*wave;gy=.14+.16*wave;pupil=.34;lid=.93-.38*twice;tear=1.30+.045*wave;lx=.11*wave;ly=-.12*pulse;break;
 case 'sorry': y=-.49-.10*pulse;gy=-.44-.19*pulse;gx=.08*wave;lid=.26-.13*pulse;pupil=.23;tear=1.32+.04*wave;ly=-.20-.09*pulse;break;
 case 'shock': {const hit=smooth(.08,.19,t)*(1-smooth(.45,.78,t));y=-.45+.57*hit;gx=.05*Math.sin(phase*4)*hit;gy=.05+.07*hit;pupil=.25+.20*hit;lid=.98;tear=1.20+.05*hit;ly=-.20*Math.sin(phase*2);break;}
 case 'stare': x=.06*wave;y=-.34;gx=.62*Math.cos(phase);gy=.05;pupil=.20;lid=.75-.10*pulse;tear=1.19;lx=.06*wave;break;
 case 'tired': y=-.53-.12*pulse;gx=.13*wave;gy=-.18;lid=.07-.20*pulse;pupil=.23;tear=1.19;ly=-.08*pulse;break;
 case 'jump': {const bounce=Math.abs(Math.sin(phase));y=-.50+.55*bounce;x=.12*wave;gy=.10+.18*bounce;pupil=.32;lid=.97-.18*(1-bounce);tear=1.18+.07*bounce;lx=-.14*wave;ly=.20*Math.cos(phase*2);break;}
 default: throw Error('Unknown daily motion: '+type);
 }
 return {t,phase,dip:pulse,p:[x,y,0],g:unit([gx,gy,1]),pupil,lid,tear,lag:[lx,ly,0]};
}
function stroke(c,color=gold,width=4){c.lineCap='round';c.lineJoin='round';c.strokeStyle=ink;c.lineWidth=width+3;c.stroke();c.strokeStyle=color;c.lineWidth=width;c.stroke()}
function line(c,x,y,u,v,color=gold,width=4){c.beginPath();c.moveTo(x,y);c.lineTo(u,v);stroke(c,color,width)}
function star(c,x,y,r,color=gold){c.beginPath();for(let k=0;k<8;k++){const a=k*Math.PI/4-Math.PI/2,z=k%2?r*.30:r;const px=x+Math.cos(a)*z,py=y+Math.sin(a)*z;k?c.lineTo(px,py):c.moveTo(px,py)}c.closePath();c.fillStyle=color;c.fill();c.strokeStyle=ink;c.lineWidth=2.5;c.stroke()}
function drop(c,x,y,r){c.beginPath();c.moveTo(x,y-r);c.bezierCurveTo(x-r*.45,y-r*.25,x-r,y+r*.2,x-r*.65,y+r*.66);c.bezierCurveTo(x-r*.2,y+r*1.18,x+r*.7,y+r*.85,x+r*.72,y+r*.25);c.bezierCurveTo(x+r*.7,y-r*.18,x+r*.23,y-r*.67,x,y-r);c.closePath();c.fillStyle=aqua;c.fill();c.strokeStyle=ink;c.lineWidth=2.5;c.stroke();c.beginPath();c.moveTo(x-r*.26,y+r*.1);c.lineTo(x-r*.36,y+r*.35);c.strokeStyle='#fff';c.lineWidth=2;c.stroke()}
function heart(c,x,y,r){c.beginPath();c.moveTo(x,y+r*.75);c.bezierCurveTo(x-r*1.5,y-r*.1,x-r*.9,y-r*1.1,x,y-r*.4);c.bezierCurveTo(x+r*.9,y-r*1.1,x+r*1.5,y-r*.1,x,y+r*.75);c.closePath();c.fillStyle=rose;c.fill();c.strokeStyle=ink;c.lineWidth=2.5;c.stroke()}
function nod(c,m){const d=m.dip??.5,y=145+20*d;for(const s of [-1,1]){const x=135+s*96;c.beginPath();c.moveTo(x-s*5,y-22);c.quadraticCurveTo(x+s*12,y-6,x,y+10);stroke(c,aqua,4);c.beginPath();c.moveTo(x+s*12,y-19);c.quadraticCurveTo(x+s*24,y-5,x+s*15,y+10);stroke(c,aqua,3)}}
function burst(c,m){const z=.65+.35*(1+Math.sin(m.phase??m.t*TAU))/2;for(const [x,y,dx,dy] of [[47,100,-16,-20],[223,100,16,-20],[35,144,-18,-3],[235,144,18,-3]])line(c,x,y,x+dx*z,y+dy*z,gold,5)}
export function drawEffects(c,type,m){
 const a=m.t*TAU, pulse=(1+Math.sin(a*2))/2;
 c.save();c.lineJoin='round';c.lineCap='round';
 switch(type){
 case 'nod':nod(c,m);break;
 case 'heart':heart(c,225,104-8*Math.sin(a),11+3*pulse);star(c,41,139,8+3*pulse,rose);break;
 case 'burst':burst(c,m);break;
 case 'idea':star(c,224,89,12+3*pulse);star(c,245,110,6+pulse*2);break;
 case 'wake':star(c,45,104,10+4*pulse);star(c,224,98,15-4*pulse);star(c,244,125,7);break;
 case 'ack':{const d=m.dip??.5;nod(c,m);c.beginPath();c.moveTo(221,83+4*d);c.lineTo(229,92+4*d);c.lineTo(245,70+4*d);stroke(c,'#98f4ad',5);break;}
 case 'thanks':heart(c,42,112-7*Math.sin(a),12+2*pulse);heart(c,229,96+7*Math.sin(a),14-2*pulse);star(c,242,135,7+2*pulse);drop(c,48,204+8*Math.sin(a),8);break;
 case 'sorry':drop(c,224,107+10*Math.sin(a),12);drop(c,56,206+10*Math.sin(a),9);line(c,43,91,39,111,'#abb6ff',4);line(c,53,87,50,108,'#abb6ff',4);break;
 case 'shock':burst(c,m);line(c,233,72,230,90,gold,6);c.beginPath();c.arc(229,100,3,0,TAU);c.fillStyle=gold;c.fill();c.strokeStyle=ink;c.lineWidth=2;c.stroke();break;
 case 'stare':for(const s of [-1,1]){const x=135+s*101;line(c,x,133,x+s*13,128,aqua,3);line(c,x,144,x+s*18,144,aqua,3);line(c,x,155,x+s*13,160,aqua,3)}break;
 case 'tired':{for(let i=0;i<3;i++){const x=209+i*12,y=111-i*17+5*Math.sin(a+i),r=6+i; c.beginPath();c.moveTo(x-r,y-r);c.lineTo(x+r,y-r);c.lineTo(x-r,y+r);c.lineTo(x+r,y+r);stroke(c,'#b6d9ff',3)}break;}
 case 'jump':burst(c,m);star(c,43,198-10*Math.sin(a),10+3*pulse);star(c,225,204+10*Math.sin(a),11);drop(c,239,115+12*Math.sin(a),8);drop(c,32,162+9*Math.cos(a),7);break;
 }
 c.restore();
}
