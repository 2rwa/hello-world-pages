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
 for(var gi=0u;gi<128u;gi=gi+1u){
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
fn sky(rayDir:vec3f)->vec3f{
 let up=max(0.0,rayDir.y*.5+.5);
 var col=mix(vec3f(.007,.015,.042),vec3f(.044,.094,.15),pow(up,1.5));
 let light=max(0.0,dot(rayDir,normalize(vec3f(-.35,.48,-.82))));
 col+=vec3f(.08,.16,.23)*pow(light,6.0)+vec3f(.15,.09,.16)*pow(light,30.0);
 return col;
}
fn floorColor(ro:vec3f,rd:vec3f)->vec3f{
 if(rd.y>=-.001){return sky(rd);}
 let dist=(-2.22-ro.y)/rd.y;
 if(dist<.0||dist>45.0){return sky(rd);}
 let hit=ro+rd*dist;
 let gx=abs(fract(hit.x*.5)-.5);
 let gz=abs(fract(hit.z*.5)-.5);
 let grid=1.0-smoothstep(.012,.035,min(gx,gz));
 let fade=exp(-dist*.105);
 let ground=vec3f(.014,.026,.046)+vec3f(.07,.16,.22)*grid*fade;
 return mix(sky(rd),ground,fade*.8);
}
fn readSplats(px:vec2i)->vec4f{
 let dims=vec2i(textureDimensions(splatImage,0));
 return textureLoad(splatImage,clamp(px,vec2i(0),dims-vec2i(1)),0);
}
fn volumeIntegral(ro:vec3f,rd:vec3f,startT:f32,endT:f32)->vec4f{
 var col=vec3f(0.0);var alphaTotal=0.0;
 let steps=max(1u,u32(frameData.renderOpts.z));
 let span=max(.0,endT-startT);let dt=span/f32(steps);
 for(var i=0u;i<64u;i=i+1u){
  if(i>=steps){break;}
  let pos=ro+rd*(startT+(f32(i)+.5)*dt);
  let sample=gaussianField(pos);
  let extinction=1.0-exp(-sample.a*dt*1.75);
  let srcColor=sample.rgb/max(sample.a,.0001);
  let w=(1.0-alphaTotal)*extinction;
  col+=srcColor*w;alphaTotal+=w;
  if(alphaTotal>.995){break;}
 }
 return vec4f(col,alphaTotal);
}
fn sdfWorld(pos:vec3f)->f32{
 let orb=length(pos)-frameData.renderOpts.w;
 let q=vec2f(length(pos.xz)-1.18,pos.y+1.54);
 let torus=length(q)-.063;
 return min(orb,torus);
}
fn sdfMarch(ro:vec3f,rd:vec3f)->f32{
 var t=.04;
 for(var i=0u;i<76u;i=i+1u){
  let dist=sdfWorld(ro+rd*t);
  if(dist<.0018){return t;}
  t+=max(dist*.84,.006);
  if(t>16.0){break;}
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
 let level=.36;
 let stepT=.16;
 var prevT=.12;
 var prev=gaussianField(ro+rd*prevT).a-level;
 for(var i=1u;i<76u;i=i+1u){
  let t=.12+stepT*f32(i);
  let density=gaussianField(ro+rd*t).a-level;
  if(prev<.0&&density>=.0){
   var left=prevT;var right=t;
   for(var k=0u;k<5u;k=k+1u){
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
 let light=normalize(vec3f(-.6,.8,.5));
 let front=max(0.0,dot(-rd,n));
 let fresnel=.065+.935*pow(1.0-front,5.0);
 let reflected=reflect(rd,n);
 let reflectedColor=sky(reflected)+vec3f(.2,.34,.45)*pow(max(0.0,dot(reflected,light)),28.0);
 let isRing=p.y< -1.19 && length(p)>frameData.renderOpts.w*.9;
 if(isRing){
  return vec3f(.08,.43,.58)*(0.27+.73*max(0.0,dot(n,light)))+vec3f(.42,.76,.98)*pow(max(0.0,dot(reflect(-light,n),-rd)),36.0);
 }
 var through=base;
 if(frameData.renderOpts.x<.5){
  let warped=fragPx+vec2i(vec2f(n.x,-n.y)*(10.0+16.0*(1.0-front))*frameData.renderOpts.w);
  let splat=readSplats(warped);
  let correctRay=normalize(frameData.frontDir.xyz+frameData.rightDir.xyz*(f32(warped.x)-frameData.viewport.x*.5)/frameData.viewport.z-frameData.upDir.xyz*(f32(warped.y)-frameData.viewport.y*.5)/frameData.viewport.z);
  through=sky(correctRay)*(1.0-splat.a)+splat.rgb;
 } else {
  let inward=refract(rd,n,1.0/1.46);
  let sample=gaussianField(p+inward*2.7);
  let tint=sample.rgb/max(sample.a,.001);
  through=mix(base,tint,clamp(sample.a*.55,0.0,.7));
 }
 let edge=vec3f(.07,.39,.55)*pow(1.0-front,2.0);
 let caustic=vec3f(.31,.6,.8)*pow(max(0.0,dot(reflect(-light,n),-rd)),85.0);
 return through*(1.0-fresnel)*vec3f(.79,.94,1.02)+reflectedColor*fresnel+edge+caustic;
}
@fragment fn fs_main(@builtin(position) frag:vec4f)->@location(0) vec4f{
 let coord=vec2f((frag.x-frameData.viewport.x*.5)/frameData.viewport.z,(frameData.viewport.y*.5-frag.y)/frameData.viewport.z);
 let ro=frameData.eye.xyz;
 let rd=normalize(frameData.frontDir.xyz+frameData.rightDir.xyz*coord.x+frameData.upDir.xyz*coord.y);
 var base=floorColor(ro,rd);
 let mode=frameData.renderOpts.x;
 if(mode<.5){
  let splat=readSplats(vec2i(frag.xy));
  base=base*(1.0-splat.a)+splat.rgb;
 }else if(mode<1.5){
  let fog=volumeIntegral(ro,rd,.0,14.0);
  base=base*(1.0-fog.a)+fog.rgb*1.22;
 }
 let orbDist=sdfMarch(ro,rd);
 var col=base;
 if(mode>1.5){
  let isoDist=isoMarch(ro,rd);
  if(isoDist>0.0&&(orbDist<0.0||isoDist<orbDist)){
   let surfacePos=ro+rd*isoDist;
   let n=isoNormal(surfacePos);
   let field=gaussianField(surfacePos);
   let tint=field.rgb/max(field.a,.0001);
   let light=normalize(vec3f(-.4,.75,.8));
   let diffuse=.19+.74*max(0.0,dot(n,light));
   let rim=pow(1.0-max(0.0,dot(n,-rd)),3.0);
   col=tint*diffuse+vec3f(.27,.6,.85)*rim*.6;
  }else if(orbDist>0.0){
   let p=ro+rd*orbDist;col=shadeGlass(p,sdfNormal(p),rd,base,vec2i(frag.xy));
  }
 }else if(orbDist>0.0){
  let p=ro+rd*orbDist;
  col=shadeGlass(p,sdfNormal(p),rd,base,vec2i(frag.xy));
 }
 // Mild filmic curve, preserving colorful Gaussian highlights.
 col=max(col,vec3f(0.0));col=1.0-exp(-col*1.12);
 return vec4f(pow(clamp(col,vec3f(0.0),vec3f(1.0)),vec3f(.90)),1.0);
}
`;