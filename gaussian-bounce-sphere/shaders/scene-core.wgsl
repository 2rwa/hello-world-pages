struct Params {
  u0: vec4<f32>, // width height clock particle count
  u1: vec4<f32>, // camera.xyz iso
  u2: vec4<f32>, // right.xyz amplitude
  u3: vec4<f32>, // up.xyz opacity
  u4: vec4<f32>, // forward.xyz camera length
  u5: vec4<f32>, // glow cloudDensity shellOpacity colorShift
  u6: vec4<f32>, // colorMix roughness specular material
  u7: vec4<f32>, // mode ior refraction shellTint
  u8: vec4<f32>, // ripple strength frequency speed collisionGlow
  u9: vec4<f32>, // orbit clock marchSteps rayCull
};
struct Particle { center: vec3<f32>, sigma:f32, velocity:vec3<f32>, energy:f32, };
struct Ripple { normalAge:vec4<f32>, intensity:vec4<f32>, };
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var<storage,read> bodies:array<Particle,100>;
@group(0) @binding(2) var<storage,read> ripples:array<Ripple,8>;
struct Raster { @builtin(position) screen:vec4<f32>, @location(0) uv:vec2<f32>, };
@vertex fn vertexMain(@builtin(vertex_index) vertexId:u32)->Raster {
 var corners=array<vec2<f32>,3>(vec2<f32>(-1.0,-3.0),vec2<f32>(-1.0,1.0),vec2<f32>(3.0,1.0));
 var result:Raster;let pixel=corners[vertexId];result.screen=vec4<f32>(pixel,0.0,1.0);result.uv=pixel*.5+vec2<f32>(.5);return result;
}
fn intersectBall(origin:vec3<f32>,direction:vec3<f32>,radius:f32)->vec2<f32>{
 let b=dot(origin,direction);let c=dot(origin,origin)-radius*radius;let h=b*b-c;
 if(h<0.0){return vec2<f32>(1e6,-1e6);}let root=sqrt(h);return vec2<f32>(-b-root,-b+root);
}
fn waveColor(seed:f32)->vec3<f32>{
 let a=seed*6.28318+cfg.u5.w*6.28318;
 return .52+.48*cos(vec3<f32>(a,a+2.094,a+4.189));
}
fn buildCandidates(origin:vec3<f32>,direction:vec3<f32>,listing:ptr<function,array<u32,100>>)->u32{
 let n=u32(cfg.u0.w);var total:u32=0u;
 for(var k:u32=0u;k<100u;k++){if(k>=n){break;}
  let p=bodies[k];let delta=p.center-origin;let projected=dot(delta,direction);
  let radial=dot(delta,delta)-projected*projected;
  let support=3.5*p.sigma;
  if(cfg.u9.w<.5 || (projected>0.0 && radial<support*support)) {(*listing)[total]=k;total++;}
 }
 return total;
}
fn densityField(point:vec3<f32>,listing:ptr<function,array<u32,100>>,total:u32)->f32{
 var accum=0.0;
 for(var j:u32=0u;j<total;j++){
  let p=bodies[(*listing)[j]];let d=point-p.center;let inv=1.0/max(.0001,2.0*p.sigma*p.sigma);
  let q=dot(d,d)*inv;if(q<13.0){accum+=exp(-q);}
 }
 return accum*cfg.u2.w;
}
fn fieldGradient(point:vec3<f32>,listing:ptr<function,array<u32,100>>,total:u32)->vec3<f32>{
 var grad=vec3<f32>(0.0);
 for(var j:u32=0u;j<total;j++){
  let p=bodies[(*listing)[j]];let dif=point-p.center;let inv=1.0/max(.0001,p.sigma*p.sigma);
  let e=dot(dif,dif)*inv*.5;if(e<13.0){grad-=dif*inv*exp(-e);}
 }return grad;
}
fn fieldColor(point:vec3<f32>,listing:ptr<function,array<u32,100>>,total:u32)->vec4<f32>{
 var rgb=vec3<f32>(0.0);var wt=.0001;var energy=0.0;
 for(var j:u32=0u;j<total;j++){
  let idx=(*listing)[j];let p=bodies[idx];let dif=point-p.center;
  let e=dot(dif,dif)/max(.0001,2.0*p.sigma*p.sigma);
  if(e<13.0){let mass=exp(-e);let shade=waveColor(f32(idx)*.618034);
    rgb+=mix(vec3<f32>(.64,.83,1.0),shade,cfg.u6.x)*mass;
    energy+=p.energy*mass;wt+=mass;
  }
 }return vec4<f32>(rgb/wt,energy/wt);
}
fn rippleLight(hitNormal:vec3<f32>)->f32{
 var sum=0.0;
 for(var j:u32=0u;j<8u;j++){
  let r=ripples[j];if(r.intensity.x<=0.0||r.normalAge.w>=3.8){continue;}
  let angular=acos(clamp(dot(hitNormal,r.normalAge.xyz),-1.0,1.0));
  let time=r.normalAge.w;
  let envelope=exp(-pow((angular-time*cfg.u8.z)*3.0,2.0))*exp(-time*1.5);
  sum+=sin(angular*cfg.u8.y-time*13.0)*envelope*r.intensity.x;
 }
 return sum*cfg.u8.x;
}
fn backgroundColor(direction:vec3<f32>)->vec3<f32>{
 let sky=mix(vec3<f32>(.009,.013,.036),vec3<f32>(.03,.077,.115),clamp(.5+.5*direction.y,0.0,1.0));
 let star=pow(max(0.0,sin(direction.x*153.6)*sin(direction.y*188.1)*sin(direction.z*209.4)),90.0);
 return sky+vec3<f32>(star*.25);
}
