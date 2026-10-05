struct UniformData {
  viewportData: vec4<f32>,
  controlData: vec4<f32>,
  cameraData: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniformData: UniformData;

struct VertexResult {
  @builtin(position) clipPosition: vec4<f32>,
};

struct MarchResult {
  rayDistance: f32,
  hitFlag: f32,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexResult {
  var trianglePositions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var resultValue: VertexResult;
  resultValue.clipPosition = vec4<f32>(trianglePositions[vertexIndex], 0.0, 1.0);
  return resultValue;
}

fn lerp3(firstValue: vec3<f32>, secondValue: vec3<f32>, blendValue: f32) -> vec3<f32> {
  return firstValue * (1.0 - blendValue) + secondValue * blendValue;
}

fn rotate2(vectorValue: vec2<f32>, angleValue: f32) -> vec2<f32> {
  let cosineValue = cos(angleValue);
  let sineValue = sin(angleValue);
  return vec2<f32>(
    cosineValue * vectorValue.x - sineValue * vectorValue.y,
    sineValue * vectorValue.x + cosineValue * vectorValue.y
  );
}

fn inverseWarp(worldPosition: vec3<f32>) -> vec3<f32> {
  var warpedPosition = worldPosition;
  let modeValue = uniformData.controlData.x;
  let amountValue = uniformData.controlData.y;
  let frequencyValue = uniformData.controlData.z;
  let timeValue = uniformData.viewportData.z;

  if (modeValue > 0.5 && modeValue < 1.5) {
    let twistAngle = -amountValue * warpedPosition.z * 1.45;
    let rotatedXY = rotate2(warpedPosition.xy, twistAngle);
    warpedPosition = vec3<f32>(rotatedXY.x, rotatedXY.y, warpedPosition.z);
  } else if (modeValue > 1.5 && modeValue < 2.5) {
    let bendAngle = -amountValue * warpedPosition.x * 0.72;
    let rotatedXZ = rotate2(warpedPosition.xz, bendAngle);
    warpedPosition = vec3<f32>(
      rotatedXZ.x,
      warpedPosition.y,
      rotatedXZ.y + 0.10 * amountValue * rotatedXZ.x * rotatedXZ.x
    );
  } else if (modeValue > 2.5 && modeValue < 3.5) {
    let taperScale = max(0.34, 1.0 + amountValue * warpedPosition.z * 0.42);
    warpedPosition = vec3<f32>(
      warpedPosition.x / taperScale,
      warpedPosition.y / taperScale,
      warpedPosition.z
    );
  } else if (modeValue > 3.5 && modeValue < 4.5) {
    warpedPosition = vec3<f32>(
      warpedPosition.x - amountValue * warpedPosition.z * 0.58,
      warpedPosition.y,
      warpedPosition.z
    );
  } else if (modeValue > 4.5 && modeValue < 5.5) {
    let localWeight = exp(-4.2 * warpedPosition.z * warpedPosition.z);
    let stretchScale = max(0.34, 1.0 + amountValue * 0.52 * localWeight);
    warpedPosition = vec3<f32>(
      warpedPosition.x / max(0.42, 1.0 + amountValue * 0.18 * localWeight),
      warpedPosition.y / stretchScale,
      warpedPosition.z
    );
  } else if (modeValue > 5.5) {
    let warpMagnitude = amountValue * 0.115;
    let phaseValue = timeValue * 0.55;
    warpedPosition = warpedPosition + warpMagnitude * vec3<f32>(
      sin(frequencyValue * warpedPosition.y + phaseValue),
      sin(frequencyValue * warpedPosition.z + phaseValue * 1.31 + 1.7),
      sin(frequencyValue * warpedPosition.x - phaseValue * 0.83 + 3.1)
    );
  }
  return warpedPosition;
}

fn ellipsoidField(localPosition: vec3<f32>, radiiValue: vec3<f32>) -> f32 {
  let scaledLength = length(localPosition / radiiValue);
  return (scaledLength - 1.0) * min(radiiValue.x, min(radiiValue.y, radiiValue.z));
}

fn outerField(worldPosition: vec3<f32>) -> f32 {
  let localPosition = inverseWarp(worldPosition);
  return ellipsoidField(localPosition, vec3<f32>(1.00, 0.91, 1.08));
}

fn innerField(worldPosition: vec3<f32>) -> f32 {
  let localPosition = inverseWarp(worldPosition);
  return ellipsoidField(localPosition, vec3<f32>(0.78, 0.70, 0.84));
}

fn refineOuterRoot(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, nearDistance: f32, farDistance: f32) -> f32 {
  var lowDistance = nearDistance;
  var highDistance = farDistance;
  var lowField = outerField(rayOrigin + rayDirection * lowDistance);
  var refineIndex: i32 = 0;
  loop {
    if (refineIndex >= 10) { break; }
    let middleDistance = 0.5 * (lowDistance + highDistance);
    let middleField = outerField(rayOrigin + rayDirection * middleDistance);
    if (lowField * middleField <= 0.0) {
      highDistance = middleDistance;
    } else {
      lowDistance = middleDistance;
      lowField = middleField;
    }
    refineIndex = refineIndex + 1;
  }
  return 0.5 * (lowDistance + highDistance);
}

fn refineInnerRoot(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, nearDistance: f32, farDistance: f32) -> f32 {
  var lowDistance = nearDistance;
  var highDistance = farDistance;
  var lowField = innerField(rayOrigin + rayDirection * lowDistance);
  var refineIndex: i32 = 0;
  loop {
    if (refineIndex >= 10) { break; }
    let middleDistance = 0.5 * (lowDistance + highDistance);
    let middleField = innerField(rayOrigin + rayDirection * middleDistance);
    if (lowField * middleField <= 0.0) {
      highDistance = middleDistance;
    } else {
      lowDistance = middleDistance;
      lowField = middleField;
    }
    refineIndex = refineIndex + 1;
  }
  return 0.5 * (lowDistance + highDistance);
}

fn marchOuter(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> MarchResult {
  var travelDistance = 0.0;
  var previousDistance = 0.0;
  var previousField = outerField(rayOrigin);
  var marchIndex: i32 = 0;
  loop {
    if (marchIndex >= 180 || travelDistance > 8.0) { break; }
    let samplePosition = rayOrigin + rayDirection * travelDistance;
    let fieldValue = outerField(samplePosition);
    if (abs(fieldValue) < 0.0014) {
      return MarchResult(travelDistance, 1.0);
    }
    if (marchIndex > 0 && fieldValue * previousField < 0.0) {
      return MarchResult(refineOuterRoot(rayOrigin, rayDirection, previousDistance, travelDistance), 1.0);
    }
    previousDistance = travelDistance;
    previousField = fieldValue;
    travelDistance = travelDistance + max(abs(fieldValue) * 0.46, 0.0025);
    marchIndex = marchIndex + 1;
  }
  return MarchResult(travelDistance, 0.0);
}

fn marchInner(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> MarchResult {
  var travelDistance = 0.0;
  var previousDistance = 0.0;
  var previousField = innerField(rayOrigin);
  var marchIndex: i32 = 0;
  loop {
    if (marchIndex >= 150 || travelDistance > 3.2) { break; }
    let samplePosition = rayOrigin + rayDirection * travelDistance;
    let fieldValue = innerField(samplePosition);
    if (abs(fieldValue) < 0.0013) {
      return MarchResult(travelDistance, 1.0);
    }
    if (marchIndex > 0 && fieldValue * previousField < 0.0) {
      return MarchResult(refineInnerRoot(rayOrigin, rayDirection, previousDistance, travelDistance), 1.0);
    }
    previousDistance = travelDistance;
    previousField = fieldValue;
    travelDistance = travelDistance + max(abs(fieldValue) * 0.48, 0.0022);
    marchIndex = marchIndex + 1;
  }
  return MarchResult(travelDistance, 0.0);
}

fn outerNormal(worldPosition: vec3<f32>) -> vec3<f32> {
  let epsilonValue = 0.0022;
  let axisX = vec3<f32>(epsilonValue, 0.0, 0.0);
  let axisY = vec3<f32>(0.0, epsilonValue, 0.0);
  let axisZ = vec3<f32>(0.0, 0.0, epsilonValue);
  return normalize(vec3<f32>(
    outerField(worldPosition + axisX) - outerField(worldPosition - axisX),
    outerField(worldPosition + axisY) - outerField(worldPosition - axisY),
    outerField(worldPosition + axisZ) - outerField(worldPosition - axisZ)
  ));
}

fn innerNormal(worldPosition: vec3<f32>) -> vec3<f32> {
  let epsilonValue = 0.0020;
  let axisX = vec3<f32>(epsilonValue, 0.0, 0.0);
  let axisY = vec3<f32>(0.0, epsilonValue, 0.0);
  let axisZ = vec3<f32>(0.0, 0.0, epsilonValue);
  return normalize(vec3<f32>(
    innerField(worldPosition + axisX) - innerField(worldPosition - axisX),
    innerField(worldPosition + axisY) - innerField(worldPosition - axisY),
    innerField(worldPosition + axisZ) - innerField(worldPosition - axisZ)
  ));
}

fn environmentColor(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> vec3<f32> {
  let skyFactor = clamp(rayDirection.y * 0.5 + 0.5, 0.0, 1.0);
  var colorValue = lerp3(vec3<f32>(0.08, 0.075, 0.07), vec3<f32>(0.46, 0.57, 0.62), skyFactor);
  if (rayDirection.y < -0.0001) {
    let groundDistance = (-1.62 - rayOrigin.y) / rayDirection.y;
    if (groundDistance > 0.0) {
      let groundPosition = rayOrigin + rayDirection * groundDistance;
      let checkerValue = (floor(groundPosition.x * 1.7) + floor(groundPosition.z * 1.7)) * 0.5;
      let checkerBand = abs(fract(checkerValue) - 0.5) * 2.0;
      let gridColor = lerp3(vec3<f32>(0.12, 0.11, 0.095), vec3<f32>(0.55, 0.48, 0.32), checkerBand);
      let horizonFade = exp(-0.035 * groundDistance * groundDistance);
      colorValue = lerp3(colorValue, gridColor, horizonFade);
    }
  }
  let sunAmount = pow(max(dot(rayDirection, normalize(vec3<f32>(-0.35, 0.72, -0.58))), 0.0), 220.0);
  return colorValue + vec3<f32>(1.0, 0.86, 0.58) * sunAmount * 4.0;
}

fn eyeMaterial(worldPosition: vec3<f32>, surfaceNormal: vec3<f32>, incomingDirection: vec3<f32>) -> vec3<f32> {
  let localPosition = inverseWarp(worldPosition);
  let normalizedXY = vec2<f32>(localPosition.x / 0.78, localPosition.y / 0.70);
  let radialValue = length(normalizedXY);
  let frontMask = 1.0 - smoothstep(-0.66, -0.28, localPosition.z);
  let irisMask = (1.0 - smoothstep(0.46, 0.58, radialValue)) * frontMask;
  let pupilMask = (1.0 - smoothstep(0.145, 0.205, radialValue)) * frontMask;
  let limbalMask = smoothstep(0.40, 0.50, radialValue) * (1.0 - smoothstep(0.50, 0.59, radialValue)) * frontMask;

  let veinSignal = smoothstep(0.91, 0.99, abs(sin(localPosition.x * 19.0 + sin(localPosition.y * 8.0) * 2.2)));
  var scleraColor = vec3<f32>(0.82, 0.80, 0.74) - vec3<f32>(0.20, 0.04, 0.025) * veinSignal * 0.26;

  let stripeA = 0.5 + 0.5 * sin(normalizedXY.x * 38.0 + normalizedXY.y * 19.0 + radialValue * 14.0);
  let stripeB = 0.5 + 0.5 * sin(normalizedXY.y * 43.0 - normalizedXY.x * 13.0 - radialValue * 18.0);
  let irisTexture = clamp(0.45 * stripeA + 0.55 * stripeB, 0.0, 1.0);
  let irisBase = lerp3(vec3<f32>(0.05, 0.22, 0.19), vec3<f32>(0.42, 0.62, 0.40), irisTexture);
  var baseColor = lerp3(scleraColor, irisBase, irisMask);
  baseColor = lerp3(baseColor, vec3<f32>(0.035, 0.040, 0.035), limbalMask * 0.72);
  baseColor = lerp3(baseColor, vec3<f32>(0.006, 0.008, 0.008), pupilMask);

  let lightDirection = normalize(vec3<f32>(-0.48, 0.72, -0.52));
  let diffuseValue = 0.32 + 0.68 * max(dot(surfaceNormal, lightDirection), 0.0);
  let viewDirection = normalize(-incomingDirection);
  let halfVector = normalize(lightDirection + viewDirection);
  let specularValue = pow(max(dot(surfaceNormal, halfVector), 0.0), 70.0);
  return baseColor * diffuseValue + vec3<f32>(1.0, 0.92, 0.76) * specularValue * 0.30;
}

fn shadePixel(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> vec3<f32> {
  let outerHit = marchOuter(rayOrigin, rayDirection);
  if (outerHit.hitFlag < 0.5) {
    return environmentColor(rayOrigin, rayDirection);
  }

  let hitPosition = rayOrigin + rayDirection * outerHit.rayDistance;
  let hitNormal = outerNormal(hitPosition);
  let refractiveIndex = uniformData.controlData.w;
  let refractedDirection = normalize(refract(rayDirection, hitNormal, 1.0 / refractiveIndex));
  let reflectedDirection = normalize(reflect(rayDirection, hitNormal));
  let cosineView = clamp(dot(-rayDirection, hitNormal), 0.0, 1.0);
  let fresnelValue = 0.04 + 0.96 * pow(1.0 - cosineView, 5.0);

  let innerOrigin = hitPosition + refractedDirection * 0.012;
  let innerHit = marchInner(innerOrigin, refractedDirection);
  var transmittedColor = environmentColor(innerOrigin, refractedDirection);
  if (innerHit.hitFlag > 0.5) {
    let innerPosition = innerOrigin + refractedDirection * innerHit.rayDistance;
    transmittedColor = eyeMaterial(innerPosition, innerNormal(innerPosition), refractedDirection);
  }

  let reflectionColor = environmentColor(hitPosition + hitNormal * 0.01, reflectedDirection);
  let lightDirection = normalize(vec3<f32>(-0.48, 0.72, -0.52));
  let highlightDirection = normalize(lightDirection - rayDirection);
  let glassHighlight = pow(max(dot(hitNormal, highlightDirection), 0.0), 150.0);
  let edgeTint = vec3<f32>(0.60, 0.83, 0.90) * pow(1.0 - cosineView, 2.5) * 0.16;
  return transmittedColor * (0.88 - 0.20 * fresnelValue)
    + reflectionColor * (0.08 + 0.64 * fresnelValue)
    + edgeTint
    + vec3<f32>(1.0, 0.95, 0.82) * glassHighlight * 0.85;
}

@fragment
fn fragmentMain(@builtin(position) fragmentPosition: vec4<f32>) -> @location(0) vec4<f32> {
  let resolutionValue = uniformData.viewportData.xy;
  var screenPosition = fragmentPosition.xy / resolutionValue * 2.0 - vec2<f32>(1.0, 1.0);
  screenPosition = vec2<f32>(
    screenPosition.x * (resolutionValue.x / resolutionValue.y),
    -screenPosition.y
  );

  let yawValue = uniformData.cameraData.x;
  let pitchValue = uniformData.cameraData.y;
  let orbitRadius = 3.45;
  let rayOrigin = vec3<f32>(
    orbitRadius * sin(yawValue) * cos(pitchValue),
    orbitRadius * sin(pitchValue),
    -orbitRadius * cos(yawValue) * cos(pitchValue)
  );
  let forwardDirection = normalize(-rayOrigin);
  let worldUp = vec3<f32>(0.0, 1.0, 0.0);
  let rightDirection = normalize(cross(forwardDirection, worldUp));
  let upDirection = normalize(cross(rightDirection, forwardDirection));
  let rayDirection = normalize(
    forwardDirection
    + rightDirection * screenPosition.x * 0.78
    + upDirection * screenPosition.y * 0.78
  );

  var colorValue = shadePixel(rayOrigin, rayDirection);
  colorValue = colorValue / (colorValue + vec3<f32>(1.0));
  colorValue = pow(colorValue, vec3<f32>(1.0 / 2.2));
  return vec4<f32>(colorValue, 1.0);
}