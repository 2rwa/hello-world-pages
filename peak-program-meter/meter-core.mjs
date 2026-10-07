export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function linearToDb(value, floorDb = -120) {
  if (!Number.isFinite(value) || value <= 0) return floorDb;
  return Math.max(floorDb, 20 * Math.log10(value));
}

export function peakAbs(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function dbToPercent(db, minDb = -60, maxDb = 0) {
  return clamp(((db - minDb) / (maxDb - minDb)) * 100, 0, 100);
}

export class PeakProgramMeterModel {
  constructor({
    minDb = -60,
    clipDb = -0.5,
    attackMs = 10,
    releaseMs = 1500,
    holdMs = 1200,
    holdDecayDbPerSec = 18,
  } = {}) {
    this.minDb = minDb;
    this.clipDb = clipDb;
    this.attackMs = attackMs;
    this.releaseMs = releaseMs;
    this.holdMs = holdMs;
    this.holdDecayDbPerSec = holdDecayDbPerSec;
    this.reset();
  }

  reset() {
    this.displayLinear = 0;
    this.displayDb = this.minDb;
    this.instantPeakDb = this.minDb;
    this.rmsDb = this.minDb;
    this.holdDb = this.minDb;
    this.holdUntilMs = 0;
    this.clipped = false;
  }

  resetPeak(nowMs = 0) {
    this.holdDb = this.displayDb;
    this.holdUntilMs = nowMs + this.holdMs;
    this.clipped = false;
  }

  update(samples, dtMs, nowMs) {
    const peak = peakAbs(samples);
    const rmsValue = rms(samples);
    this.instantPeakDb = linearToDb(peak, this.minDb);
    this.rmsDb = linearToDb(rmsValue, this.minDb);

    const tau = peak > this.displayLinear ? this.attackMs : this.releaseMs;
    const alpha = tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dtMs) / tau);
    this.displayLinear += (peak - this.displayLinear) * alpha;
    if (this.displayLinear < 1e-9) this.displayLinear = 0;
    this.displayDb = linearToDb(this.displayLinear, this.minDb);

    if (this.instantPeakDb >= this.holdDb) {
      this.holdDb = this.instantPeakDb;
      this.holdUntilMs = nowMs + this.holdMs;
    } else if (nowMs > this.holdUntilMs) {
      const decay = this.holdDecayDbPerSec * (Math.max(0, dtMs) / 1000);
      this.holdDb = Math.max(this.displayDb, this.minDb, this.holdDb - decay);
    }

    if (this.instantPeakDb >= this.clipDb) this.clipped = true;

    return this.snapshot();
  }

  snapshot() {
    return {
      displayDb: this.displayDb,
      instantPeakDb: this.instantPeakDb,
      rmsDb: this.rmsDb,
      holdDb: this.holdDb,
      clipped: this.clipped,
      displayPercent: dbToPercent(this.displayDb, this.minDb, 0),
      holdPercent: dbToPercent(this.holdDb, this.minDb, 0),
    };
  }
}
