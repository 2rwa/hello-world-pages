import {StereoPeakVuModel, PpmChannelModel, VuChannelModel, linearToDb, rms} from "../meter-core.mjs";

const ok = (v, m) => { if (!v) throw new Error(m); };
const near = (a, b, eps, m) => ok(Math.abs(a - b) <= eps, `${m}: ${a} vs ${b}`);
near(linearToDb(.5), -6.020599913, 1e-6, "half-scale dBFS");
near(rms(new Float32Array([.5, -.5, .5, -.5])), .5, 1e-6, "RMS math");

const stereo = new StereoPeakVuModel({ppm:{attackMs:0},vu:{attackMs:0,releaseMs:0}});
let snap = stereo.update(new Float32Array([.5,-.5]), new Float32Array([.25,-.25]), 16, 100);
ok(snap.left.ppm.instantPeakDb > snap.right.ppm.instantPeakDb + 5.9, "stereo peak separation");
ok(snap.left.vu.averageDb > snap.right.vu.averageDb + 5.9, "stereo average separation");

snap = stereo.update(new Float32Array([1,0]), new Float32Array([.2,0]), 16, 116);
ok(snap.left.ppm.clipped, "left clip latch");
ok(!snap.right.ppm.clipped, "right should not clip");
stereo.resetPeaks(120);
ok(!stereo.snapshot().left.ppm.clipped, "clip reset");

const ppm = new PpmChannelModel({attackMs:0,releaseMs:1500});
const vu = new VuChannelModel({attackMs:300,releaseMs:600});
const impulse = new Float32Array(64); impulse[0]=1;
const p = ppm.update(impulse,16,0);
const v = vu.update(impulse,16);
ok(p.instantPeakDb > -0.01, "impulse peak should reach 0 dBFS");
ok(v.averageDb < -35, "VU-like average should react much slower than peak");

console.log(JSON.stringify({status:"ok",checks:["dbfs","rms","stereo-separation","clip","ppm-vs-vu"]}));
