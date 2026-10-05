import { DEFAULT_VOWELS, classifyVowel, estimateFormants, summarizeCalibration, clamp } from './dsp.mjs';
import { drawVowelMap } from './plot.mjs';

const $ = id => document.getElementById(id);
const els = {
  micBtn: $('micBtn'), clearBtn: $('clearBtn'), kana: $('kana'), ipa: $('ipa'), confidence: $('confidence'),
  f1: $('f1'), f2: $('f2'), quality: $('quality'), level: $('level'), levelBar: $('levelBar'), status: $('status'),
  canvas: $('vowelMap'), calGrid: $('calGrid'), calInfo: $('calInfo'), refs: $('refs'), resetCalBtn: $('resetCalBtn'),
  threshold: $('threshold'), thresholdOut: $('thresholdOut'),
};

let audioContext = null, analyser = null, stream = null, rafId = 0, running = false;
let timeData = null, lastAnalysisAt = 0, smoothF1 = null, smoothF2 = null;
let refs = loadRefs();
let trail = [];
let votes = [];
let calibration = null;

function cloneDefaults() {
  return Object.fromEntries(Object.entries(DEFAULT_VOWELS).map(([k, v]) => [k, { ...v }]));
}

function loadRefs() {
  try {
    const saved = JSON.parse(localStorage.getItem('vowel-listener-refs-v1') || 'null');
    if (!saved) return cloneDefaults();
    const out = cloneDefaults();
    for (const key of Object.keys(out)) {
      if (Number.isFinite(saved[key]?.f1) && Number.isFinite(saved[key]?.f2)) {
        out[key].f1 = saved[key].f1;
        out[key].f2 = saved[key].f2;
      }
    }
    return out;
  } catch { return cloneDefaults(); }
}

function saveRefs() {
  try {
    localStorage.setItem('vowel-listener-refs-v1', JSON.stringify(refs));
  } catch {}
}

function renderRefs() {
  els.refs.replaceChildren(...Object.entries(refs).map(([key, ref]) => {
    const div = document.createElement('div');
    div.className = 'ref';
    div.innerHTML = '<b>' + ref.label + ' ' + ref.ipa + '</b>F1 ' + Math.round(ref.f1) + '<br>F2 ' + Math.round(ref.f2);
    return div;
  }));
}

function setStatus(html) { els.status.innerHTML = html; }

async function startMic() {
  if (running) return stopMic();
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('<strong>このブラウザではマイクAPIを利用できません。</strong> HTTPS上のSafari/Chrome等で開いてください。');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1,
    }});
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    timeData = new Float32Array(analyser.fftSize);
    running = true;
    els.micBtn.textContent = 'マイクを停止';
    els.micBtn.classList.remove('primary');
    els.micBtn.classList.add('stop');
    els.clearBtn.disabled = false;
    for (const b of els.calGrid.querySelectorAll('button')) b.disabled = false;
    setStatus('<strong>入力中</strong> · sample rate ' + audioContext.sampleRate.toLocaleString() + ' Hz · 母音を発音してください。');
    rafId = requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    setStatus('<strong>マイクを開始できませんでした。</strong> ' + escapeHtml(err?.message || String(err)));
  }
}

function stopMic() {
  running = false;
  cancelAnimationFrame(rafId);
  stream?.getTracks().forEach(t => t.stop());
  audioContext?.close().catch(() => {});
  stream = analyser = audioContext = timeData = null;
  calibration = null;
  els.micBtn.textContent = 'マイクを開始';
  els.micBtn.classList.add('primary');
  els.micBtn.classList.remove('stop');
  for (const b of els.calGrid.querySelectorAll('button')) { b.disabled = true; b.classList.remove('recording'); }
  setStatus('停止しました。再開すると続けて判定できます。');
}

function loop(t) {
  if (!running || !analyser || !timeData) return;
  rafId = requestAnimationFrame(loop);
  if (t - lastAnalysisAt < 70) return;
  lastAnalysisAt = t;
  analyser.getFloatTimeDomainData(timeData);
  const result = estimateFormants(timeData, audioContext.sampleRate, { minRms: Number(els.threshold.value) });
  updateLevel(result.rms || 0);
  if (!result.voiced || !Number.isFinite(result.f1) || !Number.isFinite(result.f2)) {
    softenNoDetection(result.voiced ? 'フォルマントを安定して拾えません' : '声を待っています');
    return;
  }

  const alpha = 0.38;
  smoothF1 = smoothF1 == null ? result.f1 : smoothF1 + alpha * (result.f1 - smoothF1);
  smoothF2 = smoothF2 == null ? result.f2 : smoothF2 + alpha * (result.f2 - smoothF2);
  const classification = classifyVowel(smoothF1, smoothF2, refs);
  const plausible = smoothF1 >= 200 && smoothF1 <= 1200 && smoothF2 >= 650 && smoothF2 <= 3400 && smoothF2 > smoothF1 + 220;
  if (!classification || !plausible) {
    softenNoDetection('母音らしいF1/F2を待っています');
    return;
  }

  votes.push(classification.key);
  if (votes.length > 7) votes.shift();
  const stable = stableVote(votes);
  const shown = refs[stable] ? { ...classification, key: stable, label: refs[stable].label, ipa: refs[stable].ipa } : classification;
  const conf = stable === classification.key ? classification.confidence : classification.confidence * 0.72;
  renderDetection(shown, smoothF1, smoothF2, result.quality, conf);

  trail.push({ f1: smoothF1, f2: smoothF2, t: performance.now() });
  if (trail.length > 90) trail.shift();
  drawMap();
  collectCalibration(smoothF1, smoothF2);
}

function stableVote(arr) {
  const counts = new Map();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || arr.at(-1);
}

function renderDetection(c, f1, f2, q, conf) {
  els.kana.textContent = c.label;
  els.ipa.textContent = c.ipa;
  els.confidence.textContent = '判定確度 ' + Math.round(conf) + '%';
  els.f1.textContent = Math.round(f1);
  els.f2.textContent = Math.round(f2);
  els.quality.textContent = Math.round(q * 100) + '%';
}

function softenNoDetection(message) {
  els.kana.textContent = '—'; els.ipa.textContent = '/—/'; els.confidence.textContent = message;
  els.f1.textContent = '—'; els.f2.textContent = '—'; els.quality.textContent = '—';
  votes.length = 0;
}

function updateLevel(v) {
  const db = v > 0 ? 20 * Math.log10(v) : -80;
  els.level.textContent = Math.round(db) + ' dB';
  els.levelBar.style.width = clamp((db + 60) / 55 * 100, 0, 100) + '%';
}

function beginCalibration(key, button) {
  if (!running || calibration) return;
  calibration = { key, samples: [], endsAt: performance.now() + 1400, button };
  button.classList.add('recording');
  els.calInfo.textContent = refs[key].label + ' ' + refs[key].ipa + ' をそのまま伸ばして発音…';
}

function collectCalibration(f1, f2) {
  if (!calibration) return;
  calibration.samples.push({ f1, f2 });
  if (performance.now() < calibration.endsAt) return;
  const { key, samples, button } = calibration;
  const summary = summarizeCalibration(samples);
  button.classList.remove('recording');
  if (summary && samples.length >= 5) {
    refs[key].f1 = Math.round(summary.f1);
    refs[key].f2 = Math.round(summary.f2);
    saveRefs(); renderRefs(); drawMap();
    els.calInfo.textContent = refs[key].label + ' を登録しました: F1 ' + refs[key].f1 + ' Hz / F2 ' + refs[key].f2 + ' Hz（' + samples.length + ' frames）';
  } else {
    els.calInfo.textContent = '登録に必要な安定した母音が取れませんでした。少し大きめに、一定の声で再試行してください。';
  }
  calibration = null;
}

function drawMap() {
  drawVowelMap(els.canvas, refs, trail);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

els.micBtn.addEventListener('click', startMic);
els.clearBtn.addEventListener('click', () => { trail = []; drawMap(); });
els.calGrid.addEventListener('click', e => {
  const b = e.target.closest('button[data-vowel]');
  if (b) beginCalibration(b.dataset.vowel, b);
});
els.resetCalBtn.addEventListener('click', () => {
  refs = cloneDefaults(); saveRefs(); renderRefs(); drawMap();
  els.calInfo.textContent = '初期の日本語5母音基準へ戻しました。';
});
els.threshold.addEventListener('input', () => { els.thresholdOut.textContent = Number(els.threshold.value).toFixed(3); });
window.addEventListener('resize', drawMap);
window.addEventListener('pagehide', () => { if (running) stopMic(); });

renderRefs();
drawMap();

if (new URLSearchParams(location.search).has('selftest')) {
  const report = {};
  try {
    report.initialKana = els.kana.textContent === '—';
    report.calibrationDisabled = [...els.calGrid.querySelectorAll('button')].every(b => b.disabled);
    els.threshold.value = '0.012';
    els.threshold.dispatchEvent(new Event('input', { bubbles: true }));
    report.thresholdUpdates = els.thresholdOut.textContent === '0.012';
    els.resetCalBtn.click();
    report.refsRendered = els.refs.children.length === 5;
    report.canvasReady = els.canvas.width > 0 && els.canvas.height > 0;
  } catch (err) {
    report.error = String(err?.stack || err);
  }
  const pass = Object.values(report).every(Boolean);
  document.documentElement.dataset.selftest = pass ? 'pass' : 'fail';
  const pre = document.createElement('pre');
  pre.id = 'selftest';
  pre.hidden = true;
  pre.textContent = JSON.stringify(report);
  document.body.append(pre);
}
