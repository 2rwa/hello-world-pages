// Camera-facing sphere impostors with genuine 3D GPU state and world perspective.
// Underwater particles render as refractive-rim microbubbles.
// Airborne particles render as small forward-scattering water droplets.
const COUNT:u32=1536u;
struct Particle3D{
  positionAge:vec4f,
  velocityLife:vec4f,
  sizeSeed:vec4f,
  aux:vec4f,
};
struct Params{
  step:vec4f,
  view:vec4f,
  lighting:vec4f,
  tap:vec4f,
  resolution:vec4f,
};
@group(0) @binding(0) var<storage,read> droplets:array<Particle3D>;
@group(0) @binding(1) var<uniform> params:Params;
@group(0) @binding(2) var<uniform> particleSettings:vec4f;
struct SpriteOut{
  @builtin(position) position:vec4f,
  @location(0) uv:vec2f,
  @location(1) opacity:f32,
  @location(2) kind:f32,
  @location(3) seed:f32,
  @location(4) depth:f32,
};
@vertex fn particleVertex(@builtin(vertex_index) vertexId:u32)->SpriteOut{
  let idx=vertexId/6u;
  let corner=vertexId%6u;
  let corners=array<vec2f,6>(
    vec2f(-1.0,-1.0),vec2f(1.0,-1.0),vec2f(-1.0,1.0),
    vec2f(-1.0,1.0),vec2f(1.0,-1.0),vec2f(1.0,1.0)
  );
  let uv=corners[corner];
  let particle=droplets[idx];
  let delta=particle.positionAge.xyz-vec3f(0.0,params.view.x,0.0);
  let cameraYaw=params.view.y;
  let worldRight=vec3f(cos(cameraYaw),0.0,-sin(cameraYaw));
  let worldForward=vec3f(-sin(cameraYaw),0.0,-cos(cameraYaw));
  let depth=dot(delta,worldForward);
  let aspect=max(0.2,params.resolution.x/params.resolution.y);
  let cameraX=dot(delta,worldRight);
  let cameraY=delta.y;
  let safeDepth=max(depth,0.075);
  let center=vec2f(cameraX/(safeDepth*0.82*aspect),
                   (cameraY/safeDepth+0.16-params.view.z)/0.78);
  let radius=particle.sizeSeed.x;
  let radiusNdc=vec2f(radius/(safeDepth*0.82*aspect),
                      radius/(safeDepth*0.78));
  // Cap apparent radius for near-camera particles.
  let clampedRadius=clamp(radiusNdc,vec2f(0.0015),vec2f(0.12));
  let lifetime=max(particle.velocityLife.w,0.01);
  let age=particle.positionAge.w;
  let isActive=age>=0.0 && age<lifetime && depth>0.20 && depth<150.0;
  let kind=particle.sizeSeed.y;
  let intensity=select(particleSettings.x,particleSettings.y,kind>0.5);
  let firstFade=smoothstep(0.0,0.12,age);
  let lastFade=1.0-smoothstep(0.65,1.0,age/lifetime);
  var alpha=clamp(intensity*firstFade*lastFade*particle.sizeSeed.w,0.0,1.0);
  if(!isActive){alpha=0.0;}
  var output:SpriteOut;
  output.position=vec4f(center+uv*clampedRadius,0.15,1.0);
  output.uv=uv;
  output.opacity=alpha;
  output.kind=kind;
  output.seed=particle.sizeSeed.z;
  output.depth=depth;
  return output;
}
@fragment fn particleFragment(input:SpriteOut)->@location(0) vec4f {
  let uv=input.uv;
  let rr=dot(uv,uv);
  if(rr>=1.0 || input.opacity<0.0005){discard;}
  let hemisphere=sqrt(max(0.0,1.0-rr));
  let falloff=1.0-smoothstep(0.88,1.0,rr);
  let viewDistance=clamp(1.0-input.depth/115.0,0.18,1.0);
  if(input.kind<0.5){
    // Refractive miniature bubble: dark transparent center, bright Fresnel rim.
    let fresnel=pow(1.0-hemisphere,2.2);
    let rim=smoothstep(0.31,0.86,rr)*(1.0-smoothstep(0.87,1.0,rr));
    let highlight=exp(-dot(uv-vec2f(-0.32,0.40),uv-vec2f(-0.32,0.40))*38.0);
    let shadowEdge=exp(-dot(uv-vec2f(0.23,-0.38),uv-vec2f(0.23,-0.38))*14.0);
    let bodyTint=vec3f(0.19,0.54,0.69)*(0.35+0.65*hemisphere);
    let color=mix(bodyTint,vec3f(0.84,0.97,1.0),clamp(fresnel*1.4+highlight*0.75,0.0,1.0));
    color=color+vec3f(0.13,0.25,0.30)*rim-vec3f(0.08,0.07,0.06)*shadowEdge;
    let opacity=clamp((0.07+rim*0.44+highlight*0.43)*input.opacity*viewDistance,0.0,0.80)*falloff;
    return vec4f(color,opacity);
  }
  // Airborne spray: bright anisotropic-glint droplet, small disk with soft boundary.
  let gleam=exp(-dot(uv-vec2f(-0.28,0.28),uv-vec2f(-0.28,0.28))*26.0);
  let glancing=pow(1.0-hemisphere,1.5);
  let hue=mix(vec3f(0.51,0.78,0.88),vec3f(0.97,0.99,1.0),clamp(gleam+glancing*0.35,0.0,1.0));
  let softness=1.0-smoothstep(0.58,1.0,rr);
  let alpha=clamp(input.opacity*(0.30+0.6*gleam+0.23*glancing)*viewDistance,0.0,0.85)*softness;
  return vec4f(hue,alpha);
}
