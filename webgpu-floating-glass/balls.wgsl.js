export const floatingBallsComputeWGSL = /* wgsl */ `
const TILE_SIZES=array<f32,5>(2003.0,433.0,97.0,23.3,5.3);
struct Params {viewProj:mat4x4f,sim:vec4f,boat:vec4f,prior:vec4f,extra:vec4f,eye:vec4f};
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var dispTex:texture_2d_array<f32>;
@group(0) @binding(2) var samp:sampler;
@group(0) @binding(3) var<storage,read_write> ballPos:array<vec4f>;
@group(0) @binding(4) var<uniform> ballOpts:vec4f;
// x=count, y=internal bounce budget, z=layout radius, w=drift speed
fn sampledHeight(xz:vec2f)->f32{
 var waveHeight=0.0;
 for(var k:i32=0;k<5;k++){
  waveHeight+=textureSampleLevel(dispTex,samp,fract(xz/TILE_SIZES[k]),k,0.0).x;
 }
 return waveHeight;
}
@compute @workgroup_size(64)
fn updateBalls(@builtin(global_invocation_id) gid:vec3u){
 let idx=gid.x;
 let ballCount=u32(ballOpts.x);
 if(idx>=ballCount){return;}
 let total=max(1.0,ballOpts.x);
 let fi=f32(idx);
 let goldenAngle=2.39996323;
 let radians=goldenAngle*fi;
 let radial=select(sqrt((fi+0.5)/total)*ballOpts.z,0.0,idx==0u);
 let t=cfg.sim.x*ballOpts.w;
 let horizontal=vec2f(cos(radians),sin(radians))*radial
   +vec2f(sin(t*0.16+fi*1.23),cos(t*0.12+fi*0.93))*1.55;
 let radius=cfg.boat.x;
 let centerRadius=cfg.boat.w;
 let lowCurvature=sqrt(max(1.0,centerRadius*centerRadius-dot(horizontal,horizontal)))-centerRadius;
 let seaHeight=sampledHeight(horizontal);
 // One center level per ball, computed from the same FFT as the raymarch.
 let yPosition=lowCurvature+seaHeight+radius*cfg.boat.z;
 ballPos[idx]=vec4f(horizontal.x,yPosition,horizontal.y,radius);
}
`;
