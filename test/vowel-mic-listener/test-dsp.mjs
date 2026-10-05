import assert from 'node:assert/strict';
import { DEFAULT_VOWELS, classifyVowel, estimateFormants, summarizeCalibration } from './dsp.mjs';

function seededNoise(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return (s / 0x100000000) * 2 - 1;
  };
}

function resonator(input, fs, freq, bw) {
  const r = Math.exp(-Math.PI * bw / fs);
  const c = 2 * r * Math.cos(2 * Math.PI * freq / fs);
  const rr = r * r;
  const out = new Float64Array(input.length);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const y = input[i] + c * y1 - rr * y2;
    out[i] = y;
    y2 = y1;
    y1 = y;
  }
  return out;
}

function syntheticVowel(f1, f2, fs = 48000, seconds = 0.09, seed = 7) {
  const n = Math.floor(fs * seconds);
  const rand = seededNoise(seed);
  const source = new Float64Array(n);
  const period = Math.max(1, Math.round(fs / 130));
  for (let i = 0; i < n; i++) source[i] = (i % period === 0 ? 1 : 0) + 0.08 * rand();
  let y = resonator(source, fs, f1, 90);
  y = resonator(y, fs, f2, 120);
  y = resonator(y, fs, 3000, 180);
  let max = 0;
  for (const v of y) max = Math.max(max, Math.abs(v));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.2 * y[i] / Math.max(1e-9, max);
  return out;
}

for (const [key, ref] of Object.entries(DEFAULT_VOWELS)) {
  const frame = syntheticVowel(ref.f1, ref.f2, 48000, 0.09, key.charCodeAt(0));
  const est = estimateFormants(frame, 48000, { minRms: 0.001 });
  assert.equal(est.voiced, true, key + ': voiced');
  assert.ok(Number.isFinite(est.f1) && Number.isFinite(est.f2), key + ': formants detected');
  const got = classifyVowel(est.f1, est.f2);
  console.log(key, 'target', ref.f1, ref.f2, 'estimated', est.f1, est.f2, 'class', got?.key, 'q', est.quality.toFixed(2));
  assert.equal(got?.key, key, key + ': classifier');
}

const cal = summarizeCalibration([{f1:300,f2:2300},{f1:310,f2:2310},{f1:900,f2:8000}]);
assert.deepEqual(cal, {f1:310,f2:2310});
assert.equal(classifyVowel(NaN, 1000), null);
console.log('DSP tests passed');
