struct UniformData {
  viewportData: vec4<f32>,
  outerFlowData: vec4<f32>,
  irisFlowData: vec4<f32>,
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

fn marchSphere(
  rayOrigin: vec3<f32>,
  rayDirection: vec3<f32>,
  radiusValue: f32,
  maxDistance: f32
) -> MarchResult {
  var travelDistance = 0.0;
  var marchIndex: i32 = 0;
  loop {
    if (marchIndex >= 120 || travelDistance > maxDistance) { break; }
    let fieldValue = sphereField(
      rayOrigin + rayDirection * travelDistance,
      radiusValue
    );
    if (abs(fieldValue) < 0.0012) {
      return MarchResult(travelDistance, 1.0);
    }
    travelDistance = travelDistance + max(abs(fieldValue) * 0.82, 0.0015);
    marchIndex = marchIndex + 1;
  }
  return MarchResult(travelDistance, 0.0);
}

fn outerHeight(surfaceUnit: vec3<f32>) -> f32 {
  let timeValue = uniformData.viewportData.z;
  let scaleValue = uniformData.outerFlowData.y;
  let speedValue = uniformData.outerFlowData.z;
  let directionAngle = uniformData.outerFlowData.w;

  let flowDirectionA = normalize(vec3<f32>(
    cos(directionAngle),
    sin(directionAngle),
    0.36
  ));
  let flowDirectionB = normalize(vec3<f32>(
    -sin(directionAngle),
    cos(directionAngle),
    0.60
  ));

  let phaseA =
    dot(surfaceUnit, flowDirectionA) * scaleValue * 5.8 +
    timeValue * speedValue * 3.0;
  let phaseB =
    dot(surfaceUnit, flowDirectionB) * scaleValue * 4.0 -
    timeValue * speedValue * 2.2;

  return
    sin(phaseA) * 0.57 +
    sin(phaseB + sin(phaseA * 0.29) * 1.1) * 0.29 +
    sin(phaseA * 0.43 + phaseB * 0.37) * 0.14;
}

fn irisHeight(surfaceUnit: vec3<f32>) -> f32 {
  let timeValue = uniformData.viewportData.z;
  let scaleValue = uniformData.irisFlowData.y;
  let speedValue = uniformData.irisFlowData.z;
  let twistValue = uniformData.irisFlowData.w;

  let radialValue = length(surfaceUnit.xy);
  let angleValue = atan2(surfaceUnit.y, surfaceUnit.x);
  let frontWeight = 1.0 - smoothstep(-0.38, 0.12, surfaceUnit.z);
  let irisBand =
    (1.0 - smoothstep(0.58, 0.78, radialValue)) *
    smoothstep(0.08, 0.20, radialValue) *
    frontWeight;

  let rotatingPhase =
    angleValue * (7.0 + scaleValue * 0.35) +
    radialValue * scaleValue * twistValue +
    timeValue * speedValue * 3.2;
  let radialPhase =
    radialValue * scaleValue * 11.0 -
    timeValue * speedValue * 2.0 +
    sin(angleValue * 5.0) * 1.7;

  let heightValue =
    sin(rotatingPhase) * 0.60 +
    sin(radialPhase) * 0.28 +
    sin(rotatingPhase * 0.47 + radialPhase * 0.31) * 0.12;

  return heightValue * irisBand;
}

fn perturbedNormalFromHeight(
  surfacePosition: vec3<f32>,
  strengthValue: f32,
  layerCode: f32
) -> vec3<f32> {
  let baseNormal = normalize(surfacePosition);
  if (strengthValue <= 0.0001) {
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
  let tangentPosition = normalize(unitPosition + tangentDirection * sampleStep);
  let bitangentPosition = normalize(unitPosition + bitangentDirection * sampleStep);

  var centerHeight = outerHeight(unitPosition);
  var tangentHeight = outerHeight(tangentPosition);
  var bitangentHeight = outerHeight(bitangentPosition);

  if (layerCode > 0.5) {
    centerHeight = irisHeight(unitPosition);
    tangentHeight = irisHeight(tangentPosition);
    bitangentHeight = irisHeight(bitangentPosition);
  }

  let tangentSlope = (tangentHeight - centerHeight) / sampleStep;
  let bitangentSlope = (bitangentHeight - centerHeight) / sampleStep;
  let slopeVector =
    tangentDirection * tangentSlope +
    bitangentDirection * bitangentSlope;

  return normalize(baseNormal - slopeVector * strengthValue * 0.052);
}

fn environmentColor(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> vec3<f32> {
  let skyFactor = clamp(rayDirection.y * 0.5 + 0.5, 0.0, 1.0);
  var colorValue = lerp3(
    vec3<f32>(0.028, 0.037, 0.045),
    vec3<f32>(0.30, 0.45, 0.50),
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
        vec3<f32>(0.050, 0.055, 0.052),
        vec3<f32>(0.36, 0.29, 0.18),
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

  return colorValue
    + vec3<f32>(0.95, 0.86, 0.66) * bandA * 1.7
    + vec3<f32>(0.52, 0.84, 0.92) * bandB * 1.3
    + vec3<f32>(1.0, 0.98, 0.90) * bandC * 2.2;
}

fn eyeMaterial(
  worldPosition: vec3<f32>,
  geometricNormal: vec3<f32>,
  incomingDirection: vec3<f32>
) -> vec3<f32> {
  let irisStrength = uniformData.irisFlowData.x;
  let flowingInnerNormal = perturbedNormalFromHeight(
    worldPosition,
    irisStrength,
    1.0
  );

  let normalizedXY = worldPosition.xy / 0.78;
  let radialValue = length(normalizedXY);
  let frontMask = 1.0 - smoothstep(-0.66, -0.28, worldPosition.z);
  let irisMask =
    (1.0 - smoothstep(0.46, 0.59, radialValue)) *
    frontMask;
  let pupilMask =
    (1.0 - smoothstep(0.145, 0.205, radialValue)) *
    frontMask;
  let limbalMask =
    smoothstep(0.40, 0.50, radialValue) *
    (1.0 - smoothstep(0.50, 0.60, radialValue)) *
    frontMask;

  let timeValue = uniformData.viewportData.z;
  let irisSpeed = uniformData.irisFlowData.z;
  let irisTwist = uniformData.irisFlowData.w;
  let baseAngle = atan2(normalizedXY.y, normalizedXY.x);
  let flowSample = irisHeight(normalize(worldPosition));
  let flowedAngle =
    baseAngle +
    irisStrength * 0.10 * flowSample +
    irisStrength * 0.018 * irisTwist * sin(
      radialValue * 15.0 - timeValue * irisSpeed * 1.8
    );
  let flowedRadius =
    radialValue +
    irisStrength * 0.012 * sin(
      baseAngle * 9.0 +
      radialValue * 34.0 +
      timeValue * irisSpeed * 2.1
    );

  let veinSignal = smoothstep(
    0.91,
    0.99,
    abs(sin(worldPosition.x * 20.0 + sin(worldPosition.y * 8.0) * 2.4))
  );
  var scleraColor =
    vec3<f32>(0.83, 0.81, 0.76) -
    vec3<f32>(0.21, 0.045, 0.03) * veinSignal * 0.25;

  let irisFiber =
    0.5 +
    0.5 * sin(
      flowedAngle * 35.0 +
      flowedRadius * 48.0 +
      sin(flowedAngle * 7.0) * 2.1
    );
  let irisFineFiber =
    0.5 +
    0.5 * sin(
      flowedAngle * 61.0 -
      flowedRadius * 27.0 +
      timeValue * irisSpeed * irisStrength * 0.9
    );
  let irisTexture = clamp(
    irisFiber * 0.72 + irisFineFiber * 0.28,
    0.0,
    1.0
  );

  let irisBase = lerp3(
    vec3<f32>(0.030, 0.15, 0.14),
    vec3<f32>(0.50, 0.69, 0.40),
    irisTexture
  );

  var baseColor = lerp3(scleraColor, irisBase, irisMask);
  baseColor = lerp3(
    baseColor,
    vec3<f32>(0.022, 0.030, 0.028),
    limbalMask * 0.77
  );
  baseColor = lerp3(
    baseColor,
    vec3<f32>(0.004, 0.006, 0.006),
    pupilMask
  );

  let shadingNormal = normalize(
    geometricNormal * (1.0 - irisMask) +
    flowingInnerNormal * irisMask
  );

  let lightDirection = normalize(vec3<f32>(-0.48, 0.72, -0.52));
  let diffuseValue =
    0.34 + 0.66 * max(dot(shadingNormal, lightDirection), 0.0);
  let viewDirection = normalize(-incomingDirection);
  let halfDirection = normalize(lightDirection + viewDirection);
  let specularValue =
    pow(max(dot(shadingNormal, halfDirection), 0.0), 76.0);

  return baseColor * diffuseValue
    + vec3<f32>(1.0, 0.91, 0.70) * specularValue * (0.24 + irisMask * 0.22);
}

fn shadePixel(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> vec3<f32> {
  let outerHit = marchSphere(rayOrigin, rayDirection, 1.0, 8.0);
  if (outerHit.hitFlag < 0.5) {
    return environmentColor(rayOrigin, rayDirection);
  }

  let hitPosition = rayOrigin + rayDirection * outerHit.rayDistance;
  let geometricOuterNormal = normalize(hitPosition);
  let flowingOuterNormal = perturbedNormalFromHeight(
    hitPosition,
    uniformData.outerFlowData.x,
    0.0
  );

  let refractiveIndex = uniformData.cameraData.z;
  let refractedDirection = normalize(
    refract(rayDirection, flowingOuterNormal, 1.0 / refractiveIndex)
  );
  let reflectedDirection = normalize(
    reflect(rayDirection, flowingOuterNormal)
  );

  let viewCosine = clamp(
    dot(-rayDirection, flowingOuterNormal),
    0.0,
    1.0
  );
  let baseReflectance =
    pow((1.0 - refractiveIndex) / (1.0 + refractiveIndex), 2.0);
  let fresnelValue =
    baseReflectance +
    (1.0 - baseReflectance) * pow(1.0 - viewCosine, 5.0);

  let innerOrigin =
    hitPosition +
    refractedDirection * 0.014 -
    geometricOuterNormal * 0.003;
  let innerHit = marchSphere(
    innerOrigin,
    refractedDirection,
    0.78,
    3.2
  );

  var transmittedColor = environmentColor(
    innerOrigin,
    refractedDirection
  );

  if (innerHit.hitFlag > 0.5) {
    let innerPosition =
      innerOrigin +
      refractedDirection * innerHit.rayDistance;
    transmittedColor = eyeMaterial(
      innerPosition,
      normalize(innerPosition),
      refractedDirection
    );
  }

  let reflectionColor = environmentColor(
    hitPosition + geometricOuterNormal * 0.01,
    reflectedDirection
  );

  let keyDirection = normalize(vec3<f32>(-0.48, 0.72, -0.52));
  let highlightDirection = normalize(keyDirection - rayDirection);
  let glassHighlight =
    pow(max(dot(flowingOuterNormal, highlightDirection), 0.0), 165.0);
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
fn fragmentMain(
  @builtin(position) fragmentPosition: vec4<f32>
) -> @location(0) vec4<f32> {
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
