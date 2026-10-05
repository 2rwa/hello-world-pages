export const DEFAULT_VOWELS = {
  a: { label: 'あ', ipa: '/a/', f1: 760, f2: 1180 },
  i: { label: 'い', ipa: '/i/', f1: 300, f2: 2350 },
  u: { label: 'う', ipa: '/ɯ/', f1: 350, f2: 1450 },
  e: { label: 'え', ipa: '/e/', f1: 470, f2: 2050 },
  o: { label: 'お', ipa: '/o/', f1: 500, f2: 900 },
};

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function rms(samples) {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / Math.max(1, samples.length));
}

export function bark(hz) {
  return 13 * Math.atan(0.00076 * hz) + 3.5 * Math.atan((hz / 7500) ** 2);
}

function median(values) {
  if (!values.length) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length & 1 ? a[m] : (a[m - 1] + a[m]) * 0.5;
}

export function summarizeCalibration(samples) {
  const valid = samples.filter(x => Number.isFinite(x.f1) && Number.isFinite(x.f2));
  if (!valid.length) return null;
  return { f1: median(valid.map(x => x.f1)), f2: median(valid.map(x => x.f2)) };
}

export function classifyVowel(f1, f2, references = DEFAULT_VOWELS) {
  if (!Number.isFinite(f1) || !Number.isFinite(f2)) return null;
  const p1 = bark(f1), p2 = bark(f2);
  const rows = Object.entries(references).map(([key, ref]) => {
    const d1 = (p1 - bark(ref.f1)) / 1.0;
    const d2 = (p2 - bark(ref.f2)) / 1.6;
    return { key, ref, distance: Math.hypot(d1, d2) };
  }).sort((a, b) => a.distance - b.distance);
  const best = rows[0], second = rows[1];
  const absolute = Math.exp(-0.5 * best.distance * best.distance);
  const margin = second ? clamp((second.distance - best.distance) / Math.max(0.25, second.distance), 0, 1) : 1;
  const confidence = clamp(100 * (0.62 * absolute + 0.38 * margin), 0, 100);
  return { key: best.key, label: best.ref.label, ipa: best.ref.ipa, confidence, distance: best.distance, candidates: rows };
}

function resampleLinear(input, sourceRate, targetRate, durationSec = 0.07) {
  const sourceCount = Math.min(input.length, Math.max(32, Math.floor(sourceRate * durationSec)));
  const start = input.length - sourceCount;
  const outCount = Math.max(32, Math.floor(sourceCount * targetRate / sourceRate));
  const out = new Float64Array(outCount);
  const scale = (sourceCount - 1) / Math.max(1, outCount - 1);
  for (let i = 0; i < outCount; i++) {
    const p = i * scale;
    const j = Math.floor(p);
    const frac = p - j;
    const a = input[start + j];
    const b = input[start + Math.min(sourceCount - 1, j + 1)];
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function preprocess(samples, preemphasis = 0.97) {
  const n = samples.length;
  const out = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= Math.max(1, n);
  let prev = samples[0] - mean;
  for (let i = 0; i < n; i++) {
    const x = samples[i] - mean;
    const y = i === 0 ? x : x - preemphasis * prev;
    prev = x;
    const w = n <= 1 ? 1 : 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    out[i] = y * w;
  }
  return out;
}

function autocorrelation(x, order) {
  const r = new Float64Array(order + 1);
  for (let lag = 0; lag <= order; lag++) {
    let s = 0;
    for (let i = lag; i < x.length; i++) s += x[i] * x[i - lag];
    r[lag] = s;
  }
  return r;
}

export function levinsonDurbin(r, order) {
  const a = new Float64Array(order + 1);
  a[0] = 1;
  let error = Math.max(1e-12, r[0]);
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = clamp(-acc / error, -0.999, 0.999);
    const next = a.slice();
    next[i] = k;
    for (let j = 1; j < i; j++) next[j] = a[j] + k * a[i - j];
    a.set(next);
    error *= Math.max(1e-6, 1 - k * k);
  }
  return { a, error };
}

function lpcEnvelope(a, sampleRate, minHz, maxHz, stepHz) {
  const bins = [];
  for (let f = minHz; f <= maxHz; f += stepHz) {
    const w = 2 * Math.PI * f / sampleRate;
    let re = 0, im = 0;
    for (let k = 0; k < a.length; k++) {
      re += a[k] * Math.cos(w * k);
      im -= a[k] * Math.sin(w * k);
    }
    const mag = 1 / Math.sqrt(re * re + im * im + 1e-12);
    bins.push({ f, db: 20 * Math.log10(mag + 1e-12) });
  }
  const smoothed = bins.map((b, i) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(bins.length - 1, i + 2); j++) { s += bins[j].db; c++; }
    return { f: b.f, db: s / c };
  });
  return smoothed;
}

function peakProminence(env, i, radius = 10) {
  let left = env[i].db, right = env[i].db;
  for (let j = Math.max(0, i - radius); j < i; j++) left = Math.min(left, env[j].db);
  for (let j = i + 1; j <= Math.min(env.length - 1, i + radius); j++) right = Math.min(right, env[j].db);
  return env[i].db - Math.max(left, right);
}

function findPeaks(env) {
  const peaks = [];
  for (let i = 2; i < env.length - 2; i++) {
    const y = env[i].db;
    if (y > env[i - 1].db && y >= env[i + 1].db) {
      const prominence = peakProminence(env, i, 12);
      if (prominence >= 0.35) peaks.push({ f: env[i].f, db: y, prominence });
    }
  }
  return peaks;
}

export function estimateFormants(inputSamples, sourceRate, options = {}) {
  const targetRate = options.targetRate ?? 12000;
  const inputRms = rms(inputSamples);
  const minRms = options.minRms ?? 0.008;
  if (!Number.isFinite(inputRms) || inputRms < minRms) return { voiced: false, rms: inputRms };

  const resampled = resampleLinear(inputSamples, sourceRate, targetRate, options.durationSec ?? 0.07);
  const x = preprocess(resampled, options.preemphasis ?? 0.97);
  const order = options.order ?? 16;
  const r = autocorrelation(x, order);
  if (r[0] < 1e-9) return { voiced: false, rms: inputRms };
  const { a, error } = levinsonDurbin(r, order);
  const env = lpcEnvelope(a, targetRate, 180, 3600, 10);
  const peaks = findPeaks(env);

  const f1Candidates = peaks.filter(p => p.f >= 220 && p.f <= 1100);
  let f1Peak = f1Candidates[0] ?? null;
  if (f1Candidates.length > 1) {
    const strongest = [...f1Candidates].sort((a, b) => (b.prominence + 0.06 * b.db) - (a.prominence + 0.06 * a.db))[0];
    if (strongest.f < 850 || !f1Peak) f1Peak = strongest;
  }
  if (!f1Peak) return { voiced: true, rms: inputRms, f1: null, f2: null, peaks, envelope: env, quality: 0 };

  const f2Candidates = peaks.filter(p => p.f >= Math.max(650, f1Peak.f + 300) && p.f <= 3300);
  let f2Peak = f2Candidates[0] ?? null;
  if (f2Candidates.length > 1) {
    const first = f2Candidates[0];
    const strongest = [...f2Candidates].sort((a, b) => (b.prominence + 0.04 * b.db) - (a.prominence + 0.04 * a.db))[0];
    f2Peak = (strongest.prominence > first.prominence * 1.8 && strongest.f - first.f < 900) ? strongest : first;
  }
  if (!f2Peak) return { voiced: true, rms: inputRms, f1: f1Peak.f, f2: null, peaks, envelope: env, quality: 0.2 };

  const q1 = clamp(f1Peak.prominence / 5, 0, 1);
  const q2 = clamp(f2Peak.prominence / 5, 0, 1);
  const stability = clamp(1 - error / Math.max(1e-9, r[0]), 0, 1);
  const quality = clamp(0.4 * q1 + 0.4 * q2 + 0.2 * stability, 0, 1);
  return { voiced: true, rms: inputRms, f1: f1Peak.f, f2: f2Peak.f, peaks, envelope: env, quality };
}
