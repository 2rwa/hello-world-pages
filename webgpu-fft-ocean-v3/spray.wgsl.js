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
@group(0) @binding(3) var oceanHeightTex:texture_2d_array<f32>;
const waveTiles=array<f32,5>(2003.0,433.0,97.0,23.3,5.3);
fn sampledSeaHeight(worldXZ:vec2f)->f32 {
 var height=0.0;
 let texelDims=vec2f(textureDimensions(oceanHeightTex));
 for(var cascade:i32=0;cascade<5;cascade++){
  let pixel=vec2i(fract(worldXZ/waveTiles[cascade])*texelDims);
  height+=textureLoad(oceanHeightTex,pixel,cascade,0).x;
 }
 return height;
}
@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=arrayLength(&particles)){return;}
 let index=id.x;
 var p=particles[index];
 let heading=vec2f(cos(cfg.sim.w),sin(cfg.sim.w));
 let lateral=vec2f(-heading.y,heading.x);
 let rng=particleHash(index,37u);
 let side=select(-1.0,1.0,index%2u==0u);
 let jetAlong=select(-0.92,0.75,index%5u==0u);
 let jetSpread=side*(0.9+0.55*rng);
 let lifetime=0.6+particleHash(index,98u)*1.65;
 let dt=clamp(opts.x,0.0,0.08);
 if(p.velocityLife.w<0.0001){
  let startXZ=cfg.boat.xz+heading*cfg.boat.w*jetAlong+lateral*jetSpread*cfg.boat.w;
  p.positionAge=vec4f(startXZ.x,sampledSeaHeight(startXZ)+0.45,startXZ.y,
   -particleHash(index,91u)*lifetime);
  p.velocityLife=vec4f(heading.x*jetAlong*2.4+lateral.x*side*5.8,
   6.0+particleHash(index,28u)*8.0,
   heading.y*jetAlong*2.4+lateral.y*side*5.8,lifetime);
  p.sizeSeed=vec4f(0.045+pow(particleHash(index,122u),2.0)*0.28,rng,0.0,0.0);
 }
 var newAge=p.positionAge.w+dt;
 if(newAge>=p.velocityLife.w){
  let spawnX=cfg.boat.x+heading.x*cfg.boat.w*jetAlong+lateral.x*jetSpread*cfg.boat.w;
  let spawnZ=cfg.boat.z+heading.y*cfg.boat.w*jetAlong+lateral.y*jetSpread*cfg.boat.w;
  p.positionAge=vec4f(spawnX,sampledSeaHeight(vec2f(spawnX,spawnZ))+0.45,spawnZ,0.0);
  let launch=0.4+opts.z*0.65;
  let thrust=(3.1+rng*5.8)*launch;
  let spread=side*(3.5+6.0*particleHash(index,123u))*launch;
  p.velocityLife=vec4f(heading.x*jetAlong*thrust+lateral.x*spread,
   (6.0+particleHash(index,28u)*8.0)*launch,
   heading.y*jetAlong*thrust+lateral.y*spread,lifetime);
  newAge=0.0;
 }
 p.positionAge=vec4f(p.positionAge.xyz,newAge);
 if(newAge>=0.0){
  let wind=vec3f(0.55,0.0,0.24)*cfg.sim.z;
  let radius=p.sizeSeed.x;
  let drag=clamp((0.24+0.13/max(radius,0.035))*dt,0.0,0.88);
  var velocity=mix(p.velocityLife.xyz,wind,drag);
  velocity.y-=9.81*dt;
  p.velocityLife=vec4f(velocity,p.velocityLife.w);
  p.positionAge=vec4f(p.positionAge.xyz+velocity*dt,p.positionAge.w);
  if(p.positionAge.y<-2.0){p.positionAge=vec4f(p.positionAge.xyz,p.velocityLife.w+0.1);}
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
 var vertexResult:SprayOut;
 let projected=cfg.viewProj*vec4f(p.positionAge.xyz,1.0);
 let dist=max(0.1,length(cfg.eye.xyz-p.positionAge.xyz));
 let sourcePixels=2.0*p.sizeSeed.x/dist*opts.w;
 let actualPixels=clamp(sourcePixels,1.5,38.0);
 let coverage=min(1.0,pow(sourcePixels/max(1.5,actualPixels),2.0));
 let age=p.positionAge.w/max(0.1,p.velocityLife.w);
 let fade=clamp(age*7.0,0.0,1.0)*clamp((1.0-age)*3.0,0.0,1.0);
 let visibleFlag=select(1.0,0.0,p.positionAge.w<0.0||opts.y<0.01||projected.w<=0.0);
 let multiplier=opts.y*0.26*coverage*fade*visibleFlag;
 vertexResult.clip=vec4f(projected.xy+v*actualPixels*projected.w/max(1.0,opts.w),projected.zw);
 vertexResult.uv=v;
 vertexResult.opacity=multiplier;
 let lightDot=dot(normalize(cfg.eye.xyz-p.positionAge.xyz),sunUnit());
 vertexResult.forwardLight=lightDot;
 return vertexResult;
}
fn hg(c:f32,g:f32)->f32{
 return (1.0-g*g)/max(0.001,pow(1.0+g*g-2.0*g*c,1.5));
}
@fragment fn particleFragment(input:SprayOut)->@location(0) vec4f{
 let radiusSq=dot(input.uv,input.uv);
 let disk=1.0-smoothstep(0.12,1.0,radiusSq);
 let scatter=hg(input.forwardLight,0.52)*0.55+hg(input.forwardLight,-0.26)*0.45;
 let lighting=clamp(0.82+scatter*0.25,0.82,1.6);
 let alpha=clamp(input.opacity*disk,0.0,0.55);
 return vec4f(vec3f(0.91,0.96,1.0)*lighting,alpha);
}
`;
