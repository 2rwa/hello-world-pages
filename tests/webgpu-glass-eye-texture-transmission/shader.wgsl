struct UniformData {
  viewportData: vec4<f32>,
  transmissionData: vec4<f32>,
  materialData: vec4<f32>,
  cameraData: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniformData: UniformData;
@group(0) @binding(1) var surfaceTexture: texture_2d<f32>;
@group(0) @binding(2) var surfaceSampler: sampler;

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
  vertexResult.clipPosition = vec4<f32>(
    trianglePositions[vertexIndex],
    0.0,
    1.0
  );
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

fn sphereUv(surfaceNormal: vec3<f32>) -> vec2<f32> {
  let piValue = 3.14159265359;
  let longitudeValue = atan2(surfaceNormal.z, surfaceNormal.x);
  let latitudeValue = asin(clamp(surfaceNormal.y, -1.0, 1.0));

  return vec2<f32>(
    longitudeValue / (2.0 * piValue) + 0.5,
    latitudeValue / piValue + 0.5
  );
}

fn sampleSurfaceTexture(surfaceNormal: vec3<f32>) -> vec4<f32> {
  let timeValue = uniformData.viewportData.z;
  let textureScale = uniformData.transmissionData.w;
  let scrollSpeed = uniformData.materialData.x;

  var textureUv = sphereUv(surfaceNormal);
  textureUv = vec2<f32>(
    textureUv.x * textureScale + timeValue * scrollSpeed * 0.08,
    textureUv.y * textureScale + timeValue * scrollSpeed * 0.025
  );

  return textureSampleLevel(
    surfaceTexture,
    surfaceSampler,
    textureUv,
    0.0
  );
}

fn environmentColor(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> vec3<f32> {
  let skyFactor = clamp(rayDirection.y * 0.5 + 0.5, 0.0, 1.0);
  var colorValue = lerp3(
    vec3<f32>(0.025, 0.034, 0.050),
    vec3<f32>(0.30, 0.47, 0.58),
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
        vec3<f32>(0.045, 0.050, 0.060),
        vec3<f32>(0.37, 0.29, 0.18),
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
    + vec3<f32>(0.98, 0.86, 0.64) * bandA * 1.7
    + vec3<f32>(0.54, 0.82, 0.96) * bandB * 1.3
    + vec3<f32>(1.0, 0.98, 0.91) * bandC * 2.2;
}

fn eyeMaterial(
  worldPosition: vec3<f32>,
  surfaceNormal: vec3<f32>,
  incomingDirection: vec3<f32>
) -> vec3<f32> {
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
  baseColor = lerp3(
    baseColor,
    vec3<f32>(0.025, 0.033, 0.03),
    limbalMask * 0.75
  );
  baseColor = lerp3(
    baseColor,
    vec3<f32>(0.004, 0.006, 0.006),
    pupilMask
  );

  let lightDirection = normalize(vec3<f32>(-0.48, 0.72, -0.52));
  let diffuseValue =
    0.34 + 0.66 * max(dot(surfaceNormal, lightDirection), 0.0);
  let viewDirection = normalize(-incomingDirection);
  let halfDirection = normalize(lightDirection + viewDirection);
  let specularValue =
    pow(max(dot(surfaceNormal, halfDirection), 0.0), 78.0);

  return baseColor * diffuseValue
    + vec3<f32>(1.0, 0.94, 0.78) * specularValue * 0.27;
}

fn shadePixel(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> vec3<f32> {
  let outerHit = marchSphere(rayOrigin, rayDirection, 1.0, 8.0);
  if (outerHit.hitFlag < 0.5) {
    return environmentColor(rayOrigin, rayDirection);
  }

  let hitPosition = rayOrigin + rayDirection * outerHit.rayDistance;
  let hitNormal = normalize(hitPosition);
  let textureValue = sampleSurfaceTexture(hitNormal);

  if (uniformData.viewportData.w > 0.5) {
    return vec3<f32>(textureValue.a);
  }

  let alphaInfluence = uniformData.transmissionData.x;
  let minTransmission = uniformData.transmissionData.y;
  let maxTransmission = uniformData.transmissionData.z;

  let alphaDrivenTransmission = minTransmission +
    (maxTransmission - minTransmission) * textureValue.a;

  let transmissionValue =
    (minTransmission + maxTransmission) * 0.5 * (1.0 - alphaInfluence) +
    alphaDrivenTransmission * alphaInfluence;

  let refractiveIndex = uniformData.materialData.z;
  let refractedDirection = normalize(
    refract(rayDirection, hitNormal, 1.0 / refractiveIndex)
  );
  let reflectedDirection = normalize(
    reflect(rayDirection, hitNormal)
  );

  let viewCosine = clamp(dot(-rayDirection, hitNormal), 0.0, 1.0);
  let baseReflectance =
    pow((1.0 - refractiveIndex) / (1.0 + refractiveIndex), 2.0);
  let fresnelValue =
    baseReflectance +
    (1.0 - baseReflectance) * pow(1.0 - viewCosine, 5.0);

  let innerOrigin =
    hitPosition +
    refractedDirection * 0.014 -
    hitNormal * 0.003;

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
    hitPosition + hitNormal * 0.01,
    reflectedDirection
  );

  let tintStrength = uniformData.materialData.y;
  let textureTint = lerp3(
    vec3<f32>(1.0),
    textureValue.rgb * 1.18,
    tintStrength
  );

  let cloudyColor = lerp3(
    vec3<f32>(0.13, 0.16, 0.18),
    textureTint,
    0.58
  );

  let transmittedLayer =
    transmittedColor *
    textureTint *
    transmissionValue;

  let cloudyLayer =
    cloudyColor *
    (1.0 - transmissionValue) *
    (0.72 + 0.28 * (1.0 - viewCosine));

  let keyDirection = normalize(vec3<f32>(-0.48, 0.72, -0.52));
  let highlightDirection = normalize(keyDirection - rayDirection);
  let glassHighlight =
    pow(max(dot(hitNormal, highlightDirection), 0.0), 165.0);

  return transmittedLayer
    + cloudyLayer
    + reflectionColor * (0.07 + fresnelValue * 0.62)
    + vec3<f32>(0.50, 0.78, 0.92) * pow(1.0 - viewCosine, 2.5) * 0.12
    + vec3<f32>(1.0, 0.96, 0.84) * glassHighlight * 0.88;
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
