export const raymarchShader = /* wgsl */ `
struct Params {
 eye:vec4f, rightDir:vec4f, upDir:vec4f, frontDir:vec4f,
 viewport:vec4f, effects:vec4f, renderOpts:vec4f, renderExtra:vec4f
};
struct Gaussian {center:vec4f, sigma:vec4f, rotation:vec4f, color:vec4f};
@group(0) @binding(0) var<uniform> frameData:Params;
@group(0) @binding(1) var<storage,read> gaussianData:array<Gaussian>;
@group(0) @binding(2) var splatImage:texture_2d<f32>;
struct VSOut {@builtin(position) position:vec4f};
@vertex fn vs_main(@builtin(vertex_index) vi:u32)->VSOut{
 var p:VSOut;
 let pos=vec2f(f32((vi<<1u)&2u),f32(vi&2u));
 p.position=vec4f(pos*2.0-1.0,0.0,1.0);
 return p;
}
fn rotateVec(q:vec4f,v:vec3f)->vec3f{
 let t=2.0*cross(q.xyz,v);
 return v+q.w*t+cross(q.xyz,t);
}
fn gaussianField(pointPos:vec3f)->vec4f{
 var sumDensity=0.0; var rgbSum=vec3f(0.0);
 for(var gi=0u;gi<1280u;gi=gi+1u){
  if(gi>=u32(frameData.renderOpts.y)){break;}
  let g=gaussianData[gi];
  let rel=pointPos-g.center.xyz;
  let sig=g.sigma.xyz*frameData.viewport.w;
  let rr=max(max(sig.x,sig.y),sig.z)*3.2;
  if(dot(rel,rel)>rr*rr){continue;}
  let local=rotateVec(vec4f(-g.rotation.xyz,g.rotation.w),rel)/max(sig,vec3f(.008));
  let q=dot(local,local);
  if(q>12.0){continue;}
  let density=g.color.a*exp(-.5*q)*frameData.effects.x;
  sumDensity+=density;rgbSum+=g.color.rgb*density;
 }
 return vec4f(rgbSum,sumDensity);
}
fn seaBg(rayDir:vec3f)->vec3f{
 let up=max(0.0,rayDir.y*.5+.5);
 var col=mix(vec3f(.012,.025,.055),vec3f(.07,.16,.25),pow(up,1.35));
 let sun=max(0.0,dot(rayDir,normalize(vec3f(-.2,.55,-.81))));
 col+=vec3f(.10,.16,.23)*pow(sun,7.0)+vec3f(.35,.42,.28)*pow(sun,55.0);
 let haze=smoothstep(-.5,.4,rayDir.y);
 col=mix(col,vec3f(.03,.09,.14),1.0-haze);
 return col;
}
fn sandColor(ro:vec3f,rd:vec3f)->vec3f{
 if(rd.y>=-.001){return seaBg(rd);} 
 let dist=(-2.35-ro.y)/rd.y;
 if(dist<.0||dist>40.0){return seaBg(rd);} 
 let hit=ro+rd*dist;
 let pattern=.5+.5*sin(hit.x*2.7+sin(hit.z*1.8))*sin(hit.z*2.2);
 let grid=smoothstep(.58,.94,pattern);
 let sand=vec3f(.07,.08,.06)+vec3f(.13,.12,.08)*grid;
 let fade=exp(-dist*.09);
 return mix(seaBg(rd),sand,fade*.78);
}
fn readSplats(px:vec2i)->vec4f{
 let dims=vec2i(textureDimensions(splatImage,0));
 return textureLoad(splatImage,clamp(px,vec2i(0),dims-vec2i(1)),0);
}
fn volumeIntegral(ro:vec3f,rd:vec3f,startT:f32,endT:f32)->vec4f{
 var col=vec3f(0.0);var alphaTotal=0.0;
 let steps=max(1u,u32(frameData.renderOpts.z));
 let span=max(.0,endT-startT);let dt=span/f32(steps);
 for(var i=0u;i<96u;i=i+1u){
  if(i>=steps){break;}
  let pos=ro+rd*(startT+(f32(i)+.5)*dt);
  let sample=gaussianField(pos);
  let extinction=1.0-exp(-sample.a*dt*1.65);
  let srcColor=sample.rgb/max(sample.a,.0001);
  let w=(1.0-alphaTotal)*extinction;
  col+=srcColor*w;alphaTotal+=w;
  if(alphaTotal>.995){break;}
 }
 return vec4f(col,alphaTotal);
}
fn sphereSdf(pos:vec3f)->f32{
 let center=vec3f(.35,.08,-.15);
 return length(pos-center)-frameData.renderOpts.w;
}
fn ringSdf(pos:vec3f)->f32{
 let center=vec3f(.35,-1.05,-.15);
 let q=vec2f(length((pos-center).xz)-1.05,(pos-center).y);
 return length(q)-.055;
}
fn sdfWorld(pos:vec3f)->f32{return min(sphereSdf(pos),ringSdf(pos));}
fn sdfMarch(ro:vec3f,rd:vec3f)->f32{
 var t=.04;
 for(var i=0u;i<82u;i=i+1u){
  let dist=sdfWorld(ro+rd*t);
  if(dist<.0018){return t;}
  t+=max(dist*.84,.006);
  if(t>14.0){break;}
 }
 return -1.0;
}
fn sdfNormal(pos:vec3f)->vec3f{
 let h=.0022;
 let x=sdfWorld(pos+vec3f(h,0,0))-sdfWorld(pos-vec3f(h,0,0));
 let y=sdfWorld(pos+vec3f(0,h,0))-sdfWorld(pos-vec3f(0,h,0));
 let z=sdfWorld(pos+vec3f(0,0,h))-sdfWorld(pos-vec3f(0,0,h));
 return normalize(vec3f(x,y,z));
}
fn isoMarch(ro:vec3f,rd:vec3f)->f32{
 let level=.34;
 let stepT=.12;
 var prevT=.10;
 var prev=gaussianField(ro+rd*prevT).a-level;
 for(var i=1u;i<96u;i=i+1u){
  let t=.10+stepT*f32(i);
  let density=gaussianField(ro+rd*t).a-level;
  if(prev<.0&&density>=.0){
   var left=prevT;var right=t;
   for(var k=0u;k<6u;k=k+1u){
    let middle=(left+right)*.5;
    if(gaussianField(ro+rd*middle).a>=level){right=middle;}else{left=middle;}
   }
   return (left+right)*.5;
  }
  prev=density;prevT=t;
 }
 return -1.0;
}
fn isoNormal(p:vec3f)->vec3f{
 let h=.012;
 let dx=gaussianField(p+vec3f(h,0,0)).a-gaussianField(p-vec3f(h,0,0)).a;
 let dy=gaussianField(p+vec3f(0,h,0)).a-gaussianField(p-vec3f(0,h,0)).a;
 let dz=gaussianField(p+vec3f(0,0,h)).a-gaussianField(p-vec3f(0,0,h)).a;
 return normalize(-vec3f(dx,dy,dz)+vec3f(.00001));
}
fn shadeGlass(p:vec3f,n:vec3f,rd:vec3f,base:vec3f,fragPx:vec2i)->vec3f{
 let light=normalize(vec3f(-.55,.72,.42));
 let facing=max(0.0,dot(-rd,n));
 let fresnel=.055+.945*pow(1.0-facing,5.0);
 let reflected=reflect(rd,n);
 let reflectedColor=seaBg(reflected)+vec3f(.25,.35,.28)*pow(max(0.0,dot(reflected,light)),36.0);
 let ringHit=ringSdf(p)<.01;
 if(ringHit){
  return vec3f(.11,.48,.61)*(0.24+.76*max(0.0,dot(n,light)))+vec3f(.64,.86,.96)*pow(max(0.0,dot(reflect(-light,n),-rd)),34.0);
 }
 var through=base;
 if(frameData.renderOpts.x<.5){
  let warped=fragPx+vec2i(vec2f(n.x,-n.y)*(14.0+12.0*(1.0-facing))*frameData.renderOpts.w);
  let splat=readSplats(warped);
  let corrected=normalize(frameData.frontDir.xyz+frameData.rightDir.xyz*(f32(warped.x)-frameData.viewport.x*.5)/frameData.viewport.z-frameData.upDir.xyz*(f32(warped.y)-frameData.viewport.y*.5)/frameData.viewport.z);
  through=seaBg(corrected)*(1.0-splat.a)+splat.rgb;
 }else{
  let inward=refract(rd,n,1.0/1.46);
  let sample=gaussianField(p+inward*2.25);
  let tint=sample.rgb/max(sample.a,.001);
  through=mix(base,tint,clamp(sample.a*.6,0.0,.75));
 }
 let edge=vec3f(.08,.26,.38)*pow(1.0-facing,2.0);
 let sparkle=vec3f(.66,.95,1.0)*pow(max(0.0,dot(reflect(-light,n),-rd)),90.0);
 return through*(1.0-fresnel)*vec3f(.82,.96,1.03)+reflectedColor*fresnel+edge+sparkle;
}
@fragment fn fs_main(@builtin(position) frag:vec4f)->@location(0) vec4f{
 let coord=vec2f((frag.x-frameData.viewport.x*.5)/frameData.viewport.z,(frameData.viewport.y*.5-frag.y)/frameData.viewport.z);
 let ro=frameData.eye.xyz;
 let rd=normalize(frameData.frontDir.xyz+frameData.rightDir.xyz*coord.x+frameData.upDir.xyz*coord.y);
 var base=sandColor(ro,rd);
 let mode=frameData.renderOpts.x;
 if(mode<.5){
  let splat=readSplats(vec2i(frag.xy));
  base=base*(1.0-splat.a)+splat.rgb;
 }else if(mode<1.5){
  let fog=volumeIntegral(ro,rd,0.0,11.0);
  base=base*(1.0-fog.a)+fog.rgb*1.22;
 }
 let glassDist=sdfMarch(ro,rd);
 var col=base;
 if(mode>1.5){
  let isoDist=isoMarch(ro,rd);
  if(isoDist>0.0&&(glassDist<0.0||isoDist<glassDist)){
   let surfacePos=ro+rd*isoDist;
   let n=isoNormal(surfacePos);
   let field=gaussianField(surfacePos);
   let tint=field.rgb/max(field.a,.0001);
   let light=normalize(vec3f(-.42,.72,.62));
   let diffuse=.18+.78*max(0.0,dot(n,light));
   let rim=pow(1.0-max(0.0,dot(n,-rd)),3.0);
   col=tint*diffuse+vec3f(.22,.56,.85)*rim*.56;
  }else if(glassDist>0.0){
   let p=ro+rd*glassDist;col=shadeGlass(p,sdfNormal(p),rd,base,vec2i(frag.xy));
  }
 }else if(glassDist>0.0){
  let p=ro+rd*glassDist;
  col=shadeGlass(p,sdfNormal(p),rd,base,vec2i(frag.xy));
 }
 col=max(col,vec3f(0.0));
 col=1.0-exp(-col*1.08);
 return vec4f(pow(clamp(col,vec3f(0.0),vec3f(1.0)),vec3f(.92)),1.0);
}
`;
