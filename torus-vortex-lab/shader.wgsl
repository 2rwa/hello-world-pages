struct Controls {
  viewport: vec4f,
  camera: vec4f,
  flow: vec4f,
  material: vec4f,
  extras: vec4f,
};
@group(0) @binding(0) var<uniform> ctrl: Controls;

const MAIN_RADIUS: f32 = 1.23;
const TUBE_RADIUS: f32 = 0.48;
const PI_VALUE: f32 = 3.14159265;

@vertex
fn vsMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corners = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(corners[index], 0.0, 1.0);
}

fn torusDistance(pos: vec3f) -> f32 {
  let section = vec2f(length(pos.xz) - MAIN_RADIUS, pos.y);
  return length(section) - TUBE_RADIUS;
}

fn torusNormal(pos: vec3f) -> vec3f {
  let ringDistance = max(length(pos.xz), 0.0001);
  let radial = ringDistance - MAIN_RADIUS;
  return normalize(vec3f(pos.x * radial / ringDistance, pos.y, pos.z * radial / ringDistance));
}

fn colorBackground(ray: vec3f, pixel: vec2f) -> vec3f {
  let vertical = clamp(ray.y * 0.5 + 0.5, 0.0, 1.0);
  let base = vec3f(0.009, 0.023, 0.040) + vertical * vec3f(0.013, 0.021, 0.033);
  let centered = (pixel * 2.0 - ctrl.viewport.xy) / ctrl.viewport.y;
  let aura = exp(-dot(centered, centered) * 1.35);
  let faintStars = pow(max(0.0, sin(pixel.x * 0.97 + pixel.y * 1.13) * sin(pixel.y * 1.71 - pixel.x * 0.61)), 38.0) * 0.045;
  return base + aura * vec3f(0.009, 0.033, 0.044) + vec3f(faintStars * 0.3, faintStars * 0.7, faintStars);
}

// Toroidal flow is described by angular advection around the major circle,
// plus a helical rotation around the tube's minor circle.
fn volumeSample(pos: vec3f, elapsed: f32, marchStep: f32) -> vec4f {
  let ringDistance = length(pos.xz);
  let radial = ringDistance - MAIN_RADIUS;
  let section = vec2f(radial, pos.y);
  let sectionRadius = length(section);
  let ringAngle = atan2(pos.z, pos.x);
  let sectionAngle = atan2(pos.y, radial);
  let waterAngle = ringAngle - elapsed * ctrl.flow.x * 0.40;
  let smokeAngle = ringAngle - elapsed * ctrl.flow.y * 0.35;
  let turbulence = ctrl.flow.w;
  let swirl = sectionAngle + ringAngle * ctrl.flow.z * 0.55;
  let watCurl = swirl + 1.3 * sin(waterAngle * 3.0 - elapsed * ctrl.flow.x * 1.8);
  let smoCurl = swirl - 1.1 * sin(smokeAngle * 4.0 + elapsed * ctrl.flow.y * 1.25);

  let waterWave = (0.050 + turbulence * 0.031) * sin(waterAngle * 5.0 + sin(watCurl * 2.0));
  let level = ctrl.material.x + waterWave;
  let waterFactor = 1.0 - smoothstep(-0.075, 0.095, pos.y - level);
  let edgeMask = 1.0 - smoothstep(0.375, 0.457, sectionRadius);
  let ribbonA = sin(waterAngle * 16.0 + watCurl * 3.2 + 1.5 * sin(waterAngle * 6.0 - watCurl * 2.0));
  let ribbonB = sin(waterAngle * 31.0 - watCurl * 5.5 + turbulence * sin(waterAngle * 9.0 + watCurl));
  let waterSwirl = 0.5 + 0.5 * ribbonA;
  let waterFoam = pow(max(0.0, ribbonB * 0.5 + ribbonA * 0.5), 5.0);
  let caustic = 0.5 + 0.5 * sin(waterAngle * 20.0 - watCurl * 7.0);
  let waterColor = vec3f(0.015, 0.31, 0.44) + waterSwirl * vec3f(0.025, 0.36, 0.25)
    + waterFoam * vec3f(0.50, 0.50, 0.39) + caustic * vec3f(0.0, 0.065, 0.085);
  let waterAlpha = edgeMask * waterFactor * marchStep * (1.8 + waterFoam * 3.5);

  let smokeN1 = sin(smokeAngle * 14.0 + smoCurl * 3.8 + turbulence * sin(smokeAngle * 7.0 - smoCurl * 3.0));
  let smokeN2 = sin(smokeAngle * 26.0 - smoCurl * 7.0 + turbulence * sin(smokeAngle * 12.0 + smoCurl * 5.0));
  let smokeN3 = sin(smokeAngle * 45.0 + smoCurl * 11.0 - elapsed * 0.19);
  let smokeTurb = 0.45 * smokeN1 + 0.38 * smokeN2 + 0.17 * smokeN3;
  let strand = smoothstep(-0.22, 0.49, smokeTurb);
  let plume = pow(strand, 1.6) * (0.6 + 0.4 * sin(smoCurl * 2.0 + smokeAngle * 3.0));
  let smokeColor = vec3f(0.44, 0.29, 0.65) + strand * vec3f(0.37, 0.45, 0.35)
    + vec3f(0.075, 0.05, 0.11) * sin(smoCurl * 4.0);
  let smokeAlpha = edgeMask * (1.0 - waterFactor) * ctrl.material.y * marchStep * (0.22 + plume * 3.9);

  let combinedAlpha = clamp(waterAlpha + smokeAlpha, 0.0, 0.27);
  let mediumColor = (waterColor * waterAlpha + smokeColor * smokeAlpha) / max(combinedAlpha, 0.00001);
  return vec4f(mediumColor, combinedAlpha);
}

@fragment
fn fsMain(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let uv = (pixel.xy * 2.0 - ctrl.viewport.xy) / ctrl.viewport.y;
  let heading = ctrl.camera.x;
  let elevation = ctrl.camera.y;
  let eye = ctrl.camera.z * vec3f(sin(heading) * cos(elevation), sin(elevation), cos(heading) * cos(elevation));
  let forwardAxis = normalize(-eye);
  let rightAxis = normalize(cross(forwardAxis, vec3f(0.0, 1.0, 0.0)));
  let upAxis = cross(rightAxis, forwardAxis);
  let direction = normalize(forwardAxis * 1.92 + rightAxis * uv.x - upAxis * uv.y);
  let background = colorBackground(direction, pixel.xy);

  var travel = 0.0;
  var foundSurface = false;
  for (var outerStep = 0; outerStep < 72; outerStep = outerStep + 1) {
    let signedDistance = torusDistance(eye + direction * travel);
    if (signedDistance < 0.004) {
      foundSurface = true;
      break;
    }
    travel = travel + max(0.006, signedDistance * 0.88);
    if (travel > 9.0) { break; }
  }
  if (!foundSurface) { return vec4f(pow(background, vec3f(0.88)), 1.0); }

  let surfacePos = eye + direction * travel;
  let frontNormal = torusNormal(surfacePos);
  let fresnel = pow(1.0 - clamp(dot(frontNormal, -direction), 0.0, 1.0), 3.0);
  let elapsed = ctrl.viewport.z;
  let marchStep = 0.95 / max(ctrl.viewport.w, 1.0);
  var volumeColor = vec3f(0.0);
  var transmittance = 1.0;
  var sampleT = travel + 0.013;

  // Bounded fixed-step integration: smoke density is not a signed distance field.
  for (var sampleIndex = 0; sampleIndex < 112; sampleIndex = sampleIndex + 1) {
    if (f32(sampleIndex) >= ctrl.viewport.w) { break; }
    let samplePos = eye + sampleT * direction;
    if (torusDistance(samplePos) > 0.011) { break; }
    let medium = volumeSample(samplePos, elapsed, marchStep);
    volumeColor = volumeColor + transmittance * medium.rgb * medium.a;
    transmittance = transmittance * (1.0 - medium.a);
    sampleT = sampleT + marchStep;
    if (transmittance < 0.03) { break; }
  }

  // Fresnel rim, iridescent reflections, and a traveling thread on the surface.
  let diffuseLight = max(dot(frontNormal, normalize(vec3f(-0.44, 0.83, 0.35))), 0.0);
  let brightSpot = pow(max(dot(reflect(direction, frontNormal), normalize(vec3f(0.38, 0.83, 0.40))), 0.0), 52.0);
  let ringAngle = atan2(surfacePos.z, surfacePos.x);
  let sectionAngle = atan2(surfacePos.y, length(surfacePos.xz) - MAIN_RADIUS);
  let tracer = pow(max(0.0, sin(ringAngle * 23.0 - elapsed * ctrl.flow.x * 4.5 + sectionAngle * 5.0)), 22.0);
  let rainbow = vec3f(0.14 + 0.12 * sin(sectionAngle * 3.0), 0.32 + 0.13 * cos(ringAngle * 5.0), 0.49);
  let glassLight = ctrl.material.z * (fresnel * (0.42 + 0.23 * diffuseLight) * rainbow
    + brightSpot * vec3f(0.72, 0.94, 0.97) * 0.65
    + tracer * vec3f(0.08, 0.31, 0.38) * 0.10);
  let refractionGlow = (1.0 - fresnel) * 0.17 * diffuseLight * vec3f(0.04, 0.15, 0.20);
  let throughColor = volumeColor + transmittance * background * 0.72;
  let shaded = throughColor * (1.0 - fresnel * 0.26) + glassLight + refractionGlow;
  let finalColor = shaded * (0.78 + 0.32 * ctrl.material.w);
  return vec4f(pow(max(finalColor, vec3f(0.0)), vec3f(0.85)), 1.0);
}
