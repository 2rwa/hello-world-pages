from pathlib import Path

path = Path("tests/crystal-dice-fanfare/index.html")
text = path.read_text()

start = text.index("fn shadeCrystal(")
end = text.index("fn shadeFloor(", start)

replacement = r'''fn shadeCrystal(hitPosition: vec3<f32>, rayDirection: vec3<f32>) -> vec3<f32> {
  let localPoint = localPosition(hitPosition);
  let normalValue = dieNormalWorld(hitPosition);
  let baseNormal = dieBaseNormalWorld(hitPosition);
  let viewDirection = -rayDirection;
  let facingValue = clamp(dot(normalValue,viewDirection),0.0,1.0);
  let fresnelValue = 0.025 + 0.975*pow(1.0-facingValue,5.0);
  let reflectionColor = environmentColor(reflect(rayDirection,normalValue));

  let refractiveIndex = uniformData.effectData.z;
  var innerDirection = refract(rayDirection,normalValue,1.0/refractiveIndex);
  if (length(innerDirection) < 0.001) {
    innerDirection = reflect(rayDirection,normalValue);
  } else {
    innerDirection = safeNormalize(innerDirection);
  }

  let insideStart = hitPosition + innerDirection*0.012;
  let exitInfo = marchDieExit(insideStart,innerDirection);
  var transmittedColor = environmentColor(innerDirection);
  let thicknessValue = exitInfo.x;
  if (exitInfo.y > 0.5) {
    let exitPosition = insideStart + innerDirection*exitInfo.x;
    let exitNormal = dieNormalWorld(exitPosition);
    var exitDirection = refract(innerDirection,-exitNormal,refractiveIndex);
    if (length(exitDirection) < 0.001) {
      exitDirection = reflect(innerDirection,-exitNormal);
    }
    transmittedColor = environmentColor(safeNormalize(exitDirection));
  }

  let textureColor = surfaceTextureColor(localPoint);
  let absorptionAmount = exp(-thicknessValue*vec3<f32>(0.075,0.050,0.035));
  var crystalColor = transmittedColor*absorptionAmount*vec3<f32>(0.94,0.975,1.0);
  crystalColor = crystalColor + textureColor*0.012*uniformData.effectData.y;
  crystalColor = blend3(crystalColor,reflectionColor,min(fresnelValue*0.95,0.90));

  let lightDirection = safeNormalize(vec3<f32>(-0.55,0.88,-0.31));
  let halfDirection = safeNormalize(lightDirection+viewDirection);
  let highlightValue = pow(max(dot(normalValue,halfDirection),0.0),128.0);
  crystalColor = crystalColor + vec3<f32>(1.18,1.22,1.28)*highlightValue;

  let faceData = faceInformation(localPoint);
  let cavityProximity = pipPatternDistance(faceData.uvRaw,faceData.faceValue);
  let pipEdgeValue = 1.0-smoothstep(0.11,0.22,cavityProximity);
  let geometryDifference = clamp(length(normalValue-baseNormal)*1.5,0.0,1.0);
  crystalColor = crystalColor + vec3<f32>(0.12,0.19,0.28)*(0.20*pipEdgeValue + 0.12*geometryDifference);

  let rimValue = pow(1.0-facingValue,2.2);
  crystalColor = crystalColor + vec3<f32>(0.16,0.28,0.46)*rimValue*0.22;
  return crystalColor;
}

fn resultAura(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, maximumDistance: f32) -> vec3<f32> {
  let resultValue = uniformData.miscData.x;
  if (resultValue < 0.5) {
    return vec3<f32>(0.0);
  }

  let sampleCount = 44.0;
  let boundedDistance = min(maximumDistance,7.5);
  let stepLength = boundedDistance/sampleCount;
  let timeValue = uniformData.viewportData.z;
  let rainbowAmount = uniformData.effectData.y;
  var accumulatedColor = vec3<f32>(0.0);

  for (var sampleIndex = 0; sampleIndex < 44; sampleIndex = sampleIndex + 1) {
    let travelValue = (f32(sampleIndex)+0.5)*stepLength;
    let samplePosition = rayOrigin + rayDirection*travelValue;
    let surfaceDistance = dieDistanceWorld(samplePosition);

    if (surfaceDistance > 0.015 && surfaceDistance < 0.44) {
      let localPoint = localPosition(samplePosition);
      let shellCenter = 0.115 + 0.015*sin(timeValue*1.7 + localPoint.y*5.0);
      let shellValue = exp(-pow((surfaceDistance-shellCenter)/0.105,2.0));

      let orbitAngle = atan2(localPoint.z,localPoint.x);
      let strandWave = 0.5 + 0.5*cos(
        orbitAngle*resultValue +
        localPoint.y*(3.4+resultValue*0.35) -
        timeValue*(1.35+resultValue*0.08)
      );
      let strandValue = 0.30 + 0.70*pow(strandWave,5.0);

      let rainbowUv = fract(
        localPoint.xz*0.21 +
        vec2<f32>(0.50 + timeValue*0.014,0.50 - timeValue*0.010)
      );
      let textureRainbow = textureSampleLevel(rainbowTexture,surfaceSampler,rainbowUv,0.0).rgb;
      let phaseValue =
        orbitAngle*1.8 +
        localPoint.y*3.1 +
        surfaceDistance*12.0 +
        timeValue*0.82 +
        resultValue*0.88;
      let proceduralRainbow = spectralColor(phaseValue);
      let auraColor = blend3(proceduralRainbow,textureRainbow,0.38);

      let heightFade = exp(-abs(localPoint.y)*0.20);
      let breatheValue = 0.88 + 0.12*sin(timeValue*2.2 + resultValue);
      accumulatedColor = accumulatedColor +
        auraColor*shellValue*strandValue*heightFade*breatheValue*stepLength;
    }
  }

  return accumulatedColor*(0.62 + 0.42*rainbowAmount);
}

'''
text = text[:start] + replacement + text[end:]

frag_start = text.index("@fragment\nfn fragmentMain")
frag_end = text.index("</script>\n\n<script type=\"module\">", frag_start)
fragment = r'''@fragment
fn fragmentMain(@builtin(position) fragmentPosition: vec4<f32>) -> @location(0) vec4<f32> {
  let resolutionValue = uniformData.viewportData.xy;
  var screenPosition = fragmentPosition.xy / resolutionValue * 2.0 - vec2<f32>(1.0);
  screenPosition = vec2<f32>(screenPosition.x*(resolutionValue.x/resolutionValue.y),-screenPosition.y);

  let yawValue = uniformData.cameraData.x;
  let pitchValue = uniformData.cameraData.y;
  let cameraRadius = uniformData.cameraData.z;
  let focusPoint = vec3<f32>(0.0,-0.12,0.0);
  let rayOrigin = focusPoint + vec3<f32>(
    cameraRadius*sin(yawValue)*cos(pitchValue),
    cameraRadius*sin(pitchValue),
    -cameraRadius*cos(yawValue)*cos(pitchValue)
  );
  let forwardDirection = safeNormalize(focusPoint-rayOrigin);
  let worldUp = vec3<f32>(0.0,1.0,0.0);
  let rightDirection = safeNormalize(cross(forwardDirection,worldUp));
  let upDirection = safeNormalize(cross(rightDirection,forwardDirection));
  let rayDirection = safeNormalize(forwardDirection + rightDirection*screenPosition.x*0.66 + upDirection*screenPosition.y*0.66);

  let marchResult = marchScene(rayOrigin,rayDirection);
  var colorValue = environmentColor(rayDirection);
  if (marchResult.hitFlag > 0.5) {
    let hitPosition = rayOrigin + rayDirection*marchResult.rayDistance;
    if (marchResult.materialId < 1.5) {
      colorValue = shadeCrystal(hitPosition,rayDirection);
    } else {
      colorValue = shadeFloor(hitPosition,rayDirection);
    }
    let fogAmount = 1.0-exp(-0.008*marchResult.rayDistance*marchResult.rayDistance);
    colorValue = blend3(colorValue,environmentColor(rayDirection),fogAmount);
  }

  var auraLimit = 7.5;
  if (marchResult.hitFlag > 0.5) {
    auraLimit = marchResult.rayDistance;
  }
  colorValue = colorValue + resultAura(rayOrigin,rayDirection,auraLimit);

  let vignetteValue = dot(screenPosition,screenPosition);
  colorValue = colorValue*(1.0-0.14*smoothstep(0.45,2.3,vignetteValue));
  colorValue = colorValue/(colorValue+vec3<f32>(0.82));
  colorValue = pow(max(colorValue,vec3<f32>(0.0)),vec3<f32>(1.0/2.2));
  return vec4<f32>(colorValue,1.0);
}
'''
text = text[:frag_start] + fragment + text[frag_end:]

old = "  const spinAxis=[0.43+Math.random(),0.62+Math.random(),0.31+Math.random()];\n"
new = "  currentResult=0;\n  const spinAxis=[0.43+Math.random(),0.62+Math.random(),0.31+Math.random()];\n"
if old not in text:
    raise SystemExit("startRoll marker missing")
text = text.replace(old,new,1)

text = text.replace(
    "let causticColor = spectralColor(radialValue*3.0+uniformData.viewportData.z*0.35);",
    "let causticColor = spectralColor(radialValue*3.0+uniformData.viewportData.z*0.35+uniformData.miscData.x*0.72);",
    1,
)
text = text.replace(
    "floorColor = floorColor + causticColor*causticBand*causticFade*0.17*uniformData.effectData.y;",
    "floorColor = floorColor + causticColor*causticBand*causticFade*0.08*uniformData.effectData.y*step(0.5,uniformData.miscData.x);",
    1,
)
text = text.replace(
    "resultTextEl.textContent='出目 '+valueValue+' のファンファーレ';",
    "resultTextEl.textContent='出目 '+valueValue+' · 虹色オーラ + ファンファーレ';",
    1,
)

path.write_text(text)
