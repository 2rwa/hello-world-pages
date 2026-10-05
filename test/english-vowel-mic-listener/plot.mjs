const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
function mapPoint(f1,f2,w,h){
  const L=62,R=28,T=42,B=48;
  return{
    x:L+clamp((2900-f2)/2200,0,1)*(w-L-R),
    y:T+clamp((f1-250)/800,0,1)*(h-T-B)
  };
}
export function drawVowelMap(canvas,refs,trail,currentKey=''){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
  const w=Math.max(320,Math.round(rect.width*dpr)),h=Math.max(300,Math.round(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  const c=canvas.getContext('2d');c.clearRect(0,0,w,h);c.fillStyle='#10110f';c.fillRect(0,0,w,h);
  c.strokeStyle='#34372f';c.lineWidth=dpr;c.fillStyle='#90958a';c.font=(11*dpr)+'px system-ui';
  for(const f2 of [2800,2400,2000,1600,1200,800]){
    const p=mapPoint(600,f2,w,h);c.beginPath();c.moveTo(p.x,32*dpr);c.lineTo(p.x,h-38*dpr);c.stroke();
    c.textAlign='center';c.fillText(String(f2),p.x,h-16*dpr);
  }
  for(const f1 of [300,500,700,900]){
    const p=mapPoint(f1,1600,w,h);c.beginPath();c.moveTo(50*dpr,p.y);c.lineTo(w-18*dpr,p.y);c.stroke();
    c.textAlign='right';c.fillText(String(f1),44*dpr,p.y+4*dpr);
  }
  c.fillStyle='#a9afa1';c.textAlign='center';c.fillText('F2 (Hz)',w/2,h-2*dpr);
  c.save();c.translate(12*dpr,h/2);c.rotate(-Math.PI/2);c.fillText('F1 (Hz)',0,0);c.restore();

  const palette=['#d4a96a','#8dc4b8','#d58979','#a7cb88','#c8b66a','#99aacd','#cf8caf','#8fb7d6','#d4bd8c','#89c896','#cf9d72','#b69bd6'];
  let idx=0;
  for(const [key,ref] of Object.entries(refs)){
    const p=mapPoint(ref.f1,ref.f2,w,h),active=key===currentKey;
    c.beginPath();c.arc(p.x,p.y,(active?15:11)*dpr,0,Math.PI*2);c.fillStyle=palette[idx++%palette.length];
    c.globalAlpha=active?1:.82;c.fill();c.globalAlpha=1;
    if(active){c.strokeStyle='#fff4cf';c.lineWidth=2*dpr;c.stroke()}
    c.fillStyle='#12130f';c.font='700 '+(10*dpr)+'px system-ui';c.textAlign='center';c.fillText(ref.label,p.x,p.y+3.5*dpr);
  }
  if(trail.length>1){
    c.beginPath();trail.forEach((v,i)=>{const p=mapPoint(v.f1,v.f2,w,h);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)});
    c.strokeStyle='#f5eed7';c.globalAlpha=.42;c.lineWidth=2*dpr;c.stroke();c.globalAlpha=1;
  }
  const last=trail.at(-1);
  if(last){
    const p=mapPoint(last.f1,last.f2,w,h);c.beginPath();c.arc(p.x,p.y,6*dpr,0,Math.PI*2);c.fillStyle='#fff7df';c.fill();
    c.beginPath();c.arc(p.x,p.y,11*dpr,0,Math.PI*2);c.strokeStyle='#d9b65f';c.lineWidth=2*dpr;c.stroke();
  }
}
