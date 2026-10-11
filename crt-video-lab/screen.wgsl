struct Params {
  dimensions: vec4f, optics: vec4f, analog: vec4f, signal: vec4f,
  grading: vec4f, geometry: vec4f, extras: vec4f, misc: vec4f
};
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var affectedTex: texture_2d<f32>;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
@group(0) @binding(3) var previousTex: texture_2d<f32>;
@group(0) @binding(4) var cleanTex: texture_2d<f32>;
@group(0) @binding(5) var screenSampler: sampler;
struct VertexResult { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vsMain(@builtin(vertex_index) vertexId: u32) -> VertexResult {
  let point = array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0))[vertexId];
  var resultVertex: VertexResult;
  resultVertex.position=vec4f(point,0.0,1.0);
  resultVertex.uv=point*vec2f(0.5,-0.5)+vec2f(0.5,0.5);
  return resultVertex;
}
struct FragmentResult { @location(0) visible: vec4f, @location(1) memory: vec4f };
@fragment fn fsMain(@location(0) uv: vec2f) -> FragmentResult {
  let sceneRgb = textureSampleLevel(affectedTex,screenSampler,uv,0.0).rgb;
  let glowRgb = textureSampleLevel(bloomTex,screenSampler,uv,0.0).rgb;
  let oldRgb = textureSampleLevel(previousTex,screenSampler,uv,0.0).rgb;
  let cleanRgb = textureSampleLevel(cleanTex,screenSampler,uv,0.0).rgb;
  var filteredRgb = sceneRgb + max(glowRgb-sceneRgb,vec3f(0.0))*params.optics.w*1.5;
  let scanCount = max(params.geometry.z,1.0);
  let beamDistance = abs(fract(uv.y*scanCount)-0.5)*2.0;
  let beamPower = pow(max(0.0,1.0-beamDistance),max(0.3,params.extras.z));
  let scanning = mix(1.0,0.34+0.66*beamPower,params.optics.x);
  filteredRgb *= scanning;
  let cellSize = max(1.0,params.geometry.x);
  let fractionalCell = fract((uv.x*params.dimensions.x)/cellSize);
  let rgbCell = i32(floor(fractionalCell*3.0));
  var maskRgb = vec3f(0.68);
  if (rgbCell == 0) { maskRgb.r = 1.0; }
  if (rgbCell == 1) { maskRgb.g = 1.0; }
  if (rgbCell == 2) { maskRgb.b = 1.0; }
  if (params.geometry.y > 1.5) {
    let slotRow = floor(uv.y*params.dimensions.y/max(1.0,cellSize*2.0));
    let notch = fract(slotRow*0.5);
    let slotEdge = smoothstep(0.0,0.12,fractionalCell)*(1.0-smoothstep(0.88,1.0,fractionalCell));
    maskRgb *= mix(0.78,1.0,slotEdge) * mix(0.82,1.0,notch);
  }
  if (params.geometry.y < 0.5) { maskRgb = vec3f(1.0); }
  filteredRgb *= mix(vec3f(1.0),maskRgb,params.optics.y);
  let tubeRadius = length((uv-vec2f(0.5))*vec2f(1.0,1.08));
  let edgeShade = 1.0 - clamp(tubeRadius*tubeRadius*2.6*params.extras.y,0.0,0.9);
  filteredRgb *= edgeShade;
  let flickerWave = sin(params.signal.w*120.0+uv.y*6.28)*0.025*params.extras.w;
  filteredRgb *= 1.0 + flickerWave;
  let persistenceFactor = clamp(params.signal.z*0.93,0.0,0.96);
  let phosphorRgb = max(filteredRgb,oldRgb*persistenceFactor);
  let originalRatio = params.misc.x;
  let finalRgb = select(phosphorRgb,cleanRgb,uv.x < originalRatio);
  var fragmentResult: FragmentResult;
  fragmentResult.visible=vec4f(clamp(finalRgb,vec3f(0.0),vec3f(1.0)),1.0);
  fragmentResult.memory=vec4f(clamp(filteredRgb + max(oldRgb*persistenceFactor-filteredRgb,vec3f(0.0)),vec3f(0.0),vec3f(1.0)),1.0);
  return fragmentResult;
}