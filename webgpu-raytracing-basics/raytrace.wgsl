// 第6章 WebGPU: 解析的な球・平面の交差を各画素で並列計算する。
// WebGPUにハードウェアRTパイプラインを要求せず、Compute Shaderでソフトウェア交差判定。
// CPU版の scene: 中心 (-0.72,-0.20,3.5), (1.04,-0.50,5.1), ground y=-1.26.
struct CameraParams {
  dimensions: vec2u,
  yawRadians: f32,
  maxReflections: u32,
  shadowsOn: u32,
  brightness: f32,
  reserved: vec2u,
};
@group(0) @binding(0) var<uniform> cameraParams: CameraParams;
@group(0) @binding(1) var gpuImage: texture_storage_2d<rgba8unorm, write>;

struct RayHit {
  distance: f32,
  surfaceIndex: i32,
};

fn sphereCenter(sphereIndex: i32) -> vec3f {
  if (sphereIndex == 0) { return vec3f(-0.72, -0.20, 3.5); }
  return vec3f(1.04, -0.50, 5.1);
}
fn sphereRadius(sphereIndex: i32) -> f32 {
  if (sphereIndex == 0) { return 0.99; }
  return 0.75;
}
fn sphereColor(sphereIndex: i32) -> vec3f {
  if (sphereIndex == 0) { return vec3f(0.243, 0.804, 0.929); }
  return vec3f(1.0, 0.702, 0.373);
}

fn intersectSphere(rayOrigin: vec3f, rayDirection: vec3f, centerPos: vec3f, sphereSize: f32) -> f32 {
  let sphereOffset = rayOrigin - centerPos;
  let halfLinear = dot(sphereOffset, rayDirection);
  let quadraticOffset = dot(sphereOffset, sphereOffset) - sphereSize * sphereSize;
  let discriminant = halfLinear * halfLinear - quadraticOffset;
  if (discriminant < 0.0) { return 1.0e9; }
  let rootDistance = sqrt(discriminant);
  let nearDistance = -halfLinear - rootDistance;
  let farDistance = -halfLinear + rootDistance;
  if (nearDistance > 0.0001) { return nearDistance; }
  if (farDistance > 0.0001) { return farDistance; }
  return 1.0e9;
}

fn closestIntersection(rayOrigin: vec3f, rayDirection: vec3f) -> RayHit {
  var chosenDistance = 1.0e9;
  var chosenIndex = -1;
  if (abs(rayDirection.y) > 0.000001) {
    let planeDistance = (-1.26 - rayOrigin.y) / rayDirection.y;
    if (planeDistance > 0.0001 && planeDistance < chosenDistance) {
      chosenDistance = planeDistance;
      chosenIndex = 2;
    }
  }
  for (var sphereIndex = 0; sphereIndex < 2; sphereIndex = sphereIndex + 1) {
    let sphereDistance = intersectSphere(
      rayOrigin, rayDirection, sphereCenter(sphereIndex), sphereRadius(sphereIndex)
    );
    if (sphereDistance < chosenDistance) {
      chosenDistance = sphereDistance;
      chosenIndex = sphereIndex;
    }
  }
  if (chosenDistance > 30.0) { return RayHit(1.0e9, -1); }
  return RayHit(chosenDistance, chosenIndex);
}

fn skyColor(rayDirection: vec3f) -> vec3f {
  let gradient = clamp((rayDirection.y + 0.15) * 0.8, 0.0, 1.0);
  return vec3f(0.047, 0.11, 0.204) * (1.0 - gradient) + vec3f(0.121, 0.231, 0.357) * gradient;
}

fn surfaceNormal(pointPos: vec3f, surfaceIndex: i32) -> vec3f {
  if (surfaceIndex == 2) { return vec3f(0.0, 1.0, 0.0); }
  return normalize(pointPos - sphereCenter(surfaceIndex));
}
fn materialColor(surfaceIndex: i32) -> vec3f {
  if (surfaceIndex == 2) { return vec3f(0.498, 0.580, 0.718); }
  return sphereColor(surfaceIndex);
}
fn materialReflectivity(surfaceIndex: i32) -> f32 {
  if (surfaceIndex == 0) { return 0.68; }
  if (surfaceIndex == 1) { return 0.24; }
  return 0.18;
}

fn castRays(startOrigin: vec3f, startDirection: vec3f) -> vec3f {
  var currentOrigin = startOrigin;
  var currentDirection = startDirection;
  var radianceSum = vec3f(0.0);
  var throughput = vec3f(1.0);
  let sunDirection = normalize(vec3f(-0.55, 0.82, -0.35));

  // 反射を明示的な上限のあるループで追跡（再帰は使用しない）。
  for (var bounceIndex = 0u; bounceIndex < 4u; bounceIndex = bounceIndex + 1u) {
    let rayHit = closestIntersection(currentOrigin, currentDirection);
    if (rayHit.surfaceIndex < 0) {
      radianceSum = radianceSum + throughput * skyColor(currentDirection);
      break;
    }

    let surfacePoint = currentOrigin + rayHit.distance * currentDirection;
    let normalVector = surfaceNormal(surfacePoint, rayHit.surfaceIndex);
    let lambertFactor = max(dot(normalVector, sunDirection), 0.0);
    var illumination = 0.20 + 0.80 * lambertFactor;

    if (cameraParams.shadowsOn != 0u && lambertFactor > 0.0) {
      // 法線方向へ僅かにずらして自己交差を減らす。
      let shadowOrigin = surfacePoint + normalVector * 0.004;
      let shadowHit = closestIntersection(shadowOrigin, sunDirection);
      if (shadowHit.surfaceIndex >= 0) {
        illumination = 0.20 + 0.16 * lambertFactor;
      }
    }

    let localColor = materialColor(rayHit.surfaceIndex) * illumination;
    var reflectivity = materialReflectivity(rayHit.surfaceIndex);
    if (bounceIndex >= cameraParams.maxReflections) { reflectivity = 0.0; }
    radianceSum = radianceSum + throughput * localColor * (1.0 - reflectivity);
    if (reflectivity <= 0.0) { break; }
    throughput = throughput * reflectivity;
    currentOrigin = surfacePoint + normalVector * 0.004;
    currentDirection = normalize(reflect(currentDirection, normalVector));
  }
  return radianceSum;
}

@compute @workgroup_size(8, 8, 1)
fn tracePixels(@builtin(global_invocation_id) pixelIndex: vec3u) {
  if (pixelIndex.x >= cameraParams.dimensions.x || pixelIndex.y >= cameraParams.dimensions.y) {
    return;
  }
  let viewWidth = f32(cameraParams.dimensions.x);
  let viewHeight = f32(cameraParams.dimensions.y);
  // YはCanvasと同じ「上が0」。Computeと表示シェーダーの両方で反転しない。
  let fovScale = tan(55.0 * 3.141592653589793 / 360.0);
  let xView = (2.0 * (f32(pixelIndex.x) + 0.5) / viewWidth - 1.0) * (viewWidth / viewHeight) * fovScale;
  let yView = (1.0 - 2.0 * (f32(pixelIndex.y) + 0.5) / viewHeight) * fovScale;
  let cosYaw = cos(cameraParams.yawRadians);
  let sinYaw = sin(cameraParams.yawRadians);
  let rayDirection = normalize(vec3f(xView * cosYaw + sinYaw, yView, -xView * sinYaw + cosYaw));
  let outputColor = clamp(
    castRays(vec3f(0.0, 0.15, -4.5), rayDirection) * cameraParams.brightness,
    vec3f(0.0), vec3f(1.0)
  );
  textureStore(gpuImage, vec2i(pixelIndex.xy), vec4f(outputColor, 1.0));
}

