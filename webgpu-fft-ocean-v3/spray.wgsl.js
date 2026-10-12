const P=/* wgsl */ `
struct Params {viewProj:mat4x4f,sim:vec4f,boat:vec4f,prior:vec4f,extra:vec4f,eye:vec4f};
struct Particle {positionAge:vec4f,velocityLife:vec4f,sizeSeed:vec4f};
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var<uniform> opts:vec4f; // dt, spray, slam, viewportHeight
fn hashSeed(v:u32)->f32{
 var a=v;
 a=(a^(a>>16u))*0x7feb352du;
 a=(a^(a>>15u))*0x846ca68bu;
 return f32(a^(a>>16u))/4294967295.0;
}
fn particleHash(index:u32,salt:u32)->f32{return hashSeed(index*1664525u+salt*1013904223u);}
fn sunUnit()->vec3f{
 let a=clamp(cfg.extra.y,0.06,1.42);
 return normalize(vec3f(-0.78*cos(a),sin(a),0.62*cos(a)));
}
`;
export const sprayComputeWGSL=P+`
@group(0) @binding(2) var<storage,read_write> particles:array<Particle>;
@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=arrayLength(&particles)){return;}
 let index=id.x;
 var p=particles[index];
 let heading=vec2f(cos(cfg.sim.w),sin(cfg.sim.w));
 let lateral=vec2f(-heading.y,heading.x);
 let rng=particleHash(index,37u);
 let side=rng*2.0-1.0;
 let lifetime=0.6+particleHash(index,98u)*1.65;
 let dt=clamp(opts.x,0.0,0.08);
 if(p.velocityLife.w<0.0001){
  p.positionAge=vec4f(cfg.boat.xyz,-particleHash(index,91u)*lifetime);
  p.velocityLife=vec4f(0.0,0.0,0.0,lifetime);
  p.sizeSeed=vec4f(0.045+pow(particleHash(index,122u),2.0)*0.28,rng,0.0,0.0);
 }
 let newAge=p.positionAge.w+dt;
 if(newAge>=p.velocityLife.w){
  let spawnX=cfg.boat.x+heading.x*cfg.boat.w*0.85+lateral.x*side*cfg.boat.w*0.65;
  let spawnZ=cfg.boat.z+heading.y*cfg.boat.w*0.85+lateral.y*side*cfg.boat.w*0.65;
  p.positionAge=vec4f(spawnX,cfg.boat.y-cfg.boat.w*0.45,spawnZ,0.0);
  let launch=0.4+opts.z*0.65;
  let thrust=(1.7+rng*4.7)*launch;
  let spread=side*(2.0+5.0*particleHash(index,123u))*launch;
  p.velocityLife=vec4f(heading.x*thrust+lateral.x*spread,
   (1.4+particleHash(index,28u)*7.0)*launch,
   heading.y*thrust+lateral.y*spread,lifetime);
  newAge=0.0;
 }
 p.positionAge.w=newAge;
 if(newAge>=0.0){
  let wind=vec3f(0.55,0.0,0.24)*cfg.sim.z;
  let radius=p.sizeSeed.x;
  let drag=clamp((0.24+0.13/max(radius,0.035))*dt,0.0,0.88);
  let velocity=mix(p.velocityLife.xyz,wind,drag);
  velocity.y-=9.81*dt;
  p.velocityLife.xyz=velocity;
  p.positionAge.xyz+=velocity*dt;
  if(p.positionAge.y<-2.0){p.positionAge.w=p.velocityLife.w+0.1;}
 }
 particles[index]=p;
}
`;
export const sprayRenderWGSL=P+`
@group(0) @binding(2) var<storage,read> particles:array<Particle>;
struct SprayOut {
 @builtin(position) clip:vec4f,
 @location(0) uv:vec2f,
 @location(1) opacity:f32,
 @location(2) forwardLight:f32
};
@vertex fn particleVertex(@builtin(vertex_index) vi:u32)->SprayOut{
 let index=vi/6u;
 let corner=vi%6u;
 let v=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),
                        vec2f(-1,1),vec2f(1,-1),vec2f(1,1))[corner];
 let p=particles[index];
 var out:SprayOut;
 let projected=cfg.viewProj*vec4f(p.positionAge.xyz,1.0);
 let dist=max(0.1,length(cfg.eye.xyz-p.positionAge.xyz));
 let sourcePixels=2.0*p.sizeSeed.x/dist*opts.w;
 let actualPixels=clamp(sourcePixels,1.5,38.0);
 let coverage=min(1.0,pow(sourcePixels/max(1.5,actualPixels),2.0));
 let age=p.positionAge.w/max(0.1,p.velocityLife.w);
 let fade=clamp(age*7.0,0.0,1.0)*clamp((1.0-age)*3.0,0.0,1.0);
 let active=select(1.0,0.0,p.positionAge.w<0.0||opts.y<0.01||projected.w<=0.0);
 let multiplier=opts.y*0.26*coverage*fade*active;
 out.clip=projected;
 out.clip.xy+=v*actualPixels*projected.w/max(1.0,opts.w);
 out.uv=v;
 out.opacity=multiplier;
 let lightDot=dot(normalize(cfg.eye.xyz-p.positionAge.xyz),sunUnit());
 out.forwardLight=lightDot;
 return out;
}
fn hg(c:f32,g:f32)->f32{
 return (1.0-g*g)/max(0.001,pow(1.0+g*g-2.0*g*c,1.5));
}
@fragment fn particleFragment(input:SprayOut)->@location(0) vec4f{
 let radiusSq=dot(input.uv,input.uv);
 let disk=1.0-smoothstep(0.12,1.0,radiusSq);
 let scatter=hg(input.forwardLight,0.52)*0.55+hg(input.forwardLight,-0.26)*0.45;
 let lighting=clamp(0.32+scatter*0.37,0.35,2.1);
 let alpha=clamp(input.opacity*disk,0.0,0.55);
 return vec4f(vec3f(0.64,0.80,0.87)*lighting,alpha);
}
`;
