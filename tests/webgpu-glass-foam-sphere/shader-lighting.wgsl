fn environmentColor(rayDirection: vec3<f32>) -> vec3<f32> {
  let skyFactor = clamp(rayDirection.y * 0.5 + 0.5, 0.0, 1.0);
  var colorValue = lerp3(vec3<f32>(0.018, 0.038, 0.048), vec3<f32>(0.31, 0.54, 0.58), skyFactor);
  let stripeA = pow(max(dot(rayDirection, normalize(vec3<f32>(-0.60, 0.34, -0.72))), 0.0), 90.0);
  let stripeB = pow(max(dot(rayDirection, normalize(vec3<f32>(0.62, 0.12, -0.77))), 0.0), 120.0);
  colorValue = colorValue + vec3<f32>(0.90, 1.0, 0.94) * stripeA * 1.8 + vec3<f32>(0.42, 0.78, 0.82) * stripeB;
  return colorValue;
}

fn fresnelSchlick(cosineValue: f32, etaI: f32, etaT: f32) -> f32 {
  let baseValue = (etaI - etaT) / (etaI + etaT);
  let r0 = baseValue * baseValue;
  return r0 + (1.0 - r0) * pow(1.0 - clamp(cosineValue, 0.0, 1.0), 5.0);
}

fn marchSphere(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> f32 {
  var travelDistance = 0.0;
  var marchIndex: i32 = 0;
  loop {
    if (marchIndex >= 96 || travelDistance > 8.0) { break; }
    let samplePosition = rayOrigin + rayDirection * travelDistance;
    let fieldValue = sphereField(samplePosition, 1.0);
    if (abs(fieldValue) < 0.0012) { return travelDistance; }
    travelDistance = travelDistance + max(abs(fieldValue) * 0.78, 0.002);
    marchIndex = marchIndex + 1;
  }
  return -1.0;
}

fn marchInternal(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, maxDistance: f32) -> HitResult {
  var travelDistance = 0.0;
  var marchIndex: i32 = 0;
  loop {
    if (marchIndex >= 90 || travelDistance > maxDistance) { break; }
    let samplePosition = rayOrigin + rayDirection * travelDistance;
    let fieldValue = internalField(samplePosition);
    if (fieldValue.x < 0.0014) {
      return HitResult(travelDistance, fieldValue.y, 1.0, 0.0);
    }
    travelDistance = travelDistance + max(fieldValue.x * 0.64, 0.0030);
    marchIndex = marchIndex + 1;
  }
  return HitResult(travelDistance, 0.0, 0.0, 0.0);
}

fn marchBubbleExit(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> f32 {
  var travelDistance = 0.0;
  var marchIndex: i32 = 0;
  loop {
    if (marchIndex >= 96 || travelDistance > 0.52) { break; }
    let samplePosition = rayOrigin + rayDirection * travelDistance;
    let fieldValue = bubbleField(samplePosition);
    if (travelDistance > 0.004 && fieldValue > -0.0012) {
      return travelDistance;
    }
    travelDistance = travelDistance + max(abs(fieldValue) * 0.72, 0.0015);
    marchIndex = marchIndex + 1;
  }
  return -1.0;
}

fn sphereExitDistance(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> f32 {
  let bValue = dot(rayOrigin, rayDirection);
  let cValue = dot(rayOrigin, rayOrigin) - 0.992 * 0.992;
  let discriminantValue = max(0.0, bValue * bValue - cValue);
  return max(0.0, -bValue + sqrt(discriminantValue));
}

fn sphereExitEnvironment(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, glassIor: f32) -> vec3<f32> {
  let exitDistance = sphereExitDistance(rayOrigin, rayDirection);
  let exitPosition = rayOrigin + rayDirection * exitDistance;
  let exitNormal = normalize(exitPosition);
  let airDirection = refract(rayDirection, -exitNormal, glassIor);
  let reflectedDirection = reflect(rayDirection, -exitNormal);
  if (length(airDirection) > 0.001) {
    return environmentColor(normalize(airDirection));
  }
  return environmentColor(normalize(reflectedDirection));
}
