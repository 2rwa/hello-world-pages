fn bubbleField(position: vec3<f32>) -> f32 {
  let timeValue = uniformData.viewportData.z * uniformData.bubbleData.y;
  let countValue = clamp(uniformData.bubbleData.x, 0.0, 28.0);
  var nearestDistance = 100.0;
  var bubbleIndex: i32 = 0;
  loop {
    if (bubbleIndex >= 28) { break; }
    if (f32(bubbleIndex) < countValue) {
      let indexValue = f32(bubbleIndex);
      let randomValue = hash31(indexValue + 2.0);
      let phaseValue = fract(timeValue * (0.055 + randomValue.z * 0.045) + randomValue.y);
      let riseValue = phaseValue * 2.0 - 1.0;
      let radialScale = 0.72 * sqrt(max(0.0, 1.0 - riseValue * riseValue * 0.54));
      let angleValue = randomValue.x * 6.2831853 + sin(timeValue * 0.23 + indexValue) * 0.22;
      let driftValue = 0.08 * sin(timeValue * (0.52 + randomValue.x * 0.35) + indexValue * 1.7);
      let centerValue = vec3<f32>(
        cos(angleValue) * (randomValue.y * radialScale * 0.72 + driftValue),
        -0.92 + phaseValue * 1.72,
        sin(angleValue) * (randomValue.y * radialScale * 0.72 + driftValue)
      );
      let baseRadius = 0.045 + randomValue.x * 0.075;
      let fadeRadius = 1.0 - smoothstep(0.82, 0.97, phaseValue);
      let radiusValue = max(0.006, baseRadius * (0.78 + 0.34 * phaseValue) * fadeRadius);
      nearestDistance = min(nearestDistance, length(position - centerValue) - radiusValue);
    }
    bubbleIndex = bubbleIndex + 1;
  }
  return nearestDistance;
}

fn foamField(position: vec3<f32>) -> f32 {
  let amountValue = clamp(uniformData.bubbleData.z, 0.0, 1.0);
  let timeValue = uniformData.viewportData.z * uniformData.bubbleData.y;
  var nearestDistance = 100.0;
  var foamIndex: i32 = 0;
  loop {
    if (foamIndex >= 30) { break; }
    let indexValue = f32(foamIndex);
    let randomValue = hash31(indexValue + 80.0);
    let enabledValue = step(randomValue.z, amountValue);
    let angleValue = randomValue.x * 6.2831853 + 0.10 * sin(timeValue * 0.34 + indexValue);
    let ringRadius = 0.12 + randomValue.y * 0.56;
    let shellY = sqrt(max(0.0, 1.0 - ringRadius * ringRadius));
    let ageValue = fract(timeValue * (0.035 + randomValue.y * 0.035) + randomValue.x);
    let popValue = sin(ageValue * 3.1415926);
    let centerValue = vec3<f32>(
      cos(angleValue) * ringRadius,
      shellY * 0.92 + 0.03 + 0.07 * popValue,
      sin(angleValue) * ringRadius
    );
    let radiusValue = (0.035 + 0.055 * randomValue.z) * (0.65 + 0.55 * popValue);
    let candidateDistance = length(position - centerValue) - radiusValue;
    nearestDistance = min(nearestDistance, candidateDistance + (1.0 - enabledValue) * 10.0);
    foamIndex = foamIndex + 1;
  }
  return nearestDistance;
}

fn internalField(position: vec3<f32>) -> vec2<f32> {
  let bubbleDistance = bubbleField(position);
  let foamDistance = foamField(position);
  if (foamDistance < bubbleDistance) { return vec2<f32>(foamDistance, 2.0); }
  return vec2<f32>(bubbleDistance, 1.0);
}

fn fieldNormal(position: vec3<f32>, materialId: f32) -> vec3<f32> {
  let epsilonValue = 0.0022;
  let xAxis = vec3<f32>(epsilonValue, 0.0, 0.0);
  let yAxis = vec3<f32>(0.0, epsilonValue, 0.0);
  let zAxis = vec3<f32>(0.0, 0.0, epsilonValue);
  if (materialId > 1.5) {
    return normalize(vec3<f32>(
      foamField(position + xAxis) - foamField(position - xAxis),
      foamField(position + yAxis) - foamField(position - yAxis),
      foamField(position + zAxis) - foamField(position - zAxis)
    ));
  }
  return normalize(vec3<f32>(
    bubbleField(position + xAxis) - bubbleField(position - xAxis),
    bubbleField(position + yAxis) - bubbleField(position - yAxis),
    bubbleField(position + zAxis) - bubbleField(position - zAxis)
  ));
}
