export const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
export function rms(x){let s=0;for(const v of x)s+=v*v;return Math.sqrt(s/Math.max(1,x.length))}
export function bark(hz){return 13*Math.atan(.00076*hz)+3.5*Math.atan((hz/7500)**2)}
function median(v){if(!v.length)return NaN;const a=[...v].sort((x,y)=>x-y),m=a.length>>1;return a.length&1?a[m]:(a[m-1]+a[m])/2}
export function summarizeCalibration(samples){
  const v=samples.filter(x=>Number.isFinite(x.f1)&&Number.isFinite(x.f2)&&Number.isFinite(x.f3));
  return v.length?{f1:median(v.map(x=>x.f1)),f2:median(v.map(x=>x.f2)),f3:median(v.map(x=>x.f3))}:null;
}
export function classifyVowel(f1,f2,f3,refs){
  if(!Number.isFinite(f1)||!Number.isFinite(f2)||!refs)return null;
  const p=[bark(f1),bark(f2),Number.isFinite(f3)?bark(f3):null];
  const rows=Object.entries(refs).map(([key,ref])=>{
    const d1=(p[0]-bark(ref.f1))/1.05,d2=(p[1]-bark(ref.f2))/1.55;
    const d3=p[2]==null?0:(p[2]-bark(ref.f3))/1.55;
    const w3=key==='er'?.9:.12;
    return {key,ref,distance:Math.sqrt(d1*d1+d2*d2+w3*d3*d3)};
  }).sort((a,b)=>a.distance-b.distance);
  const best=rows[0],second=rows[1],absolute=Math.exp(-.5*best.distance**2);
  const margin=second?clamp((second.distance-best.distance)/Math.max(.3,second.distance),0,1):1;
  return {key:best.key,label:best.ref.label,ipa:best.ref.ipa,word:best.ref.word,
    confidence:clamp(100*(.6*absolute+.4*margin),0,100),distance:best.distance,candidates:rows};
}
function resample(input,src,dst,dur=.075){
  const n=Math.min(input.length,Math.max(32,Math.floor(src*dur))),start=input.length-n;
  const m=Math.max(32,Math.floor(n*dst/src)),out=new Float64Array(m),scale=(n-1)/Math.max(1,m-1);
  for(let i=0;i<m;i++){const p=i*scale,j=Math.floor(p),q=p-j,a=input[start+j],b=input[start+Math.min(n-1,j+1)];out[i]=a+(b-a)*q}
  return out;
}
function preprocess(x,pre=.97){
  const n=x.length,out=new Float64Array(n);let mean=0;for(const v of x)mean+=v;mean/=n;
  let prev=x[0]-mean;
  for(let i=0;i<n;i++){const v=x[i]-mean,y=i? v-pre*prev:v;prev=v;const w=.5-.5*Math.cos(2*Math.PI*i/(n-1));out[i]=y*w}
  return out;
}
function autocorr(x,order){
  const r=new Float64Array(order+1);
  for(let lag=0;lag<=order;lag++){let s=0;for(let i=lag;i<x.length;i++)s+=x[i]*x[i-lag];r[lag]=s}
  return r;
}
export function levinsonDurbin(r,order){
  const a=new Float64Array(order+1);a[0]=1;let error=Math.max(1e-12,r[0]);
  for(let i=1;i<=order;i++){
    let acc=r[i];for(let j=1;j<i;j++)acc+=a[j]*r[i-j];
    const k=clamp(-acc/error,-.999,.999),next=a.slice();next[i]=k;
    for(let j=1;j<i;j++)next[j]=a[j]+k*a[i-j];a.set(next);error*=Math.max(1e-6,1-k*k);
  }
  return {a,error};
}
function envelope(a,fs,minHz=180,maxHz=4300,step=10){
  const bins=[];
  for(let f=minHz;f<=maxHz;f+=step){
    const w=2*Math.PI*f/fs;let re=0,im=0;
    for(let k=0;k<a.length;k++){re+=a[k]*Math.cos(w*k);im-=a[k]*Math.sin(w*k)}
    bins.push({f,db:20*Math.log10(1/Math.sqrt(re*re+im*im+1e-12)+1e-12)});
  }
  return bins.map((b,i)=>{let s=0,c=0;for(let j=Math.max(0,i-2);j<=Math.min(bins.length-1,i+2);j++){s+=bins[j].db;c++}return{f:b.f,db:s/c}});
}
function prominence(env,i,r=12){
  let l=env[i].db,rr=env[i].db;
  for(let j=Math.max(0,i-r);j<i;j++)l=Math.min(l,env[j].db);
  for(let j=i+1;j<=Math.min(env.length-1,i+r);j++)rr=Math.min(rr,env[j].db);
  return env[i].db-Math.max(l,rr);
}
function peaks(env){
  const out=[];
  for(let i=2;i<env.length-2;i++)if(env[i].db>env[i-1].db&&env[i].db>=env[i+1].db){
    const p=prominence(env,i);if(p>=.3)out.push({f:env[i].f,db:env[i].db,prominence:p});
  }
  return out;
}
function choose(candidates,preferLow=true){
  if(!candidates.length)return null;
  if(candidates.length===1)return candidates[0];
  const first=candidates[0],strong=[...candidates].sort((a,b)=>(b.prominence+.04*b.db)-(a.prominence+.04*a.db))[0];
  return preferLow&&strong.prominence<first.prominence*1.9?first:strong;
}
export function estimateFormants(input,sourceRate,opt={}){
  const inputRms=rms(input),minRms=opt.minRms??.008;
  if(!Number.isFinite(inputRms)||inputRms<minRms)return{voiced:false,rms:inputRms};
  const fs=opt.targetRate??12000,x=preprocess(resample(input,sourceRate,fs,opt.durationSec??.075),opt.preemphasis??.97);
  const order=opt.order??18,r=autocorr(x,order);if(r[0]<1e-9)return{voiced:false,rms:inputRms};
  const {a,error}=levinsonDurbin(r,order),env=envelope(a,fs),pk=peaks(env);
  const f1=choose(pk.filter(p=>p.f>=220&&p.f<=1150),false);
  if(!f1)return{voiced:true,rms:inputRms,f1:null,f2:null,f3:null,quality:0,peaks:pk};
  const f2=choose(pk.filter(p=>p.f>=Math.max(650,f1.f+280)&&p.f<=3200),true);
  if(!f2)return{voiced:true,rms:inputRms,f1:f1.f,f2:null,f3:null,quality:.15,peaks:pk};
  const f3=choose(pk.filter(p=>p.f>=Math.max(1350,f2.f+220)&&p.f<=4200),true);
  const q1=clamp(f1.prominence/5,0,1),q2=clamp(f2.prominence/5,0,1),q3=f3?clamp(f3.prominence/4,0,1):0;
  const stability=clamp(1-error/Math.max(1e-9,r[0]),0,1),quality=clamp(.3*q1+.35*q2+.2*q3+.15*stability,0,1);
  return{voiced:true,rms:inputRms,f1:f1.f,f2:f2.f,f3:f3?.f??null,quality,peaks:pk};
}
