export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function linearToDb(value, floorDb = -120) {
  if (!Number.isFinite(value) || value <= 0) return floorDb;
  return Math.max(floorDb, 20 * Math.log10(value));
}

export function peakAbs(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
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

export function vuToPercent(vu, minVu = -20, maxVu = 3) {
  return clamp(((vu - minVu) / (maxVu - minVu)) * 100, 0, 100);
}

export class PpmChannelModel {
  constructor({minDb = -60, clipDb = -0.5, attackMs = 10, releaseMs = 1500, holdMs = 1200, holdDecayDbPerSec = 18} = {}) {
    Object.assign(this, {minDb, clipDb, attackMs, releaseMs, holdMs, holdDecayDbPerSec});
    this.reset();
  }

  reset() {
    this.displayLinear = 0;
    this.displayDb = this.minDb;
    this.instantPeakDb = this.minDb;
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
    this.instantPeakDb = linearToDb(peak, this.minDb);
    const tau = peak > this.displayLinear ? this.attackMs : this.releaseMs;
    const alpha = tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dtMs) / tau);
    this.displayLinear += (peak - this.displayLinear) * alpha;
    if (this.displayLinear < 1e-9) this.displayLinear = 0;
    this.displayDb = linearToDb(this.displayLinear, this.minDb);

    if (this.instantPeakDb >= this.holdDb) {
      this.holdDb = this.instantPeakDb;
      this.holdUntilMs = nowMs + this.holdMs;
    } else if (nowMs > this.holdUntilMs) {
      this.holdDb = Math.max(this.displayDb, this.minDb, this.holdDb - this.holdDecayDbPerSec * (Math.max(0, dtMs) / 1000));
    }

    if (this.instantPeakDb >= this.clipDb) this.clipped = true;
    return this.snapshot();
  }

  snapshot() {
    return {
      displayDb: this.displayDb,
      instantPeakDb: this.instantPeakDb,
      holdDb: this.holdDb,
      clipped: this.clipped,
      displayPercent: dbToPercent(this.displayDb, this.minDb, 0),
      holdPercent: dbToPercent(this.holdDb, this.minDb, 0),
    };
  }
}

export class VuChannelModel {
  constructor({minDb = -60, referenceDb = -18, attackMs = 300, releaseMs = 600, minVu = -20, maxVu = 3} = {}) {
    Object.assign(this, {minDb, referenceDb, attackMs, releaseMs, minVu, maxVu});
    this.reset();
  }

  reset() {
    this.averageLinear = 0;
    this.averageDb = this.minDb;
    this.instantRmsDb = this.minDb;
    this.vu = this.minDb - this.referenceDb;
  }

  update(samples, dtMs) {
    const blockRms = rms(samples);
    this.instantRmsDb = linearToDb(blockRms, this.minDb);
    const tau = blockRms > this.averageLinear ? this.attackMs : this.releaseMs;
    const alpha = tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dtMs) / tau);
    this.averageLinear += (blockRms - this.averageLinear) * alpha;
    if (this.averageLinear < 1e-9) this.averageLinear = 0;
    this.averageDb = linearToDb(this.averageLinear, this.minDb);
    this.vu = this.averageDb - this.referenceDb;
    return this.snapshot();
  }

  snapshot() {
    return {
      averageDb: this.averageDb,
      instantRmsDb: this.instantRmsDb,
      vu: this.vu,
      percent: vuToPercent(this.vu, this.minVu, this.maxVu),
    };
  }
}

export class StereoPeakVuModel {
  constructor(options = {}) {
    this.leftPpm = new PpmChannelModel(options.ppm);
    this.rightPpm = new PpmChannelModel(options.ppm);
    this.leftVu = new VuChannelModel(options.vu);
    this.rightVu = new VuChannelModel(options.vu);
  }

  reset() {
    this.leftPpm.reset(); this.rightPpm.reset();
    this.leftVu.reset(); this.rightVu.reset();
  }

  resetPeaks(nowMs = 0) {
    this.leftPpm.resetPeak(nowMs);
    this.rightPpm.resetPeak(nowMs);
  }

  update(leftSamples, rightSamples, dtMs, nowMs) {
    const leftPpm = this.leftPpm.update(leftSamples, dtMs, nowMs);
    const rightPpm = this.rightPpm.update(rightSamples, dtMs, nowMs);
    const leftVu = this.leftVu.update(leftSamples, dtMs);
    const rightVu = this.rightVu.update(rightSamples, dtMs);
    return this.compose(leftPpm, rightPpm, leftVu, rightVu);
  }

  snapshot() {
    return this.compose(this.leftPpm.snapshot(), this.rightPpm.snapshot(), this.leftVu.snapshot(), this.rightVu.snapshot());
  }

  compose(leftPpm, rightPpm, leftVu, rightVu) {
    const channel = (ppm, vu) => ({
      ppm,
      vu,
      crestDb: clamp(ppm.instantPeakDb - vu.instantRmsDb, 0, 60),
    });
    return {left: channel(leftPpm, leftVu), right: channel(rightPpm, rightVu)};
  }
}
