import {Game,W,H} from './game.js';
import {Metaballs,drawFallback} from './metaballs.js';
import {ground,actors} from './render.js';
const $=id=>document.getElementById(id);
const viewport=$('viewport'),bg=$('ground').getContext('2d'),fg=$('actors').getContext('2d');
const game=new Game();
let metaballs=null,glError=null;
try{metaballs=new Metaballs($('goo'))}catch(e){glError=String(e);console.error('Metaballs fallback:',e)}
const hasGL=!!metaballs?.available;
if(!hasGL)console.warn('WebGL2 unavailable; Canvas2D liquid fallback in use',glError);
const ui={score:$('score'),wave:$('wave'),best:$('best'),health:$('health'),power:$('power'),combo:$('combo'),bomb:$('bomb'),bombCount:$('bomb-count'),overlay:$('overlay'),start:$('start'),toast:$('toast'),pause:$('pause')};
function showOverlay(title='LIQUID STRIKE',message='流体生命体、接近。',button='▶ MISSION START'){
 ui.overlay.classList.remove('hidden');
 ui.overlay.querySelector('h1').innerHTML=title;
 ui.overlay.querySelector('.lead').textContent=message;
 ui.start.textContent=button;
}
function begin(){game.start();ui.overlay.classList.add('hidden');game.pointer=null}
ui.start.addEventListener('click',()=>{if(game.status==='paused')togglePause();else begin()});
ui.bomb.addEventListener('click',e=>{e.stopPropagation();game.useBomb()});
ui.pause.addEventListener('click',e=>{e.stopPropagation();togglePause()});
function togglePause(){
 if(game.status==='running'){game.pause();showOverlay('PAUSED','P または下のボタンで再開','▶ RESUME')}
 else if(game.status==='paused'){game.pause();ui.overlay.classList.add('hidden')}
}

function point(e){const r=viewport.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}}
viewport.addEventListener('pointerdown',e=>{
 if(game.status!=='running'||e.target.closest('button'))return;
 game.pointer=point(e);viewport.setPointerCapture?.(e.pointerId);e.preventDefault();
});
viewport.addEventListener('pointermove',e=>{
 if(game.status!=='running')return;
 if(e.pointerType==='mouse'||e.buttons||e.pressure>0)game.pointer=point(e);
});
viewport.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')game.pointer=null});
viewport.addEventListener('pointercancel',()=>{game.pointer=null});
viewport.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')game.pointer=null});
window.addEventListener('keydown',e=>{
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
 if(e.code==='KeyP'||e.code==='Escape'){if(!e.repeat)togglePause();return}
 if((e.code==='ShiftLeft'||e.code==='ShiftRight'||e.code==='KeyB')&&!e.repeat)game.useBomb();
 if((e.code==='Enter'||e.code==='Space')&&game.status==='title'){begin();return}
 if((e.code==='Enter'||e.code==='Space')&&game.status==='over'){begin();return}
 if((e.code==='Enter'||e.code==='Space')&&game.status==='paused'){togglePause();return}
 game.keys.add(e.code);
});
window.addEventListener('keyup',e=>game.keys.delete(e.code));
window.addEventListener('blur',()=>game.keys.clear());
let last=performance.now(),toastTime=0,finished=false;
function frame(now){
 const dt=Math.min(.05,(now-last)/1000||0);last=now;
 game.update(dt);
 ground(bg,game);
 try{metaballs?.draw(game)}catch(e){glError=String(e);console.error('WebGL metaball render error',e);metaballs=null}
 actors(fg,game,metaballs?.available?null:drawFallback);
 for(const evt of game.events.splice(0)){
  if(evt.type==='wave'){ui.toast.textContent=game.wave%4===0?'⚠ CORE MUTATION / BOSS WAVE':'WAVE '+String(game.wave).padStart(2,'0');toastTime=1.6}
  if(evt.type==='bomb'){ui.toast.textContent='SHOCKWAVE';toastTime=.45}
  if(evt.type==='pickup'){ui.toast.textContent='POWER UP';toastTime=.75}
  if(evt.type==='over'&&!finished){finished=true;showOverlay('MISSION<br><i>FAILED</i>','SCORE '+game.score.toLocaleString()+'  /  WAVE '+game.wave,'↻ RETRY')}
 }
 if(game.status==='running')finished=false;
 toastTime=Math.max(0,toastTime-dt);ui.toast.style.opacity=String(Math.min(1,toastTime*2));
 ui.score.textContent=String(game.score).padStart(6,'0');
 ui.wave.textContent=String(game.wave).padStart(2,'0');
 ui.best.textContent=String(Math.max(game.best,game.score)).padStart(6,'0');
 ui.health.textContent='◆ '.repeat(game.player.hp).trim()||'EMPTY';
 ui.power.textContent='WEAPON LV.'+game.player.power;
 ui.combo.textContent='× '+game.multiplier;
 ui.bombCount.textContent='× '+game.bombs;ui.bomb.disabled=game.bombs===0||game.status!=='running';
 ui.pause.textContent=game.status==='paused'?'▶':'Ⅱ';
 requestAnimationFrame(frame);
}
window.__liquidStrike={game,get debug(){return {...game.debug,gl:!!metaballs?.available,blobCount:metaballs?.lastCount||0,glError}},start:begin,pause:togglePause,bomb:()=>game.useBomb()};
requestAnimationFrame(frame);