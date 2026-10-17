export const curvedOceanWGSL = /* wgsl */ `
const PI:f32=3.14159265;
const tiles=array<f32,5>(2003.0,433.0,97.0,23.3,5.3);
struct Params {viewProj:mat4x4f,sim:vec4f,boat:vec4f,prior:vec4f,extra:vec4f,eye:vec4f};
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var oceanTex:texture_2d_array<f32>;
@group(0) @binding(2) var linearSampler:sampler;
struct Vary {@builtin(position) pos:vec4f};
@vertex fn mainVertex(@builtin(vertex_index) idx:u32)->Vary{
 let p=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
 var v:Vary;v.pos=vec4f(p[idx],0.0,1.0);return v;
}
fn waveHeight(xz:vec2f)->f32{
 var result=0.0;
 for(var band:i32=0;band<5;band++){
  result+=textureSampleLevel(oceanTex,linearSampler,fract(xz/tiles[band]),band,0.0).x;
 }
 return result;
}
fn hash2(x:vec2f)->f32{return fract(sin(dot(x,vec2f(127.1,311.7)))*43758.5453);}
fn noise2(x:vec2f)->f32{
 let b=floor(x);let f=fract(x);let u=f*f*(3.0-2.0*f);
 return mix(mix(hash2(b),hash2(b+vec2f(1.0,0.0)),u.x),
            mix(hash2(b+vec2f(0.0,1.0)),hash2(b+vec2f(1.0,1.0)),u.x),u.y);
}
fn sunDirection()->vec3f{
 let alt=cfg.extra.x;
 return normalize(vec3f(-0.68*cos(alt),sin(alt),0.73*cos(alt)));
}
fn skyColor(ray:vec3f)->vec3f{
 let upper=vec3f(0.023,0.15,0.35);
 let horizon=vec3f(0.54,0.73,0.86);
 var color=mix(horizon,upper,pow(clamp(ray.y,0.0,1.0),0.58));
 let nearSun=max(dot(ray,sunDirection()),0.0);
 color+=vec3f(1.0,0.58,0.29)*pow(nearSun,22.0)*0.24;
 color+=vec3f(1.0,0.82,0.57)*pow(nearSun,1800.0)*7.0;
 let uv=ray.xz/max(0.16,abs(ray.y))*0.7+vec2f(cfg.sim.x*0.007,0.0);
 let cloud=noise2(uv)*0.57+noise2(uv*2.1)*0.3+noise2(uv*4.25)*0.13;
 let cover=smoothstep(0.55,0.68,cloud)*smoothstep(0.01,0.16,ray.y);
 return mix(color,vec3f(0.77,0.80,0.83),cover*0.65);
}
fn toneMap(c:vec3f)->vec3f{
 let x=max(c,vec3f(0.0));
 let t=(x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14);
 return pow(clamp(t,vec3f(0.0),vec3f(1.0)),vec3f(1.0/2.2));
}
fn implicitValue(p:vec3f,sphereCenter:vec3f,radius:f32)->f32{
 return length(p-sphereCenter)-radius-waveHeight(p.xz);
}
fn waterNormal(p:vec3f,sphereCenter:vec3f)->vec3f{
 let e=0.85;
 let dx=(waveHeight(p.xz+vec2f(e,0.0))-waveHeight(p.xz-vec2f(e,0.0)))/(2.0*e);
 let dz=(waveHeight(p.xz+vec2f(0.0,e))-waveHeight(p.xz-vec2f(0.0,e)))/(2.0*e);
 return normalize(normalize(p-sphereCenter)-vec3f(dx,0.0,dz));
}
fn gridMark(value:f32,spacing:f32)->f32{
 let pos=abs(fract(value/spacing)-0.5);
 return 1.0-smoothstep(0.475,0.495,pos);
}
@fragment fn mainFragment(@builtin(position) pixel:vec4f)->@location(0) vec4f{
 let aspect=cfg.extra.w;
 let viewport=vec2f(cfg.eye.w*aspect,cfg.eye.w);
 let ndc=vec2f(pixel.x/viewport.x*2.0-1.0,1.0-pixel.y/viewport.y*2.0);
 let eye=cfg.eye.xyz;
 let forward=normalize(cfg.prior.xyz-eye);
 let right=normalize(cross(vec3f(0.0,1.0,0.0),forward));
 let up=cross(forward,right);
 let ray=normalize(forward+right*ndc.x*aspect*tan(0.44)+up*ndc.y*tan(0.44));
 let radius=cfg.boat.w;
 let sphereCenter=vec3f(0.0,-radius,0.0);
 let outerRadius=radius+max(65.0,cfg.sim.y*25.0);
 let originRel=eye-sphereCenter;
 let halfB=dot(originRel,ray);
 let determinant=halfB*halfB-dot(originRel,originRel)+outerRadius*outerRadius;
 var hit=false;var hitDist=0.0;
 if(determinant>=0.0){
  let delta=sqrt(determinant);
  let farT=-halfB+delta;
  var oldT=max(0.0,-halfB-delta);
  if(farT>0.0){
   var oldValue=implicitValue(eye+ray*oldT,sphereCenter,radius);
   if(oldValue<=0.0){hit=true;hitDist=oldT;}
   for(var step:i32=0;step<88;step++){
    if(hit||oldT>=farT){break;}
    let stride=clamp(abs(oldValue)*0.72,0.65,92.0);
    let nextT=min(farT,oldT+stride);
    let nextValue=implicitValue(eye+ray*nextT,sphereCenter,radius);
    if(nextValue<=0.0){
     var lower=oldT;var upper=nextT;
     for(var refinement:i32=0;refinement<7;refinement++){
      let middle=0.5*(lower+upper);
      if(implicitValue(eye+ray*middle,sphereCenter,radius)>0.0){lower=middle;}else{upper=middle;}
     }
     hit=true;hitDist=(lower+upper)*0.5;break;
    }
    oldT=nextT;oldValue=nextValue;
   }
  }
 }
 let background=skyColor(ray);
 if(!hit){return vec4f(toneMap(background),1.0);}
 let p=eye+ray*hitDist;
 let normal=waterNormal(p,sphereCenter);
 let radial=normalize(p-sphereCenter);
 let toEye=-ray;
 let fresnel=0.0204+0.9796*pow(1.0-clamp(dot(normal,toEye),0.0,1.0),5.0);
 let reflected=reflect(-toEye,normal);
 let inclination=clamp(length(normal-radial)*0.8,0.0,1.0);
 let wrinkle=0.026*sin(p.x*2.4+p.z*0.86+cfg.sim.x*2.8);
 let roughness=clamp(0.054+inclination*0.2+abs(wrinkle),0.05,0.39);
 let deep=vec3f(0.006,0.084,0.16);
 var water=mix(deep,skyColor(reflected),clamp(fresnel+roughness*0.35,0.0,1.0));
 let halfDirection=normalize(toEye+sunDirection());
 let specular=pow(max(dot(normal,halfDirection),0.0),max(30.0,1.6/(roughness*roughness)));
 water+=vec3f(1.0,0.85,0.65)*specular*(1.9+roughness*5.0)*max(0.1,sin(cfg.extra.x));
 let wave=waveHeight(p.xz);
 let crest=smoothstep(0.24,0.68,inclination);
 let turbulent=noise2(p.xz*0.12+vec2f(cfg.sim.x*0.032,-cfg.sim.x*0.02));
 let foam=clamp((crest*0.6+smoothstep(0.65,1.0,turbulent)*0.21)*cfg.extra.y,0.0,0.87);
 water=mix(water,vec3f(0.75,0.88,0.92),foam);
 let distanceFog=1.0-exp(-hitDist*0.00028);
 water=mix(water,background,distanceFog*0.65);
 let mode=i32(cfg.prior.w+0.5);
 if(mode==1){return vec4f(normal*0.5+0.5,1.0);}
 if(mode==2){
  let v=clamp(0.5+wave*0.055,0.0,1.0);
  return vec4f(v*0.65,v,1.0-v*0.8,1.0);
 }
 if(mode==3){
  let line=max(gridMark(p.x,200.0),gridMark(p.z,200.0));
  water=mix(water,vec3f(1.0,0.58,0.11),line*0.9);
  let curvature=clamp(1.0-dot(radial,vec3f(0.0,1.0,0.0)),0.0,1.0);
  water+=vec3f(curvature*0.7,0.0,curvature*0.5);
 }
 return vec4f(toneMap(water),1.0);
}
`;
