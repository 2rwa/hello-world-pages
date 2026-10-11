// Gaussian PDE Field — WGSL shader, no external libraries.
export const shader = /* wgsl */ `
struct Settings {
  viewProj: mat4x4<f32>,
  viewRight: vec4<f32>,
  viewUp: vec4<f32>,
  timeAndMode: vec4<f32>,  // time, count, mode, diffusion
  shape: vec4<f32>,        // sigma, height, wave speed, angular speed
  visual: vec4<f32>,       // contour, glow, palette, grid
  extras: vec4<f32>,       // particle size, particle lift, unused, unused
};
@group(0) @binding(0) var<uniform> state: Settings;
const PI: f32 = 3.14159265359;
const TILE_SIZE: u32 = 144u;
const QUAD_CORNER = array<vec2<f32>, 6>(
  vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
  vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0)
);
fn hashFloat(seedValue: f32) -> f32 {
  return fract(sin(seedValue * 127.1 + 13.31) * 43758.5453);
}
fn ellipseField(loc: vec2<f32>) -> vec3<f32> {
  var res = vec3<f32>(0.0);
  let t = state.timeAndMode.x;
  let count = u32(state.timeAndMode.y);
  let mode = u32(state.timeAndMode.z);
  let diffusion = state.timeAndMode.w;
  let initialWidth = max(state.shape.x, 0.06);
  let intensityScale = 1.0 / sqrt(0.75 + f32(count) * 0.18);
  for (var blobIdx: u32 = 0u; blobIdx < 100u; blobIdx = blobIdx + 1u) {
    if (blobIdx >= count) { break; }
    let fi = f32(blobIdx);
    let polarAngle = 2.0 * PI * hashFloat(fi + 0.32);
    let radialScale = 0.45 + 2.7 * sqrt(hashFloat(fi + 7.5));
    var centerPos = vec2<f32>(cos(polarAngle), sin(polarAngle)) * radialScale;
    if (blobIdx == 0u) { centerPos = vec2<f32>(0.0); }
    let initialSigma = initialWidth * (0.75 + 0.6 * hashFloat(fi + 17.2));
    let initialVariance = initialSigma * initialSigma;
    let strength = select(0.44 + 0.55 * hashFloat(fi + 4.3), 2.0, blobIdx == 0u) * intensityScale;
    if (mode == 2u) {
      let direction = vec2<f32>(cos(polarAngle), sin(polarAngle));
      let offset = dot(loc, direction) - dot(centerPos, direction) * 0.45;
      let pulseSpeed = state.shape.z * t;
      let frequency = 3.0 / initialSigma;
      let leftQ = offset - pulseSpeed;
      let rightQ = offset + pulseSpeed;
      let leftE = exp(-0.5 * leftQ * leftQ / initialVariance);
      let rightE = exp(-0.5 * rightQ * rightQ / initialVariance);
      let leftF = leftE * cos(frequency * leftQ);
      let rightF = rightE * cos(frequency * rightQ);
      let leftD = leftE * (-leftQ / initialVariance * cos(frequency * leftQ) - frequency * sin(frequency * leftQ));
      let rightD = rightE * (-rightQ / initialVariance * cos(frequency * rightQ) - frequency * sin(frequency * rightQ));
      res += strength * 0.5 * vec3<f32>(leftF + rightF, direction * (leftD + rightD));
    } else {
      if (mode == 1u) {
        let rotationAngle = state.shape.w * t;
        let ca = cos(rotationAngle);
        let sa = sin(rotationAngle);
        centerPos = vec2<f32>(ca * centerPos.x - sa * centerPos.y, sa * centerPos.x + ca * centerPos.y);
      }
      let delta = loc - centerPos;
      let variance = initialVariance + 2.0 * diffusion * t;
      let mass = strength * initialVariance / variance;
      let density = mass * exp(-0.5 * dot(delta, delta) / variance);
      res += vec3<f32>(density, -density * delta / variance);
    }
  }
  return res;
}
fn transformedPoint(wp: vec3<f32>) -> vec4<f32> {
  return state.viewProj * vec4<f32>(wp, 1.0);
}
struct SurfaceVaryings {
  @builtin(position) position: vec4<f32>,
  @location(0) @interpolate(perspective) worldPos: vec3<f32>,
  @location(1) @interpolate(perspective) worldNormal: vec3<f32>,
  @location(2) @interpolate(perspective) density: f32,
};
@vertex fn surfaceVertex(@builtin(vertex_index) index: u32) -> SurfaceVaryings {
  let cellIdx = index / 6u;
  let xCell = cellIdx % TILE_SIZE;
  let zCell = cellIdx / TILE_SIZE;
  let offset = QUAD_CORNER[index % 6u];
  let horizontal = (vec2<f32>(f32(xCell), f32(zCell)) + offset) / f32(TILE_SIZE);
  let coord = (horizontal - 0.5) * 9.0;
  let field = ellipseField(coord);
  let world = vec3<f32>(coord.x, field.x * state.shape.y * 0.95, coord.y);
  let normalVec = normalize(vec3<f32>(-field.y * state.shape.y * 0.95, 1.0, -field.z * state.shape.y * 0.95));
  var v: SurfaceVaryings;
  v.position = transformedPoint(world);
  v.worldPos = world;
  v.worldNormal = normalVec;
  v.density = field.x;
  return v;
}
fn colorPalette(paletteIndex: f32, fieldValue: f32) -> vec3<f32> {
  let strength = clamp(abs(fieldValue) * 1.3, 0.0, 1.0);
  if (paletteIndex < 0.5) {
    return mix(vec3<f32>(0.025, 0.16, 0.3), vec3<f32>(0.16, 0.94, 1.0), strength);
  }
  if (paletteIndex < 1.5) {
    return mix(vec3<f32>(0.18, 0.045, 0.30), vec3<f32>(1.0, 0.25, 0.73), strength);
  }
  return mix(vec3<f32>(0.05, 0.21, 0.17), vec3<f32>(0.83, 1.0, 0.27), strength);
}
@fragment fn surfaceFragment(v: SurfaceVaryings) -> @location(0) vec4<f32> {
  let gradient = normalize(v.worldNormal);
  let lit = 0.30 + 0.70 * max(dot(gradient, normalize(vec3<f32>(0.4, 1.0, 0.5))), 0.0);
  let rimLight = pow(1.0 - clamp(dot(gradient, normalize(vec3<f32>(0.15, 0.9, 0.15))), 0.0, 1.0), 2.6);
  let curvePhase = v.density * 13.0;
  let contourAA = fwidth(curvePhase);
  let contour = (1.0 - smoothstep(0.0, 0.095 + contourAA, abs(sin(curvePhase * PI)))) * state.visual.x;
  let gx = v.worldPos.x * 4.0 * PI;
  let gz = v.worldPos.z * 4.0 * PI;
  let gridAAx = fwidth(gx);
  let gridAAz = fwidth(gz);
  let gridAlpha = max(1.0 - smoothstep(0.0, 0.03 + gridAAx, abs(sin(gx))),
                      1.0 - smoothstep(0.0, 0.03 + gridAAz, abs(sin(gz)))) * state.visual.w;
  let basicColor = colorPalette(state.visual.z, v.density);
  let baseGlow = 0.14 + 0.72 * lit;
  let glowColor = basicColor * (baseGlow + contour * (1.0 + state.visual.y * 0.9) + 0.24 * rimLight);
  let finalColor = glowColor + gridAlpha * vec3<f32>(0.07, 0.22, 0.32);
  return vec4<f32>(finalColor, 1.0);
}
struct FullScreenOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn skyVertex(@builtin(vertex_index) vid: u32) -> FullScreenOut {
  let coords = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var output: FullScreenOut;
  let pos = coords[vid];
  output.position = vec4<f32>(pos, 0.99999, 1.0);
  output.uv = pos * vec2<f32>(0.5, -0.5) + 0.5;
  return output;
}
@fragment fn skyFragment(v: FullScreenOut) -> @location(0) vec4<f32> {
  let p = v.uv;
  let spot = exp(-dot((p - vec2<f32>(0.5, 0.60)) * vec2<f32>(1.35, 0.9),
                      (p - vec2<f32>(0.5, 0.60)) * vec2<f32>(1.35, 0.9)) * 5.0);
  var col = mix(vec3<f32>(0.003, 0.008, 0.026), vec3<f32>(0.020, 0.039, 0.084), spot);
  let giantArc = sin(p.x * 14.0 + sin(p.y * 5.0) - state.timeAndMode.x * 0.08);
  col += vec3<f32>(0.011, 0.028, 0.042) * max(0.0, giantArc) * spot;
  let cell = floor(p * vec2<f32>(800.0, 500.0));
  let spark = hashFloat(cell.x * 0.27 + cell.y * 22.7);
  let brightStar = pow(step(0.9976, spark) * hashFloat(cell.y + cell.x * 5.4), 6.0);
  col += vec3<f32>(0.30, 0.48, 0.72) * brightStar;
  return vec4<f32>(col, 1.0);
}
struct DustVaryings {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) tint: vec3<f32>,
};
@vertex fn dustVertex(@builtin(vertex_index) vertexId: u32, @builtin(instance_index) particleIdx: u32) -> DustVaryings {
  let fi = f32(particleIdx);
  let xPos = (hashFloat(fi + 201.3) * 2.0 - 1.0) * 4.25;
  let zPos = (hashFloat(fi + 880.2) * 2.0 - 1.0) * 4.25;
  let fieldSample = ellipseField(vec2<f32>(xPos, zPos));
  let hover = (0.1 + hashFloat(fi + 87.8) * state.extras.y) +
              0.12 * sin(fi * 0.9 + state.timeAndMode.x * 1.6);
  let center = vec3<f32>(xPos, fieldSample.x * state.shape.y * 0.95 + hover, zPos);
  let uv = QUAD_CORNER[vertexId] * 2.0 - 1.0;
  let radius = state.extras.x * (0.5 + hashFloat(fi + 77.0));
  let wp = center + (state.viewRight.xyz * uv.x + state.viewUp.xyz * uv.y) * radius;
  var v: DustVaryings;
  v.position = transformedPoint(wp);
  v.uv = uv;
  v.tint = colorPalette(state.visual.z, max(0.25, fieldSample.x));
  return v;
}
@fragment fn dustFragment(v: DustVaryings) -> @location(0) vec4<f32> {
  let r2 = dot(v.uv, v.uv);
  let flare = exp(-r2 * 7.0) * 0.66;
  let core = exp(-r2 * 32.0);
  return vec4<f32>(v.tint * (flare + core), 1.0);
}
`;
