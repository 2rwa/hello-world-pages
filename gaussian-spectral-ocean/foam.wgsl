// World-anchored RGBA foam history fed by Gaussian packet Jacobians.
const RES:u32=192u;
struct Params {
  viewProj:mat4x4f,
  camera:vec4f,
  wind:vec4f,
  visual:vec4f,
  misc:vec4f,
  screen:vec4f,
};
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var normalTex:texture_2d_array<f32>;
@group(0) @binding(2) var previous:texture_2d<f32>;
@group(0) @binding(3) var next:texture_storage_2d<rgba16float,write>;
@group(0) @binding(4) var linearSampler:sampler;
fn noiseHash(p:vec2f)->f32 {
  return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);
}
@compute @workgroup_size(8,8)
fn foamAdvance(@builtin(global_invocation_id) gid:vec3u) {
  let size=textureDimensions(next);
  if(gid.x>=size.x||gid.y>=size.y){return;}
  let uv=(vec2f(gid.xy)+0.5)/vec2f(size);
  let worldXZ=(uv-0.5)*230.0;
  let dt=min(0.05,max(0.0,params.wind.w));
  let slowFlow=params.wind.xy*(0.22+params.wind.w*0.0);
  let oldUV=(worldXZ-slowFlow*dt)/230.0+0.5;
  var old=vec4f(0.0);
  if(all(oldUV>vec2f(0.002))&&all(oldUV<vec2f(0.998))){
    old=textureSampleLevel(previous,linearSampler,oldUV,0.0);
  }
  old*=exp(-vec4f(0.24,0.65,0.41,0.12)*dt);
  let layer1=textureSampleLevel(normalTex,linearSampler,fract(worldXZ/148.0),2,0.0);
  let layer2=textureSampleLevel(normalTex,linearSampler,fract(worldXZ/35.0),3,0.0);
  let layer3=textureSampleLevel(normalTex,linearSampler,fract(worldXZ/8.0),4,0.0);
  let jac=min(layer1.w,min(layer2.w,layer3.w));
  let crest=1.0-smoothstep(0.42,0.92,jac);
  let slope=length(layer1.xy+layer2.xy+layer3.xy);
  let extra=smoothstep(0.34,0.88,slope)*0.30;
  let flecks=0.62+0.38*noiseHash(floor(worldXZ*1.25));
  let source=clamp((crest+extra)*params.visual.y*flecks,0.0,3.0);
  old.x=clamp(old.x+source*dt*1.15,0.0,1.4);
  old.y=clamp(old.y+source*dt*2.0,0.0,1.4);
  old.z=clamp(old.z+source*dt*0.52,0.0,1.0);
  old.w=clamp(old.w+source*dt*0.21,0.0,1.0);
  textureStore(next,gid.xy,old);
}
