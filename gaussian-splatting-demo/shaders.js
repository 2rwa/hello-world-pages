export const shader = /* wgsl */ `
struct Camera {
  eye: vec4f,
  rightDir: vec4f,
  upDir: vec4f,
  frontDir: vec4f,
  viewport: vec4f, // x=width px, y=height px, z=focal px, w=size multiplier
  effects: vec4f,  // x=opacity multiplier, y=point mode
};
struct Gaussian {
  center: vec4f,
  sigma: vec4f,
  rotation: vec4f,
  color: vec4f,
};
@group(0) @binding(0) var<uniform> frameData: Camera;
@group(0) @binding(1) var<storage, read> splatData: array<Gaussian>;
@group(0) @binding(2) var<storage, read> drawOrder: array<u32>;
struct Varyings {
  @builtin(position) clipPos: vec4f,
  @location(0) localPos: vec2f,
  @location(1) rgba: vec4f,
};
fn rotated(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
@vertex fn vs_main(@builtin(vertex_index) vertexIndex: u32,
                    @builtin(instance_index) instanceIndex: u32) -> Varyings {
  var out: Varyings;
  let g = splatData[drawOrder[instanceIndex]];
  let rel = g.center.xyz - frameData.eye.xyz;
  let pxCam = dot(rel, frameData.rightDir.xyz);
  let pyCam = dot(rel, frameData.upDir.xyz);
  let depthCam = dot(rel, frameData.frontDir.xyz);
  out.rgba = g.color;
  if (depthCam <= 0.08) {
    out.clipPos = vec4f(2.0, 2.0, 0.0, 1.0);
    out.localPos = vec2f(4.0, 4.0);
    return out;
  }
  let focal = frameData.viewport.z;
  let invZ = 1.0 / depthCam;
  let mid = vec2f(0.5 * frameData.viewport.x + focal * pxCam * invZ,
                  0.5 * frameData.viewport.y - focal * pyCam * invZ);
  var xx = 0.5;
  var xy = 0.0;
  var yy = 0.5;
  // Jacobian-projected covariance: Sigma_2D = J R S^2 R^T J^T
  for (var k = 0u; k < 3u; k = k + 1u) {
    var unitAxis = vec3f(0.0);
    var sigmaAxis = g.sigma.x;
    if (k == 0u) { unitAxis = vec3f(1.0, 0.0, 0.0); sigmaAxis = g.sigma.x; }
    if (k == 1u) { unitAxis = vec3f(0.0, 1.0, 0.0); sigmaAxis = g.sigma.y; }
    if (k == 2u) { unitAxis = vec3f(0.0, 0.0, 1.0); sigmaAxis = g.sigma.z; }
    let worldAxis = rotated(g.rotation, unitAxis) * sigmaAxis * frameData.viewport.w;
    let alongZ = dot(worldAxis, frameData.frontDir.xyz);
    let dx = focal * invZ * (dot(worldAxis, frameData.rightDir.xyz) - pxCam * invZ * alongZ);
    let dy = -focal * invZ * (dot(worldAxis, frameData.upDir.xyz) - pyCam * invZ * alongZ);
    xx = xx + dx * dx;
    xy = xy + dx * dy;
    yy = yy + dy * dy;
  }
  let theta = 0.5 * atan2(2.0 * xy, xx - yy);
  let cs = cos(theta);
  let sn = sin(theta);
  let delta = sqrt(max(0.0, (xx - yy) * (xx - yy) + 4.0 * xy * xy));
  var radiusMajor = min(150.0, 3.0 * sqrt(max(0.5, 0.5 * (xx + yy + delta))));
  var radiusMinor = min(150.0, 3.0 * sqrt(max(0.5, 0.5 * (xx + yy - delta))));
  if (frameData.effects.y > 0.5) { radiusMajor = 2.2; radiusMinor = 2.2; }
  // Two triangles with clockwise/counterclockwise independent of winding.
  var uv: vec2f;
  switch(vertexIndex) {
    case 0u: { uv = vec2f(-1.0, -1.0); }
    case 1u: { uv = vec2f( 1.0, -1.0); }
    case 2u: { uv = vec2f(-1.0,  1.0); }
    case 3u: { uv = vec2f(-1.0,  1.0); }
    case 4u: { uv = vec2f( 1.0, -1.0); }
    default: { uv = vec2f(1.0, 1.0); }
  }
  let major = vec2f(cs, sn) * radiusMajor;
  let minor = vec2f(-sn, cs) * radiusMinor;
  let screenPx = mid + major * uv.x + minor * uv.y;
  let ndc = vec2f(2.0 * screenPx.x / frameData.viewport.x - 1.0,
                  1.0 - 2.0 * screenPx.y / frameData.viewport.y);
  out.clipPos = vec4f(ndc, 0.5, 1.0);
  out.localPos = uv;
  return out;
}
@fragment fn fs_main(input: Varyings) -> @location(0) vec4f {
  let r2 = dot(input.localPos, input.localPos);
  let footprint = exp(-4.5 * r2);
  let strength = input.rgba.a * frameData.effects.x;
  let alphaVal = min(0.96, strength * footprint);
  if (alphaVal < 0.004) { discard; }
  return vec4f(input.rgba.rgb * alphaVal, alphaVal);
}
`;