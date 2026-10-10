struct Simulation {
  viewport: vec4f,
  camera: vec4f,
  controls: vec4f,
  balls: array<vec4f,80>,
  tints: array<vec4f,80>,
};
@group(0) @binding(0) var<uniform> sim: Simulation;

@vertex fn vs(@builtin(vertex_index) vertexIndex:u32)->@builtin(position) vec4f {
  var corners=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  return vec4f(corners[vertexIndex],0.0,1.0);
}
fn roots(rayOrigin:vec3f, rayDir:vec3f, centerPos:vec3f, sphereRadius:f32)->vec2f {
  let offset=rayOrigin-centerPos;
  let halfB=dot(offset,rayDir);
  let discriminant=halfB*halfB-dot(offset,offset)+sphereRadius*sphereRadius;
  if(discriminant<0.0){return vec2f(-1.0,-1.0);}
  let root=sqrt(discriminant);
  return vec2f(-halfB-root,-halfB+root);
}
fn smoothMinimum(d1:f32,d2:f32,smoothingWidth:f32)->f32 {
  let mixAmount=max(smoothingWidth-abs(d1-d2),0.0)/smoothingWidth;
  return min(d1,d2)-mixAmount*mixAmount*smoothingWidth*0.25;
}
fn metaField(samplePos:vec3f)->vec4f {
  var minDist=10.0;
  var colorSum=vec3f(0.0);
  var weightSum=0.0;
  let smoothWidth=0.19;
  for(var i=0u;i<80u;i++){
    if(f32(i)>=sim.controls.y){break;}
    let particle=sim.balls[i];
    if(sim.tints[i].w>0.5 || particle.w<0.001){continue;}
    let dist=length(samplePos-particle.xyz)-particle.w;
    minDist=smoothMinimum(minDist,dist,smoothWidth);
    let weight=1.0/pow(0.09+abs(dist),3.0);
    colorSum+=sim.tints[i].xyz*weight;
    weightSum+=weight;
  }
  return vec4f(minDist,colorSum/max(weightSum,0.00001));
}
fn marchMeta(rayOrigin:vec3f,rayDir:vec3f,maxDistance:f32)->f32 {
  var travel=0.0;
  for(var stepIndex=0;stepIndex<104;stepIndex++){
    let dist=metaField(rayOrigin+rayDir*travel).x;
    if(dist<0.006){return travel;}
    travel+=clamp(dist*0.72,0.008,0.16);
    if(travel>maxDistance){break;}
  }
  return -1.0;
}
// Smooth union of translucent droplets; this is not a true SDF.
// March with a safety factor and refine sign crossings.
fn glassField(samplePos:vec3f)->f32 {
  var surfaceDistance=8.0;
  let mergeWidth=max(sim.controls.x,0.012);
  for(var beadIndex=0u;beadIndex<80u;beadIndex++){
    if(f32(beadIndex)>=sim.controls.y){break;}
    if(sim.tints[beadIndex].w<0.5){continue;}
    let bead=sim.balls[beadIndex];
    let localDistance=length(samplePos-bead.xyz)-bead.w;
    surfaceDistance=smoothMinimum(surfaceDistance,localDistance,mergeWidth);
  }
  return surfaceDistance;
}
fn glassNormal(surfacePos:vec3f)->vec3f {
  let delta=.014;
  let normalDiff=vec3f(
    glassField(surfacePos+vec3f(delta,0.0,0.0))-glassField(surfacePos-vec3f(delta,0.0,0.0)),
    glassField(surfacePos+vec3f(0.0,delta,0.0))-glassField(surfacePos-vec3f(0.0,delta,0.0)),
    glassField(surfacePos+vec3f(0.0,0.0,delta))-glassField(surfacePos-vec3f(0.0,0.0,delta)));
  return normalize(normalDiff+vec3f(0.000001));
}
fn marchGlass(rayOrigin:vec3f,rayDir:vec3f,maxDistance:f32)->f32 {
  var travel=0.0;
  for(var stepIndex=0;stepIndex<92;stepIndex++) {
    let localDistance=glassField(rayOrigin+rayDir*travel);
    if(localDistance<.004){return travel;}
    travel+=clamp(localDistance*.64,.005,.135);
    if(travel>maxDistance){break;}
  }
  return -1.0;
}
// Traverse the interior of the *merged* glass field rather than individual spheres.
fn glassExit(insideOrigin:vec3f,insideDir:vec3f,maxTravel:f32)->f32 {
  var currentTravel=0.0;
  var previousTravel=0.0;
  for(var stepIndex=0;stepIndex<100;stepIndex++) {
    let localDistance=glassField(insideOrigin+insideDir*currentTravel);
    if(localDistance>=0.0 && currentTravel>0.0001) {
      var lo=previousTravel;
      var hi=currentTravel;
      for(var refine=0;refine<7;refine++){
        let mid=(lo+hi)*0.5;
        if(glassField(insideOrigin+insideDir*mid)<0.0){lo=mid;}else{hi=mid;}
      }
      return (lo+hi)*0.5;
    }
    previousTravel=currentTravel;
    currentTravel+=clamp(-localDistance*.78,.008,.125);
    if(currentTravel>maxTravel){break;}
  }
  return -1.0;
}
fn metaNormal(surfacePos:vec3f)->vec3f {
  let eps=0.010;
  return normalize(vec3f(
    metaField(surfacePos+vec3f(eps,0.0,0.0)).x-metaField(surfacePos-vec3f(eps,0.0,0.0)).x,
    metaField(surfacePos+vec3f(0.0,eps,0.0)).x-metaField(surfacePos-vec3f(0.0,eps,0.0)).x,
    metaField(surfacePos+vec3f(0.0,0.0,eps)).x-metaField(surfacePos-vec3f(0.0,0.0,eps)).x));
}
