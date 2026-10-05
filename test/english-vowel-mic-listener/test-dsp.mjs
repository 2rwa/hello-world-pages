import assert from 'node:assert/strict';
import { PROFILES } from './data.mjs';
import { classifyVowel, estimateFormants, summarizeCalibration } from './dsp.mjs';

const refs=PROFILES.men.refs;
for(const [key,r] of Object.entries(refs)){
  const c=classifyVowel(r.f1,r.f2,r.f3,refs);
  assert.equal(c?.key,key,'reference class '+key);
}

function rand(seed=1){let s=seed>>>0;return()=>{s=(1664525*s+1013904223)>>>0;return s/0x100000000*2-1}}
function resonator(input,fs,f,bw){
  const rr=Math.exp(-Math.PI*bw/fs),c=2*rr*Math.cos(2*Math.PI*f/fs),r2=rr*rr,out=new Float64Array(input.length);
  let y1=0,y2=0;for(let i=0;i<input.length;i++){const y=input[i]+c*y1-r2*y2;out[i]=y;y2=y1;y1=y}return out;
}
function synth(r,fs=48000,sec=.1,seed=7){
  const n=Math.floor(fs*sec),noise=rand(seed),x=new Float64Array(n),period=Math.round(fs/125);
  for(let i=0;i<n;i++)x[i]=(i%period===0?1:0)+.06*noise();
  let y=resonator(x,fs,r.f1,85);y=resonator(y,fs,r.f2,110);y=resonator(y,fs,r.f3,150);
  let max=0;for(const v of y)max=Math.max(max,Math.abs(v));const o=new Float32Array(n);
  for(let i=0;i<n;i++)o[i]=.22*y[i]/Math.max(1e-9,max);return o;
}
for(const key of ['iy','ae','ah','uw','er']){
  const r=refs[key],est=estimateFormants(synth(r,48000,.1,key.charCodeAt(0)),48000,{minRms:.001});
  console.log(key,'target',r.f1,r.f2,r.f3,'estimated',est.f1,est.f2,est.f3);
  assert.ok(Number.isFinite(est.f1)&&Number.isFinite(est.f2),key+' F1/F2');
  assert.ok(Math.abs(est.f1-r.f1)<230,key+' F1 tolerance');
  assert.ok(Math.abs(est.f2-r.f2)<380,key+' F2 tolerance');
  const c=classifyVowel(est.f1,est.f2,est.f3,refs);
  assert.ok(c,key+' class exists');
}
const med=summarizeCalibration([{f1:400,f2:2000,f3:2800},{f1:420,f2:2020,f3:2820},{f1:900,f2:9000,f3:9000}]);
assert.deepEqual(med,{f1:420,f2:2020,f3:2820});
console.log('English vowel DSP tests passed');
