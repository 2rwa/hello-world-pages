@fragment
fn fragmentMain(@builtin(position) pixelPosition: vec4<f32>) -> @location(0) vec4<f32> {
  let resolution = max(uniformData.viewportData.xy, vec2<f32>(1.0));
  let rawScreenPosition = pixelPosition.xy / resolution * 2.0 - vec2<f32>(1.0);
  let screenPosition = vec2<f32>(rawScreenPosition.x * resolution.x / resolution.y, -rawScreenPosition.y);

  let yawValue = uniformData.cameraData.x;
  let pitchValue = uniformData.cameraData.y;
  let baseCameraOrigin = vec3<f32>(0.0, 0.02, 3.25);
  let yawXZ = rotate2(baseCameraOrigin.xz, yawValue);
  let yawCameraOrigin = vec3<f32>(yawXZ.x, baseCameraOrigin.y, yawXZ.y);
  let pitchYZ = rotate2(yawCameraOrigin.yz, pitchValue);
  let cameraOrigin = vec3<f32>(yawCameraOrigin.x, pitchYZ.x, pitchYZ.y);

  let forwardValue = normalize(-cameraOrigin);
  let rightValue = normalize(cross(forwardValue, vec3<f32>(0.0, 1.0, 0.0)));
  let upValue = normalize(cross(rightValue, forwardValue));
  let rayDirection = normalize(forwardValue + screenPosition.x * rightValue * 0.72 + screenPosition.y * upValue * 0.72);

  var finalColor = environmentColor(rayDirection);
  let entryDistance = marchSphere(cameraOrigin, rayDirection);
  if (entryDistance > 0.0) {
    let entryPosition = cameraOrigin + rayDirection * entryDistance;
    let entryNormal = normalize(entryPosition);
    let glassIor = clamp(uniformData.bubbleData.w, 1.01, 1.80);
    let facingValue = max(dot(-rayDirection, entryNormal), 0.0);
    let fresnelValue = fresnelSchlick(facingValue, 1.0, glassIor);
    let reflectedDirection = reflect(rayDirection, entryNormal);
    let refractedDirection = refract(rayDirection, entryNormal, 1.0 / glassIor);

    var throughColor = environmentColor(rayDirection);
    if (length(refractedDirection) > 0.001) {
      let insideOrigin = entryPosition - entryNormal * 0.004;
      let insideDirection = normalize(refractedDirection);
      let exitDistance = sphereExitDistance(insideOrigin, insideDirection);
      let hitValue = marchInternal(insideOrigin, insideDirection, exitDistance);

      if (hitValue.hitFlag > 0.5) {
        let hitPosition = insideOrigin + insideDirection * hitValue.travel;
        let hitNormal = fieldNormal(hitPosition, hitValue.materialId);
        let lightDirection = normalize(vec3<f32>(-0.48, 0.72, 0.32));
        let diffuseValue = max(dot(hitNormal, lightDirection), 0.0);
        let rimValue = pow(1.0 - max(dot(-insideDirection, hitNormal), 0.0), 2.4);
        if (hitValue.materialId > 1.5) {
          let sparkleValue = pow(max(dot(reflect(-lightDirection, hitNormal), -insideDirection), 0.0), 48.0);
          throughColor = vec3<f32>(0.78, 0.88, 0.85) * (0.72 + diffuseValue * 0.30)
            + vec3<f32>(1.0) * (0.32 + rimValue * 0.55 + sparkleValue);
        } else {
          let bubbleFresnel = fresnelSchlick(max(dot(-insideDirection, hitNormal), 0.0), 1.333, 1.0);
          let bubbleReflect = environmentColor(reflect(insideDirection, hitNormal));
          let bubbleBase = vec3<f32>(0.20, 0.47, 0.50) + vec3<f32>(0.50, 0.86, 0.88) * diffuseValue * 0.22;
          throughColor = lerp3(bubbleBase, bubbleReflect, clamp(0.24 + bubbleFresnel * 1.8 + rimValue * 0.35, 0.0, 0.92));
        }
      } else {
        let exitPosition = insideOrigin + insideDirection * exitDistance;
        let exitNormal = normalize(exitPosition);
        let exitDirection = refract(insideDirection, -exitNormal, glassIor);
        let fallbackDirection = reflect(insideDirection, -exitNormal);
        let outgoingDirection = normalize(lerp3(fallbackDirection, exitDirection, step(0.001, length(exitDirection))));
        throughColor = environmentColor(outgoingDirection);
      }

      let absorptionValue = clamp(uniformData.cameraData.z, 0.0, 1.0);
      let travelForTint = min(exitDistance, max(hitValue.travel, 0.0));
      let transmittance = exp(-vec3<f32>(0.12, 0.035, 0.028) * travelForTint * absorptionValue * 3.2);
      throughColor = throughColor * transmittance + vec3<f32>(0.018, 0.060, 0.062) * (1.0 - transmittance);
    }

    let reflectionColor = environmentColor(reflectedDirection);
    finalColor = lerp3(throughColor, reflectionColor, clamp(fresnelValue + 0.035, 0.0, 0.92));
    let edgeGlow = pow(1.0 - facingValue, 4.0);
    finalColor = finalColor + vec3<f32>(0.55, 0.92, 0.92) * edgeGlow * 0.28;
  }

  let vignetteValue = 1.0 - 0.12 * dot(screenPosition * vec2<f32>(0.63, 0.82), screenPosition * vec2<f32>(0.63, 0.82));
  finalColor = pow(max(finalColor * vignetteValue, vec3<f32>(0.0)), vec3<f32>(0.92));
  return vec4<f32>(finalColor, 1.0);
}
