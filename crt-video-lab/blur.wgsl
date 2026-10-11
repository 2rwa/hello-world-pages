struct BlurAxis { stepX: f32, stepY: f32, radius: f32, unused: f32 };
@group(0) @binding(0) var blurSampler: sampler;
@group(0) @binding(1) var sourceTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> blurAxis: BlurAxis;
struct VertexResult { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vsMain(@builtin(vertex_index) vertexId: u32) -> VertexResult {
  let point = array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0))[vertexId];
  var resultVertex: VertexResult;
  resultVertex.position = vec4f(point,0.0,1.0);
  resultVertex.uv = point*vec2f(0.5,-0.5)+vec2f(0.5,0.5);
  return resultVertex;
}
@fragment fn fsMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pixelStep = vec2f(blurAxis.stepX,blurAxis.stepY)*blurAxis.radius;
  var blended = textureSampleLevel(sourceTex,blurSampler,uv,0.0).rgb*0.227027;
  blended += textureSampleLevel(sourceTex,blurSampler,uv+pixelStep*1.384615,0.0).rgb*0.316216;
  blended += textureSampleLevel(sourceTex,blurSampler,uv-pixelStep*1.384615,0.0).rgb*0.316216;
  blended += textureSampleLevel(sourceTex,blurSampler,uv+pixelStep*3.230769,0.0).rgb*0.070270;
  blended += textureSampleLevel(sourceTex,blurSampler,uv-pixelStep*3.230769,0.0).rgb*0.070270;
  return vec4f(blended,1.0);
}