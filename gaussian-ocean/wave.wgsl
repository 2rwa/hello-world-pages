// Gaussian packets drive a damped 2-D shallow-water height solver.
const RES: u32 = 192u;
const PCOUNT: i32 = 24;
const DOMAIN: f32 = 96.0;
struct Params {
  controls0: vec4<f32>, // time, energy, chop, wind
  controls1: vec4<f32>, // foam, sun, yaw, pitch
  controls2: vec4<f32>, // camera height, aspect, splash x, splash z
  controls3: vec4<f32>, // splash age, frame index, debug, unused
}
struct Packet {
  anchor: vec4<f32>, // x,z,direction x,z
  shape: vec4<f32>,  // amplitude, along sigma, across sigma, wavenumber
  motion: vec4<f32>, // angular speed, phase, drift, unused
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> gaussianPackets: array<Packet>;
@group(0) @binding(2) var<storage, read> previousWave: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> nextWave: array<vec4<f32>>;
@group(0) @binding(4) var outputMap: texture_storage_2d<rgba16float, write>;
fn wrappedOffset(value: f32) -> f32 { return value - round(value / DOMAIN) * DOMAIN; }
fn cellIndex(x: i32,z: i32) -> u32 {
  let xx = (x + i32(RES)) % i32(RES);
  let zz = (z + i32(RES)) % i32(RES);
  return u32(zz) * RES + u32(xx);
}
fn heightAt(x: i32,z: i32) -> f32 { return previousWave[cellIndex(x,z)].x; }
@compute @workgroup_size(8,8,1)
fn update(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= RES || gid.y >= RES) { return; }
  let x = i32(gid.x);
  let z = i32(gid.y);
  let uv = (vec2<f32>(f32(gid.x),f32(gid.y)) + vec2<f32>(0.5)) / f32(RES);
  let point = (uv - vec2<f32>(0.5)) * DOMAIN;
  let time = params.controls0.x;
  let windSpeed = params.controls0.w;
  var heightTarget = 0.0;
  var gaussianDensity = 0.0;
  let baseCell = vec2<i32>(floor((point + vec2<f32>(DOMAIN * 0.5)) / 4.0));
  for (var dz = -1; dz <= 1; dz = dz + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let ix = (baseCell.x + dx + PCOUNT) % PCOUNT;
      let iz = (baseCell.y + dz + PCOUNT) % PCOUNT;
      let packet = gaussianPackets[u32(iz * PCOUNT + ix)];
      let direction = packet.anchor.zw;
      let drift = packet.motion.z * sin(time * 0.22 * windSpeed + packet.motion.y);
      let center = packet.anchor.xy + direction * drift;
      let delta = vec2<f32>(wrappedOffset(point.x - center.x), wrappedOffset(point.y - center.y));
      let along = dot(delta,direction);
      let across = dot(delta,vec2<f32>(-direction.y,direction.x));
      let kernel = exp(-0.5 * (pow(along / packet.shape.y,2.0) + pow(across / packet.shape.z,2.0)));
      let carrier = cos(packet.shape.w * along - time * packet.motion.x * windSpeed + packet.motion.y);
      heightTarget = heightTarget + packet.shape.x * kernel * carrier;
      gaussianDensity = gaussianDensity + kernel * packet.shape.x;
    }
  }
  heightTarget = heightTarget * params.controls0.y;
  let index = gid.y * RES + gid.x;
  let oldState = previousWave[index];
  let prevHeight = oldState.x;
  let east = heightAt(x+1,z);
  let west = heightAt(x-1,z);
  let north = heightAt(x,z+1);
  let south = heightAt(x,z-1);
  let curvature = east + west + north + south - 4.0 * prevHeight;
  // Unitless fixed-step semi-implicit damped wave equation.
  let springForce = 0.42 * (heightTarget - prevHeight);
  let splashDistance = length(point - params.controls2.zw);
  var splashForce = 0.0;
  if (params.controls3.x >= 0.0 && params.controls3.x < 0.10) {
    splashForce = 0.65 * exp(-0.5 * pow(splashDistance/1.3,2.0));
  }
  var velocity = (oldState.y + (0.6 * curvature + springForce + splashForce) * 0.30) * 0.962;
  var height = prevHeight + velocity * 0.30;
  if (params.controls3.y < 1.0) { height = heightTarget; velocity = 0.0; }
  height = clamp(height, -4.5, 4.5);
  nextWave[index] = vec4<f32>(height,velocity,0.0,0.0);
  let gradientX = (east-west) * (0.5 / (DOMAIN/f32(RES)));
  let gradientZ = (north-south) * (0.5 / (DOMAIN/f32(RES)));
  textureStore(outputMap,vec2<i32>(x,z),vec4<f32>(height,gradientX,gradientZ,gaussianDensity));
}
