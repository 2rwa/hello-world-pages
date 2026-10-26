// Full-screen perspective height-field intersection: fixed bracket + bisection, not SDF tracing.
const WORLD_SIZE: f32 = 96.0;
const PI: f32 = 3.14159265;
struct Params {
  controls0: vec4<f32>,
  controls1: vec4<f32>,
  controls2: vec4<f32>,
  controls3: vec4<f32>,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var oceanMap: texture_2d<f32>;
@group(0) @binding(2) var oceanSampler: sampler;
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
@vertex fn oceanVertex(@builtin(vertex_index) index: u32) -> VertexOut {
  let corners = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0),vec2<f32>(3.0,-1.0),vec2<f32>(-1.0,3.0));
  var vertexData: VertexOut;
  vertexData.position = vec4<f32>(corners[index],0.0,1.0);
  vertexData.uv = corners[index]*0.5 + vec2<f32>(0.5);
  return vertexData;
}
fn hash2(point: vec2<f32>) -> f32 {
  return fract(sin(dot(point,vec2<f32>(127.1,311.7))) * 43758.5453123);
}
fn noise2(point: vec2<f32>) -> f32 {
  let base = floor(point);
  let fracPart = fract(point);
  let smoothPart = fracPart*fracPart*(vec2<f32>(3.0)-2.0*fracPart);
  let a = hash2(base);
  let b = hash2(base+vec2<f32>(1.0,0.0));
  let c = hash2(base+vec2<f32>(0.0,1.0));
  let d = hash2(base+vec2<f32>(1.0,1.0));
  return mix(mix(a,b,smoothPart.x),mix(c,d,smoothPart.x),smoothPart.y);
}
fn skyColor(direction: vec3<f32>,sunDir: vec3<f32>) -> vec3<f32> {
  let upFactor = clamp(direction.y,0.0,1.0);
  let horizon = pow(1.0-upFactor,5.0);
  let upperBlue = vec3<f32>(0.085,0.22,0.40);
  let middleBlue = vec3<f32>(0.39,0.66,0.84);
  let nearHorizon = vec3<f32>(0.85,0.76,0.63);
  var sky = mix(middleBlue,upperBlue,pow(upFactor,0.65));
  sky = mix(sky,nearHorizon,horizon*0.78);
  let towardSun = max(dot(direction,sunDir),0.0);
  sky = sky + vec3<f32>(1.0,0.51,0.23) * pow(towardSun,25.0) * 0.31;
  sky = sky + vec3<f32>(1.0,0.72,0.42) * pow(towardSun,360.0) * 3.5;
  sky = sky + vec3<f32>(1.0,0.90,0.72) * smoothstep(0.99955,0.99985,towardSun) * 5.0;
  // Procedural elongated high cloud streaks in direction-space.
  let cloudCoord = vec2<f32>(direction.x*5.0+direction.z*0.9,direction.z*2.7+direction.y*7.0);
  let streak = noise2(cloudCoord*1.6) * 0.69 + noise2(cloudCoord*4.1)*0.31;
  let coverage = smoothstep(0.59,0.73,streak) * smoothstep(0.02,0.22,direction.y) * (1.0-smoothstep(0.58,0.84,direction.y));
  sky = mix(sky,vec3<f32>(0.87,0.88,0.86),coverage*0.30);
  return sky;
}
// Height + analytic derivatives in world metres.
fn waterProfile(positionXZ:vec2<f32>) -> vec3<f32> {
  let time = params.controls0.x * params.controls0.w;
  let energy = params.controls0.y;
  let dist = length(positionXZ);
  let nearFade = 1.0-smoothstep(63.0,185.0,dist);
  let uv = positionXZ/WORLD_SIZE + vec2<f32>(0.5);
  let gaussian = textureSampleLevel(oceanMap,oceanSampler,uv,0.0);
  var field = gaussian.xyz * nearFade;
  let phase0 = dot(positionXZ,vec2<f32>(0.092,0.125)) - time*0.68;
  let phase1 = dot(positionXZ,vec2<f32>(-0.173,0.079)) - time*1.02;
  let phase2 = dot(positionXZ,vec2<f32>(0.30,-0.185)) - time*1.45;
  let phase3 = dot(positionXZ,vec2<f32>(-0.041,-0.062)) - time*0.31;
  field = field + vec3<f32>(0.49*sin(phase0),0.49*0.092*cos(phase0),0.49*0.125*cos(phase0))*energy;
  field = field + vec3<f32>(0.235*sin(phase1),-0.235*0.173*cos(phase1),0.235*0.079*cos(phase1))*energy;
  field = field + vec3<f32>(0.09*sin(phase2),0.09*0.30*cos(phase2),-0.09*0.185*cos(phase2))*energy;
  field = field + vec3<f32>(0.33*sin(phase3),-0.33*0.041*cos(phase3),-0.33*0.062*cos(phase3))*energy;
  return field;
}
fn cameraRay(screenUV:vec2<f32>) -> vec3<f32> {
  let yawAngle = params.controls1.z;
  let pitchAngle = params.controls1.w;
  let forward = normalize(vec3<f32>(sin(yawAngle)*cos(pitchAngle),-sin(pitchAngle),-cos(yawAngle)*cos(pitchAngle)));
  let rightAxis = normalize(cross(forward,vec3<f32>(0.0,1.0,0.0)));
  let upAxis = cross(rightAxis,forward);
  let screen = screenUV * 2.0-vec2<f32>(1.0);
  let verticalFoV = tan(58.0 * PI/360.0);
  return normalize(forward + rightAxis*screen.x*params.controls2.y*verticalFoV + upAxis*screen.y*verticalFoV);
}
@fragment fn oceanFragment(input: VertexOut) -> @location(0) vec4<f32> {
  let ray = cameraRay(input.uv);
  let sunDirection = normalize(vec3<f32>(0.66,params.controls1.y,-0.74));
  let sky = skyColor(ray,sunDirection);
  let camHeight = params.controls2.x;
  if (ray.y >= -0.001) {
    let air = vec3<f32>(1.0)-exp(-sky*1.28);
    return vec4<f32>(pow(air,vec3<f32>(0.9)),1.0);
  }
  let maxHeight = 1.7 + params.controls0.y*1.75;
  var nearT = max(0.0,(camHeight-maxHeight)/(-ray.y));
  var farT = max(0.0,(camHeight+maxHeight)/(-ray.y));
  // At the extreme horizon, distance haze hides fine-scale intersection.
  if (nearT > 950.0) {
    let haze = vec3<f32>(0.47,0.66,0.76);
    return vec4<f32>(pow(vec3<f32>(1.0)-exp(-mix(sky,haze,0.34)*1.28),vec3<f32>(0.9)),1.0);
  }
  let origin = vec3<f32>(0.0,camHeight,0.0);
  for (var step = 0; step < 11; step = step+1) {
    let midpoint = (nearT+farT)*0.5;
    let probe = origin + ray*midpoint;
    let height = waterProfile(probe.xz).x;
    if (probe.y > height) { nearT = midpoint; }
    else { farT = midpoint; }
  }
  let distance = (nearT+farT)*0.5;
  let contact = origin+ray*distance;
  let water = waterProfile(contact.xz);
  let eyeDirection = -ray;
  let choppiness = params.controls0.z;
  let time = params.controls0.x*params.controls0.w;
  let microPhaseA = dot(contact.xz,vec2<f32>(3.27,2.06))-time*2.7;
  let microPhaseB = dot(contact.xz,vec2<f32>(-2.34,4.01))-time*3.1;
  let closeMicro = 1.0-smoothstep(22.0,145.0,distance);
  let microGrad = vec2<f32>(3.27,2.06)*cos(microPhaseA)*0.018 + vec2<f32>(-2.34,4.01)*cos(microPhaseB)*0.012;
  let gradient = water.yz*choppiness + microGrad*closeMicro;
  let normalDirection = normalize(vec3<f32>(-gradient.x,1.0,-gradient.y));
  let reflection = reflect(ray,normalDirection);
  let reflectedSky = skyColor(reflection,sunDirection);
  let facing = clamp(dot(normalDirection,eyeDirection),0.0,1.0);
  let fresnel = 0.02 + 0.98*pow(1.0-facing,5.0);
  let deepSea = vec3<f32>(0.007,0.105,0.139);
  let shallowSea = vec3<f32>(0.021,0.285,0.306);
  let translucence = clamp(0.25 + 0.38*normalDirection.y + 0.18*water.x,0.0,1.0);
  var waterColor = mix(deepSea,shallowSea,translucence);
  let skyReflection = mix(0.10,0.99,clamp(fresnel*1.15+0.05,0.0,1.0));
  waterColor = mix(waterColor,reflectedSky,skyReflection);
  let halfDir = normalize(eyeDirection+sunDirection);
  let sparkle = pow(max(dot(normalDirection,halfDir),0.0),235.0 / max(0.8,choppiness));
  let broadGlint = pow(max(dot(normalDirection,halfDir),0.0),32.0);
  waterColor = waterColor + vec3<f32>(2.8,1.57,0.72)*sparkle*0.85 + vec3<f32>(0.28,0.19,0.11)*broadGlint;
  let slope = length(gradient);
  let breaker = smoothstep(0.37,1.08,slope*1.7 + max(0.0,water.x)*0.29);
  let foamTexture = noise2(contact.xz*2.1 + vec2<f32>(time*0.22,time*0.13));
  var whitecap = breaker*smoothstep(0.22,0.88,foamTexture)*params.controls1.x;
  // CPU-side tap launches an actual Gaussian impulse in the wave solver.
  let recentSplash = step(0.0,params.controls3.x) * (1.0-smoothstep(1.0,3.5,params.controls3.x));
  let ringRadius = params.controls3.x*4.5;
  let ringDelta = (length(contact.xz-params.controls2.zw)-ringRadius)*1.2;
  let rippleRing = exp(-ringDelta*ringDelta)*0.5*recentSplash;
  whitecap = clamp(whitecap + rippleRing,0.0,0.94);
  waterColor = mix(waterColor,vec3<f32>(0.65,0.88,0.87),whitecap);
  let farFog = smoothstep(115.0,760.0,distance);
  let horizonTint = vec3<f32>(0.39,0.57,0.67);
  waterColor = mix(waterColor,horizonTint,farFog*0.84);
  if (params.controls3.z > 0.5) {
    let gaussianField = textureSampleLevel(oceanMap,oceanSampler,contact.xz/WORLD_SIZE+vec2<f32>(0.5),0.0);
    let density = clamp(gaussianField.w*1.1,0.0,1.0);
    let cold = vec3<f32>(0.04,0.17,0.30);
    let hot = vec3<f32>(0.28,0.93,0.73);
    waterColor = mix(waterColor,mix(cold,hot,density),0.74*(1.0-farFog));
  }
  let mapped = vec3<f32>(1.0)-exp(-max(waterColor,vec3<f32>(0.0))*1.42);
  return vec4<f32>(pow(mapped,vec3<f32>(0.90)),1.0);
}