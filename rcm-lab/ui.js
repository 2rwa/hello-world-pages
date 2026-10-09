export function makeKeyboard(noteDown,noteUp){
 const host=document.getElementById('keyboard');
 const keyEls=new Map(),black=new Set([1,3,6,8,10]),names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
 let whiteCount=0;const blackEls=[];
 const noteName=n=>names[n%12]+(Math.floor(n/12)-1);
 for(let n=48;n<72;n++){
  const b=document.createElement('button'),isBlack=black.has(n%12);
  b.type='button';b.setAttribute('aria-label',noteName(n));b.className=isBlack?'black-key':'white-key';
  if(isBlack){b.style.left=(8+whiteCount*52-16)+'px';blackEls.push(b)}
  else{if(n%12===0||n%12===5){const s=document.createElement('span');s.textContent=noteName(n);b.append(s)}host.append(b);whiteCount++}
  keyEls.set(n,b);
  const activePointers=new Map();
  b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();const src='pointer:'+n+':'+e.pointerId;activePointers.set(e.pointerId,src);b.setPointerCapture(e.pointerId);noteDown(n,src)});
  const release=e=>{const src=activePointers.get(e.pointerId);if(src){activePointers.delete(e.pointerId);noteUp(src)}};
  b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
 }
 for(const b of blackEls)host.append(b);
 host.style.width=whiteCount*52+16+'px';
 const mapping='awsedftgyhuj'.split(''),pressed=new Map();
 window.addEventListener('keydown',e=>{
  if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName))return;
  const idx=mapping.indexOf(e.key.toLowerCase());if(idx<0)return;
  e.preventDefault();const src='key:'+e.code;pressed.set(src,60+idx);noteDown(60+idx,src);
 });
 window.addEventListener('keyup',e=>{const src='key:'+e.code;if(pressed.has(src)){pressed.delete(src);noteUp(src)}});
 return {setPressed:(n,yes)=>keyEls.get(n)?.classList.toggle('pressed',yes),clear:()=>{for(const b of keyEls.values())b.classList.remove('pressed');pressed.clear()},noteName};
}
export function runScope(getAnalyser){
 const canvas=document.getElementById('scope'),c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 function frame(){
  requestAnimationFrame(frame);c.clearRect(0,0,w,h);c.strokeStyle='#29465f';c.lineWidth=1;
  for(let i=1;i<5;i++){const y=h*i/5;c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}
  const analyser=getAnalyser();if(!analyser)return;
  const data=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(data);
  c.beginPath();c.strokeStyle='#70dae0';c.lineWidth=2.4;c.shadowColor='#48e4f6';c.shadowBlur=7;
  for(let x=0;x<w;x++){const y=data[Math.floor(x*data.length/w)]/255*h;if(!x)c.moveTo(x,y);else c.lineTo(x,y)}
  c.stroke();c.shadowBlur=0;
 }
 requestAnimationFrame(frame);
}
