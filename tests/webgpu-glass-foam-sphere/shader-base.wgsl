struct UniformData {
  viewportData: vec4<f32>,
  bubbleData: vec4<f32>,
  cameraData: vec4<f32>,
  spareData: vec4<f32>,
};
@group(0) @binding(0) var<uniform> uniformData: UniformData;

struct VertexResult {
  @builtin(position) clipPosition: vec4<f32>,
};
struct HitResult {
  travel: f32,
  materialId: f32,
  hitFlag: f32,
  pad: f32,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexResult {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var resultValue: VertexResult;
  resultValue.clipPosition = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  return resultValue;
}

fn lerp3(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> { return a * (1.0 - t) + b * t; }
fn hash11(value: f32) -> f32 { return fract(sin(value * 127.1 + 311.7) * 43758.5453123); }
fn hash31(value: f32) -> vec3<f32> {
  return fract(sin(vec3<f32>(value * 17.1, value * 41.7, value * 93.3) + vec3<f32>(1.7, 9.2, 4.8)) * 43758.5453);
}
fn rotate2(value: vec2<f32>, angleValue: f32) -> vec2<f32> {
  let c = cos(angleValue);
  let s = sin(angleValue);
  return vec2<f32>(c * value.x - s * value.y, s * value.x + c * value.y);
}
fn sphereField(position: vec3<f32>, radiusValue: f32) -> f32 { return length(position) - radiusValue; }
