struct UniformData {
  viewportData: vec4<f32>,
  controlData: vec4<f32>,
  cameraData: vec4<f32>,
  dropletData: vec4<f32>,
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

fn flattenFactor() -> f32 {
  return clamp(uniformData.cameraData.z, 0.0, 0.45);
}

fn outerRadii() -> vec3<f32> {
  let flattenValue = flattenFactor();
  return vec3<f32>(1.0, 1.0 - flattenValue, 1.0);
}

fn innerRadii() -> vec3<f32> {
  let flattenValue = flattenFactor();
  return vec3<f32>(0.78, 0.78 * (1.0 - flattenValue), 0.78);
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

fn ellipsoidSurfacePoint(directionValue: vec3<f32>, radiiValue: vec3<f32>) -> vec3<f32> {
  let unitDirection = normalize(directionValue);
  let scaledDirection = unitDirection / radiiValue;
  let denominatorValue = sqrt(dot(scaledDirection, scaledDirection));
  return unitDirection / max(denominatorValue, 0.0001);
}

fn ellipsoidSurfaceNormal(surfacePosition: vec3<f32>, radiiValue: vec3<f32>) -> vec3<f32> {
  let radiiSquared = radiiValue * radiiValue;
  return normalize(surfacePosition / radiiSquared);
}

fn eyeOuterFieldLocal(localPosition: vec3<f32>) -> f32 {
  return ellipsoidField(localPosition, outerRadii());
}

fn dropletFieldLocal(localPosition: vec3<f32>) -> f32 {
  let dropletCountValue = clamp(uniformData.dropletData.x, 0.0, 14.0);
  let dropletSizeValue = clamp(uniformData.dropletData.y, 0.35, 1.80);
  let dropletBulgeValue = clamp(uniformData.dropletData.z, 0.12, 0.90);
  let eyeRadii = outerRadii();
  let dropletSpecs = array<vec4<f32>, 14>(
    vec4<f32>( 0.08,  0.05, -0.995, 0.160),
    vec4<f32>(-0.38,  0.22, -0.900, 0.125),
    vec4<f32>( 0.28,  0.34, -0.890, 0.105),
    vec4<f32>( 0.48, -0.10, -0.860, 0.088),
    vec4<f32>(-0.15, -0.38, -0.910, 0.078),
    vec4<f32>(-0.56, -0.28, -0.780, 0.070),
    vec4<f32>( 0.62,  0.28, -0.720, 0.064),
    vec4<f32>(-0.02,  0.52, -0.840, 0.056),
    vec4<f32>( 0.18, -0.55, -0.810, 0.052),
    vec4<f32>(-0.70,  0.05, -0.700, 0.046),
    vec4<f32>( 0.74, -0.18, -0.650, 0.042),
    vec4<f32>(-0.33,  0.55, -0.730, 0.039),
    vec4<f32>( 0.40,  0.58, -0.680, 0.036),
    vec4<f32>(-0.50, -0.55, -0.660, 0.033)
  );

  var nearestDistance = 100.0;
  var dropletIndex: i32 = 0;
  loop {
    if (dropletIndex >= 14) { break; }
    if (f32(dropletIndex) < dropletCountValue) {
      let dropletSpec = dropletSpecs[u32(dropletIndex)];
      let directionValue = normalize(dropletSpec.xyz);
      let radiusValue = dropletSpec.w * dropletSizeValue;
      let surfacePoint = ellipsoidSurfacePoint(directionValue, eyeRadii);
      let outwardNormal = ellipsoidSurfaceNormal(surfacePoint, eyeRadii);
      let dropletCenter = surfacePoint + outwardNormal * radiusValue * dropletBulgeValue;
      let sphereDistance = length(localPosition - dropletCenter) - radiusValue;
      nearestDistance = min(nearestDistance, sphereDistance);
    }
    dropletIndex = dropletIndex + 1;
  }
  return nearestDistance;
}

fn smoothUnion(firstDistance: f32, secondDistance: f32, blendRadius: f32) -> f32 {
  let blendValue = clamp(0.5 + 0.5 * (secondDistance - firstDistance) / blendRadius, 0.0, 1.0);
  return secondDistance * (1.0 - blendValue) + firstDistance * blendValue
    - blendRadius * blendValue * (1.0 - blendValue);
}

fn eyeOuterField(worldPosition: vec3<f32>) -> f32 {
  return eyeOuterFieldLocal(inverseWarp(worldPosition));
}

fn outerField(worldPosition: vec3<f32>) -> f32 {
  let localPosition = inverseWarp(worldPosition);
  let eyeDistance = eyeOuterFieldLocal(localPosition);
  let dropletDistance = dropletFieldLocal(localPosition);
  return smoothUnion(eyeDistance, dropletDistance, 0.022);
}

fn innerField(worldPosition: vec3<f32>) -> f32 {
  let localPosition = inverseWarp(worldPosition);
  return ellipsoidField(localPosition, innerRadii());
}

fn surfaceWaterMask(worldPosition: vec3<f32>) -> f32 {
  let localPosition = inverseWarp(worldPosition);
  let eyeDistance = eyeOuterFieldLocal(localPosition);
  let dropletDistance = dropletFieldLocal(localPosition);
  let relativeDistance = dropletDistance - eyeDistance;
  return 1.0 - smoothstep(-0.004, 0.042, relativeDistance);
}

fn refineOuterRoot(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, nearDistance: f32, farDistance: f32) -> f32 {
  var lowDistance = nearDistance;
  var highDistance = farDistance;
  var lowField = outerField(rayOrigin + rayDirection * lowDistance);
  var refineIndex: i32 = 0;
  loop {
    if (refineIndex >= 11) { break; }
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
    if (marchIndex >= 220 || travelDistance > 8.0) { break; }
    let samplePosition = rayOrigin + rayDirection * travelDistance;
    let fieldValue = outerField(samplePosition);
    if (abs(fieldValue) < 0.0012) {
      return MarchResult(travelDistance, 1.0);
    }
    if (marchIndex > 0 && fieldValue * previousField < 0.0) {
      return MarchResult(refineOuterRoot(rayOrigin, rayDirection, previousDistance, travelDistance), 1.0);
    }
    previousDistance = travelDistance;
    previousField = fieldValue;
    travelDistance = travelDistance + max(abs(fieldValue) * 0.38, 0.0019);
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
    if (marchIndex >= 170 || travelDistance > 3.4) { break; }
    let samplePosition = rayOrigin + rayDirection * travelDistance;
    let fieldValue = innerField(samplePosition);
    if (abs(fieldValue) < 0.0012) {
      return MarchResult(travelDistance, 1.0);
    }
    if (marchIndex > 0 && fieldValue * previousField < 0.0) {
      return MarchResult(refineInnerRoot(rayOrigin, rayDirection, previousDistance, travelDistance), 1.0);
    }
    previousDistance = travelDistance;
    previousField = fieldValue;
    travelDistance = travelDistance + max(abs(fieldValue) * 0.46, 0.0021);
    marchIndex = marchIndex + 1;
  }
  return MarchResult(travelDistance, 0.0);
}

fn outerNormal(worldPosition: vec3<f32>) -> vec3<f32> {
  let epsilonValue = 0.0019;
  let axisX = vec3<f32>(epsilonValue, 0.0, 0.0);
  let axisY = vec3<f32>(0.0, epsilonValue, 0.0);
  let axisZ = vec3<f32>(0.0, 0.0, epsilonValue);
  return normalize(vec3<f32>(
    outerField(worldPosition + axisX) - outerField(worldPosition - axisX),
    outerField(worldPosition + axisY) - outerField(worldPosition - axisY),
    outerField(worldPosition + axisZ) - outerField(worldPosition - axisZ)
  ));
}

fn eyeOuterNormal(worldPosition: vec3<f32>) -> vec3<f32> {
  let epsilonValue = 0.0022;
  let axisX = vec3<f32>(epsilonValue, 0.0, 0.0);
  let axisY = vec3<f32>(0.0, epsilonValue, 0.0);
  let axisZ = vec3<f32>(0.0, 0.0, epsilonValue);
  return normalize(vec3<f32>(
    eyeOuterField(worldPosition + axisX) - eyeOuterField(worldPosition - axisX),
    eyeOuterField(worldPosition + axisY) - eyeOuterField(worldPosition - axisY),
    eyeOuterField(worldPosition + axisZ) - eyeOuterField(worldPosition - axisZ)
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
  var colorValue = lerp3(vec3<f32>(0.045, 0.055, 0.055), vec3<f32>(0.48, 0.61, 0.64), skyFactor);
  if (rayDirection.y < -0.0001) {
    let groundDistance = (-1.62 - rayOrigin.y) / rayDirection.y;
    if (groundDistance > 0.0) {
      let groundPosition = rayOrigin + rayDirection * groundDistance;
      let checkerValue = (floor(groundPosition.x * 1.7) + floor(groundPosition.z * 1.7)) * 0.5;
      let checkerBand = abs(fract(checkerValue) - 0.5) * 2.0;
      let gridColor = lerp3(vec3<f32>(0.09, 0.10, 0.095), vec3<f32>(0.49, 0.43, 0.31), checkerBand);
      let horizonFade = exp(-0.035 * groundDistance * groundDistance);
      colorValue = lerp3(colorValue, gridColor, horizonFade);
    }
  }
  let sunDirection = normalize(vec3<f32>(-0.35, 0.72, -0.58));
  let sunAmount = pow(max(dot(rayDirection, sunDirection), 0.0), 220.0);
  let softBoxA = pow(max(dot(rayDirection, normalize(vec3<f32>(0.62, 0.42, -0.66))), 0.0), 90.0);
  let softBoxB = pow(max(dot(rayDirection, normalize(vec3<f32>(-0.72, 0.05, -0.69))), 0.0), 120.0);
  return colorValue
    + vec3<f32>(1.0, 0.86, 0.58) * sunAmount * 4.0
    + vec3<f32>(0.56, 0.88, 0.92) * softBoxA * 0.75
    + vec3<f32>(0.92, 0.72, 0.58) * softBoxB * 0.45;
}

fn eyeMaterial(worldPosition: vec3<f32>, surfaceNormal: vec3<f32>, incomingDirection: vec3<f32>) -> vec3<f32> {
  let localPosition = inverseWarp(worldPosition);
  let eyeRadii = innerRadii();
  let normalizedXY = vec2<f32>(localPosition.x / eyeRadii.x, localPosition.y / eyeRadii.y);
  let radialValue = length(normalizedXY);
  let frontMask = 1.0 - smoothstep(-0.66, -0.28, localPosition.z);
  let irisMask = (1.0 - smoothstep(0.46, 0.58, radialValue)) * frontMask;
  let pupilMask = (1.0 - smoothstep(0.145, 0.205, radialValue)) * frontMask;
  let limbalMask = smoothstep(0.40, 0.50, radialValue) * (1.0 - smoothstep(0.50, 0.59, radialValue)) * frontMask;

  let veinSignal = smoothstep(0.91, 0.99, abs(sin(localPosition.x * 19.0 + sin(localPosition.y * 8.0) * 2.2)));
  var scleraColor = vec3<f32>(0.82, 0.80, 0.74) - vec3<f32>(0.20, 0.04, 0.025) * veinSignal * 0.26;

  let irisAngle = atan2(normalizedXY.y, normalizedXY.x);
  let radialFibers = 0.5 + 0.5 * sin(irisAngle * 34.0 + radialValue * 25.0);
  let crossFibers = 0.5 + 0.5 * sin(irisAngle * 17.0 - radialValue * 42.0 + sin(irisAngle * 7.0));
  let irisTexture = clamp(radialFibers * 0.62 + crossFibers * 0.38, 0.0, 1.0);
  let irisBase = lerp3(vec3<f32>(0.035, 0.17, 0.16), vec3<f32>(0.39, 0.66, 0.43), irisTexture);
  var baseColor = lerp3(scleraColor, irisBase, irisMask);
  baseColor = lerp3(baseColor, vec3<f32>(0.035, 0.040, 0.035), limbalMask * 0.76);
  baseColor = lerp3(baseColor, vec3<f32>(0.004, 0.006, 0.006), pupilMask);

  let lightDirection = normalize(vec3<f32>(-0.48, 0.72, -0.52));
  let diffuseValue = 0.32 + 0.68 * max(dot(surfaceNormal, lightDirection), 0.0);
  let viewDirection = normalize(-incomingDirection);
  let halfVector = normalize(lightDirection + viewDirection);
  let specularValue = pow(max(dot(surfaceNormal, halfVector), 0.0), 75.0);
  return baseColor * diffuseValue + vec3<f32>(1.0, 0.92, 0.76) * specularValue * 0.28;
}

fn shadePixel(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> vec3<f32> {
  let outerHit = marchOuter(rayOrigin, rayDirection);
  if (outerHit.hitFlag < 0.5) {
    return environmentColor(rayOrigin, rayDirection);
  }

  let hitPosition = rayOrigin + rayDirection * outerHit.rayDistance;
  let hitNormal = outerNormal(hitPosition);
  let baseEyeNormal = eyeOuterNormal(hitPosition);
  let waterMask = surfaceWaterMask(hitPosition);
  let glassIndex = uniformData.controlData.w;
  let waterIndex = uniformData.dropletData.w;
  let refractiveIndex = glassIndex * (1.0 - waterMask) + waterIndex * waterMask;
  let refractionRatio = 1.0 / max(refractiveIndex, 1.01);
  let refractedDirection = normalize(refract(rayDirection, hitNormal, refractionRatio));
  let reflectedDirection = normalize(reflect(rayDirection, hitNormal));
  let cosineView = clamp(dot(-rayDirection, hitNormal), 0.0, 1.0);
  let baseReflectanceRatio = (refractiveIndex - 1.0) / (refractiveIndex + 1.0);
  let baseReflectance = baseReflectanceRatio * baseReflectanceRatio;
  let fresnelValue = baseReflectance + (1.0 - baseReflectance) * pow(1.0 - cosineView, 5.0);

  let innerOrigin = hitPosition + refractedDirection * 0.012;
  let innerHit = marchInner(innerOrigin, refractedDirection);
  var transmittedColor = environmentColor(innerOrigin, refractedDirection);
  if (innerHit.hitFlag > 0.5) {
    let innerPosition = innerOrigin + refractedDirection * innerHit.rayDistance;
    transmittedColor = eyeMaterial(innerPosition, innerNormal(innerPosition), refractedDirection);
  }

  let reflectionColor = environmentColor(hitPosition + hitNormal * 0.01, reflectedDirection);
  let lightDirection = normalize(vec3<f32>(-0.48, 0.72, -0.52));
  let secondaryLightDirection = normalize(vec3<f32>(0.64, 0.36, -0.68));
  let primaryHalfVector = normalize(lightDirection - rayDirection);
  let secondaryHalfVector = normalize(secondaryLightDirection - rayDirection);
  let primaryHighlight = pow(max(dot(hitNormal, primaryHalfVector), 0.0), 170.0);
  let secondaryHighlight = pow(max(dot(hitNormal, secondaryHalfVector), 0.0), 120.0);
  let curvatureDifference = clamp(1.0 - dot(hitNormal, baseEyeNormal), 0.0, 1.0);
  let dropletRim = waterMask * pow(curvatureDifference, 0.62);
  let dropletSparkle = waterMask * (primaryHighlight * 1.55 + secondaryHighlight * 0.72);
  let edgeTint = vec3<f32>(0.60, 0.83, 0.90) * pow(1.0 - cosineView, 2.5) * (0.14 + waterMask * 0.10);
  let lensGain = 1.0 + waterMask * 0.07 * (1.0 - cosineView);

  return transmittedColor * (0.88 - 0.18 * fresnelValue) * lensGain
    + reflectionColor * (0.08 + 0.70 * fresnelValue + waterMask * 0.035)
    + edgeTint
    + vec3<f32>(1.0, 0.96, 0.86) * primaryHighlight * (0.72 + waterMask * 0.35)
    + vec3<f32>(0.72, 0.94, 1.0) * secondaryHighlight * (0.18 + waterMask * 0.26)
    + vec3<f32>(0.78, 0.95, 1.0) * dropletRim * 0.34
    + vec3<f32>(1.0, 1.0, 0.96) * dropletSparkle * 0.22;
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
