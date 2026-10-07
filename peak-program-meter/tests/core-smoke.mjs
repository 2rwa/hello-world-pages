import {PeakProgramMeterModel, dbToPercent, linearToDb, peakAbs, rms} from "../meter-core.mjs";

const ok = (value, message) => { if (!value) throw new Error(message); };
const near = (a, b, epsilon, message) => ok(Math.abs(a - b) <= epsilon, `${message}: ${a} vs ${b}`);

near(linearToDb(1), 0, 1e-9, "full-scale dB");
near(linearToDb(0.5), -6.020599913, 1e-6, "half-scale dB");
near(peakAbs(new Float32Array([-.1, .6, -.4])), .6, 1e-6, "absolute peak");
near(rms(new Float32Array([1, -1, 1, -1])), 1, 1e-9, "rms");
near(dbToPercent(-30), 50, 1e-9, "meter percent");

const meter = new PeakProgramMeterModel({attackMs: 0, releaseMs: 1500, holdMs: 100});
let s = meter.update(new Float32Array([0, .5, -.5]), 16, 0);
ok(s.displayDb > -6.1 && s.displayDb < -6.0, "fast attack reaches target");
ok(s.holdDb > -6.1 && s.holdDb < -6.0, "hold captures peak");
s = meter.update(new Float32Array(8), 16, 16);
ok(s.displayDb > -60, "release is not instantaneous");
meter.update(new Float32Array([1]), 16, 32);
ok(meter.clipped, "clip latch");
meter.resetPeak(40);
ok(!meter.clipped, "clip reset");

console.log(JSON.stringify({status:"ok", checks:["dbfs","peak","rms","attack-release","hold","clip"]}));
