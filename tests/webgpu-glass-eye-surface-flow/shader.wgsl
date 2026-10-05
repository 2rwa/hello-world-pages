struct UniformData {
  viewportData: vec4<f32>,
  surfaceData: vec4<f32>,
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
  var vertexResult: VertexResult;
  vertexResult.clipPosition = vec4<f32>(trianglePositions[vertexIndex], 0.0, 1.0);
  return vertexResult;
}

fn lerp3(firstValue: vec3<f32>, secondValue: vec3<f32>, blendValue: f32) -> vec3<f32> {
  return firstValue * (1.0 - blendValue) + secondValue * blendValue;
}

fn sphereField(worldPosition: vec3<f32>, radiusValue: f32) -> f32 {
  return length(worldPosition) - radiusValue;
}

fn marchSphere(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, radiusValue: f32, maxDistance: f32) -> MarchResult {
  var travelDistance = 0.0;
  var marchIndex: i32 = 0;
  loop {
    if (marchIndex >= 120 || travelDistance > maxDistance) { break; }
    let fieldValue = sphereField(rayOrigin + rayDirection * travelDistance, radiusValue);
    if (abs(fieldValue) < 0.0012) {
      return MarchResult(travelDistance, 1.0);
    }
    travelDistance = travelDistance + max(abs(fieldValue) * 0.82, 0.0015);
    marchIndex = marchIndex + 1;
  }
  return MarchResult(travelDistance, 0.0);
}

fn surfaceHeight(surfaceUnit: vec3<f32>) -> f32 {
  let modeValue = uniformData.viewportData.w;
  let timeValue = uniformData.viewportData.z;
  let scaleValue = uniformData.surfaceData.y;
  let speedValue = uniformData.surfaceData.z;
  let directionAngle = uniformData.cameraData.z;

  if (modeValue < 0.5) {
    return 0.0;
  }

  let directionA = normalize(vec3<f32>(
    cos(directionAngle),
    sin(directionAngle),
    0.38
  ));
  let directionB = normalize(vec3<f32>(
    -sin(directionAngle),
    cos(directionAngle),
    0.62
  ));

  let phaseA = dot(surfaceUnit, directionA) * scaleValue * 5.6 + timeValue * speedValue * 3.1;
  let phaseB = dot(surfaceUnit, directionB) * scaleValue * 4.1 - timeValue * speedValue * 2.35;
  let streamHeight =
    sin(phaseA) * 0.56 +
    sin(phaseB + sin(phaseA * 0.31) * 1.2) * 0.29 +
    sin(phaseA * 0.47 + phaseB * 0.33) * 0.15;

  let polarAngle = atan2(surfaceUnit.y, surfaceUnit.x);
  let swirlHeight =
    sin(polarAngle * 6.0 + surfaceUnit.z * scaleValue * 6.2 - timeValue * speedValue * 3.0) * 0.67 +
    sin(polarAngle * 11.0 - surfaceUnit.z * scaleValue * 3.6 + timeValue * speedValue * 1.7) * 0.33;

  let ripplePole = normalize(vec3<f32>(
    cos(directionAngle) * 0.66,
    sin(directionAngle) * 0.66,
    -0.75
  ));
  let angularDistance = acos(clamp(dot(surfaceUnit, ripplePole), -1.0, 1.0));
  let rippleHeight =
    sin(angularDistance * scaleValue * 5.2 - timeValue * speedValue * 4.2) * 0.74 +
    sin(angularDistance * scaleValue * 9.1 - timeValue * speedValue * 2.7) * 0.26;

  if (modeValue < 1.5) {
    return streamHeight;
  }
  if (modeValue < 2.5) {
    return swirlHeight;
  }
  if (modeValue < 3.5) {
    return rippleHeight;
  }

  let crossHeight = sin(
    dot(surfaceUnit, normalize(vec3<f32>(0.31, -0.72, 0.62))) * scaleValue * 8.3 +
    timeValue * speedValue * 1.4
  );
  return streamHeight * 0.46 + swirlHeight * 0.31 + rippleHeight * 0.15 + crossHeight * 0.08;
}

fn bumpNormal(surfacePosition: vec3<f32>) -> vec3<f32> {
  let baseNormal = normalize(surfacePosition);
  let bumpStrength = uniformData.surfaceData.x;
  if (bumpStrength <= 0.0001 || uniformData.viewportData.w < 0.5) {
    return baseNormal;
  }

  var referenceAxis = vec3<f32>(0.0, 1.0, 0.0);
  if (abs(baseNormal.y) > 0.86) {
    referenceAxis = vec3<f32>(1.0, 0.0, 0.0);
  }

  let tangentDirection = normalize(cross(referenceAxis, baseNormal));
  let bitangentDirection = normalize(cross(baseNormal, tangentDirection));
  let sampleStep = 0.0045;
  let unitPosition = normalize(surfacePosition);

  let centerHeight = surfaceHeight(unitPosition);
  let tangentHeight = surfaceHeight(normalize(unitPosition + tangentDirection * sampleStep));
  let bitangentHeight = surfaceHeight(normalize(unitPosition + bitangentDirection * sampleStep));

  let tangentSlope = (tangentHeight - centerHeight) / sampleStep;
  let bitangentSlope = (bitangentHeight - centerHeight) / sampleStep;
  let slopeVector =
    tangentDirection * tangentSlope +
    bitangentDirection * bitangentSlope;

  return normalize(baseNormal - slopeVector * bumpStrength * 0.055);
}

fn environmentColor(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> vec3<f32> {
  let skyFactor = clamp(rayDirection.y * 0.5 + 0.5, 0.0, 1.0);
  var colorValue = lerp3(
    vec3<f32>(0.025, 0.045, 0.052),
    vec3<f32>(0.28, 0.48, 0.53),
    skyFactor
  );

  if (rayDirection.y < -0.0001) {
    let groundDistance = (-1.58 - rayOrigin.y) / rayDirection.y;
    if (groundDistance > 0.0) {
      let groundPosition = rayOrigin + rayDirection * groundDistance;
      let checkerValue =
        (floor(groundPosition.x * 1.5) + floor(groundPosition.z * 1.5)) * 0.5;
      let checkerBand = abs(fract(checkerValue) - 0.5) * 2.0;
      let floorColor = lerp3(
        vec3<f32>(0.045, 0.065, 0.064),
        vec3<f32>(0.35, 0.30, 0.20),
        checkerBand
      );
      let groundFade = exp(-0.035 * groundDistance * groundDistance);
      colorValue = lerp3(colorValue, floorColor, groundFade);
    }
  }

  let studioDirectionA = normalize(vec3<f32>(-0.72, 0.32, -0.61));
  let studioDirectionB = normalize(vec3<f32>(0.62, 0.12, -0.77));
  let studioDirectionC = normalize(vec3<f32>(0.05, 0.88, -0.47));
  let bandA = pow(max(dot(rayDirection, studioDirectionA), 0.0), 34.0);
  let bandB = pow(max(dot(rayDirection, studioDirectionB), 0.0), 52.0);
  let bandC = pow(max(dot(rayDirection, studioDirectionC), 0.0), 90.0);

  colorValue = colorValue
    + vec3<f32>(0.95, 0.88, 0.68) * bandA * 1.7
    + vec3<f32>(0.55, 0.86, 0.92) * bandB * 1.3
    + vec3<f32>(1.0, 0.98, 0.90) * bandC * 2.2;

  return colorValue;
}

fn eyeMaterial(worldPosition: vec3<f32>, surfaceNormal: vec3<f32>, incomingDirection: vec3<f32>) -> vec3<f32> {
  let normalizedXY = worldPosition.xy / 0.78;
  let radialValue = length(normalizedXY);
  let frontMask = 1.0 - smoothstep(-0.66, -0.28, worldPosition.z);
  let irisMask = (1.0 - smoothstep(0.46, 0.59, radialValue)) * frontMask;
  let pupilMask = (1.0 - smoothstep(0.145, 0.205, radialValue)) * frontMask;
  let limbalMask =
    smoothstep(0.40, 0.50, radialValue) *
    (1.0 - smoothstep(0.50, 0.60, radialValue)) *
    frontMask;

  let veinSignal = smoothstep(
    0.91,
    0.99,
    abs(sin(worldPosition.x * 20.0 + sin(worldPosition.y * 8.0) * 2.4))
  );
  var scleraColor =
    vec3<f32>(0.83, 0.81, 0.76) -
    vec3<f32>(0.21, 0.045, 0.03) * veinSignal * 0.25;

  let irisAngle = atan2(normalizedXY.y, normalizedXY.x);
  let irisFiber =
    0.5 +
    0.5 * sin(
      irisAngle * 34.0 +
      radialValue * 46.0 +
      sin(irisAngle * 7.0) * 2.2
    );
  let irisBase = lerp3(
    vec3<f32>(0.035, 0.16, 0.15),
    vec3<f32>(0.48, 0.68, 0.42),
    irisFiber
  );

  var baseColor = lerp3(scleraColor, irisBase, irisMask);
  baseColor = lerp3(baseColor, vec3<f32>(0.025, 0.033, 0.03), limbalMask * 0.75);
  baseColor = lerp3(baseColor, vec3<f32>(0.004, 0.006, 0.006), pupilMask);

  let lightDirection = normalize(vec3<f32>(-0.48, 0.72, -0.52));
  let diffuseValue = 0.34 + 0.66 * max(dot(surfaceNormal, lightDirection), 0.0);
  let viewDirection = normalize(-incomingDirection);
  let halfDirection = normalize(lightDirection + viewDirection);
  let specularValue = pow(max(dot(surfaceNormal, halfDirection), 0.0), 78.0);

  return baseColor * diffuseValue +
    vec3<f32>(1.0, 0.94, 0.78) * specularValue * 0.27;
}

fn shadePixel(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> vec3<f32> {
  let outerHit = marchSphere(rayOrigin, rayDirection, 1.0, 8.0);
  if (outerHit.hitFlag < 0.5) {
    return environmentColor(rayOrigin, rayDirection);
  }

  let hitPosition = rayOrigin + rayDirection * outerHit.rayDistance;
  let geometricNormal = normalize(hitPosition);
  let flowingNormal = bumpNormal(hitPosition);
  let refractiveIndex = uniformData.surfaceData.w;

  let refractedDirection = normalize(refract(rayDirection, flowingNormal, 1.0 / refractiveIndex));
  let reflectedDirection = normalize(reflect(rayDirection, flowingNormal));
  let viewCosine = clamp(dot(-rayDirection, flowingNormal), 0.0, 1.0);
  let baseReflectance = pow((1.0 - refractiveIndex) / (1.0 + refractiveIndex), 2.0);
  let fresnelValue =
    baseReflectance +
    (1.0 - baseReflectance) * pow(1.0 - viewCosine, 5.0);

  let innerOrigin = hitPosition + refractedDirection * 0.014 - geometricNormal * 0.003;
  let innerHit = marchSphere(innerOrigin, refractedDirection, 0.78, 3.2);
  var transmittedColor = environmentColor(innerOrigin, refractedDirection);

  if (innerHit.hitFlag > 0.5) {
    let innerPosition = innerOrigin + refractedDirection * innerHit.rayDistance;
    let innerNormal = normalize(innerPosition);
    transmittedColor = eyeMaterial(innerPosition, innerNormal, refractedDirection);
  }

  let reflectionColor = environmentColor(
    hitPosition + geometricNormal * 0.01,
    reflectedDirection
  );

  let keyDirection = normalize(vec3<f32>(-0.48, 0.72, -0.52));
  let highlightDirection = normalize(keyDirection - rayDirection);
  let glassHighlight = pow(max(dot(flowingNormal, highlightDirection), 0.0), 165.0);
  let edgeTint =
    vec3<f32>(0.46, 0.82, 0.88) *
    pow(1.0 - viewCosine, 2.4) *
    0.18;

  return transmittedColor * (0.90 - fresnelValue * 0.22)
    + reflectionColor * (0.08 + fresnelValue * 0.66)
    + edgeTint
    + vec3<f32>(1.0, 0.96, 0.84) * glassHighlight * 0.92;
}

@fragment
fn fragmentMain(@builtin(position) fragmentPosition: vec4<f32>) -> @location(0) vec4<f32> {
  let resolutionValue = uniformData.viewportData.xy;
  var screenPosition =
    fragmentPosition.xy / resolutionValue * 2.0 -
    vec2<f32>(1.0, 1.0);
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
    forwardDirection +
    rightDirection * screenPosition.x * 0.78 +
    upDirection * screenPosition.y * 0.78
  );

  var colorValue = shadePixel(rayOrigin, rayDirection);
  colorValue = colorValue / (colorValue + vec3<f32>(1.0));
  colorValue = pow(colorValue, vec3<f32>(1.0 / 2.2));
  return vec4<f32>(colorValue, 1.0);
}
