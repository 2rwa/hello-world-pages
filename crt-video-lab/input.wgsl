struct Params {
  dimensions: vec4f, optics: vec4f, analog: vec4f, signal: vec4f,
  grading: vec4f, geometry: vec4f, extras: vec4f, misc: vec4f
};
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var videoSampler: sampler;
@group(0) @binding(2) var videoTex: texture_external;

struct VertexResult { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vsMain(@builtin(vertex_index) vertexId: u32) -> VertexResult {
  let point = array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0))[vertexId];
  var vertexResult: VertexResult;
  vertexResult.position = vec4f(point,0.0,1.0);
  vertexResult.uv = point * vec2f(0.5,-0.5) + vec2f(0.5,0.5);
  return vertexResult;
}
fn hashNoise(point: vec2f) -> f32 {
  return fract(sin(dot(point,vec2f(127.1,311.7)))*43758.5453);
}
fn sampleVideo(sampleUv: vec2f) -> vec3f {
  let videoUv = vec2f(select(sampleUv.x,1.0-sampleUv.x,params.misc.y>0.5),sampleUv.y);
  return textureSampleBaseClampToEdge(videoTex,videoSampler,clamp(videoUv,vec2f(0.001),vec2f(0.999))).rgb;
}
struct FragmentResult { @location(0) affected: vec4f, @location(1) clean: vec4f };
@fragment fn fsMain(@location(0) uv: vec2f) -> FragmentResult {
  var fragmentResult: FragmentResult;
  let directColor = sampleVideo(uv);
  fragmentResult.clean = vec4f(directColor,1.0);

  let offsetXY = uv - vec2f(0.5);
  let bendAmount = params.optics.z;
  var warpedUv = offsetXY * (1.0 + bendAmount * dot(offsetXY,offsetXY) * 1.55);
  warpedUv = warpedUv * (1.0 - params.geometry.w * 0.13) + vec2f(0.5);
  let pictureTime = params.signal.w;
  let sourceLine = floor(warpedUv.y * params.dimensions.w);
  let lineNoise = hashNoise(vec2f(sourceLine * 0.17,floor(pictureTime * 23.0)));
  let lineWobble = sin(sourceLine * 0.058 + pictureTime * 14.3) * 0.55 + (lineNoise - 0.5);
  warpedUv.x += params.analog.z * lineWobble * 0.014;
  let tapeHeadSwitch = smoothstep(0.87,1.0,uv.y)*params.misc.z;
  warpedUv.x += tapeHeadSwitch*(0.025*sin(uv.y*330.0+pictureTime*12.0)+0.014);
  warpedUv.y += tapeHeadSwitch*0.018*sin(pictureTime*6.0);
  let syncBurst = step(0.992,hashNoise(vec2f(floor(pictureTime*3.0),floor(sourceLine*0.06))));
  warpedUv.x += syncBurst * params.analog.z * 0.018;

  let edgeDistance = max(abs(warpedUv.x-0.5),abs(warpedUv.y-0.5));
  if (edgeDistance > 0.5) {
    fragmentResult.affected = vec4f(0.0,0.0,0.0,1.0);
    return fragmentResult;
  }
  let aberration = vec2f(params.analog.x / params.dimensions.x * 3.0,0.0);
  var affectedColor = vec3f(
    sampleVideo(warpedUv + aberration).r,
    sampleVideo(warpedUv).g,
    sampleVideo(warpedUv - aberration).b
  );
  // NTSC-like horizontal chroma bandwidth limitation; preserve local luma.
  let smearStep = vec2f(params.signal.x * 3.5 / params.dimensions.x,0.0);
  let smearRgb = (sampleVideo(warpedUv-smearStep)+sampleVideo(warpedUv+smearStep))*0.5;
  let baseLuma = dot(affectedColor,vec3f(0.299,0.587,0.114));
  let smearLuma = dot(smearRgb,vec3f(0.299,0.587,0.114));
  affectedColor += (smearRgb - vec3f(smearLuma))*clamp(params.signal.x,0.0,1.0);
  let ghostColor = sampleVideo(warpedUv - vec2f(0.014,0.0));
  affectedColor = mix(affectedColor,ghostColor,params.analog.w*0.25);
  let staticNoise = hashNoise(floor(uv * params.dimensions.xy)+vec2f(floor(pictureTime*83.0),0.0))-0.5;
  let horizontalBand = sin(uv.y*params.dimensions.y*0.21+pictureTime*61.0);
  affectedColor += vec3f(staticNoise*params.analog.y*0.33+horizontalBand*params.signal.y*0.055);
  affectedColor *= 1.0-tapeHeadSwitch*0.26;
  let chromaLuma = dot(affectedColor,vec3f(0.2126,0.7152,0.0722));
  affectedColor = mix(vec3f(chromaLuma),affectedColor,params.grading.z);
  affectedColor = (affectedColor - vec3f(0.5))*params.grading.y+vec3f(0.5+params.grading.x);
  affectedColor = pow(max(affectedColor,vec3f(0.0)),vec3f(1.0/max(params.grading.w,0.2)));
  fragmentResult.affected = vec4f(clamp(affectedColor,vec3f(0.0),vec3f(1.0)),1.0);
  return fragmentResult;
}