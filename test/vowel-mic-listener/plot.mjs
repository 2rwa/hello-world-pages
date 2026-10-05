const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function mapPoint(f1, f2, w, h) {
  const padL = 54, padR = 26, padT = 38, padB = 44;
  const x = padL + clamp((2700 - f2) / 2000, 0, 1) * (w - padL - padR);
  const y = padT + clamp((f1 - 200) / 700, 0, 1) * (h - padT - padB);
  return { x, y };
}

export function drawVowelMap(canvas, refs, trail) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(320, Math.round(rect.width * dpr));
  const h = Math.max(260, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#11110d'; ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = dpr; ctx.strokeStyle = '#343329'; ctx.fillStyle = '#8e8977'; ctx.font = (11*dpr) + 'px system-ui';
  for (const f2 of [2500, 2000, 1500, 1000]) {
    const p = mapPoint(500, f2, w, h); ctx.beginPath(); ctx.moveTo(p.x, 30*dpr); ctx.lineTo(p.x, h-36*dpr); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText(String(f2), p.x, h-16*dpr);
  }
  for (const f1 of [300, 500, 700, 900]) {
    const p = mapPoint(f1, 1500, w, h); ctx.beginPath(); ctx.moveTo(46*dpr, p.y); ctx.lineTo(w-18*dpr, p.y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(String(f1), 40*dpr, p.y+4*dpr);
  }
  ctx.fillStyle = '#aaa590'; ctx.textAlign = 'center'; ctx.fillText('F2 (Hz)', w/2, h-2*dpr);
  ctx.save(); ctx.translate(11*dpr, h/2); ctx.rotate(-Math.PI/2); ctx.fillText('F1 (Hz)', 0, 0); ctx.restore();

  const palette = { a:'#e0a56a', i:'#a6d58d', u:'#d7c56d', e:'#88c6ba', o:'#d99486' };
  for (const [key, ref] of Object.entries(refs)) {
    const p = mapPoint(ref.f1, ref.f2, w, h);
    ctx.beginPath(); ctx.arc(p.x, p.y, 11*dpr, 0, Math.PI*2); ctx.fillStyle = palette[key]; ctx.globalAlpha = .92; ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#151510'; ctx.textAlign = 'center'; ctx.font = '700 ' + (12*dpr) + 'px system-ui'; ctx.fillText(ref.label, p.x, p.y+4*dpr);
  }
  if (trail.length > 1) {
    ctx.beginPath();
    trail.forEach((v, i) => { const p = mapPoint(v.f1, v.f2, w, h); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.strokeStyle = '#f4edd8'; ctx.globalAlpha = .42; ctx.lineWidth = 2*dpr; ctx.stroke(); ctx.globalAlpha = 1;
  }
  const last = trail.at(-1);
  if (last) {
    const p = mapPoint(last.f1, last.f2, w, h);
    ctx.beginPath(); ctx.arc(p.x, p.y, 7*dpr, 0, Math.PI*2); ctx.fillStyle = '#f7f2df'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, 12*dpr, 0, Math.PI*2); ctx.strokeStyle = '#d8b55d'; ctx.lineWidth = 2*dpr; ctx.stroke();
  }
}
