
const WORLD_RADIUS_VALUE:f32=24.0;
const MAX_DIG_COUNT:u32=32u;
const EYE_COUNT:u32=12u;
struct FrameUniforms{
  resolution:vec2f,
  timeSeconds:f32,
  digCountValue:f32,
  cameraPosition:vec4f,
  cameraForward:vec4f,
  cameraRight:vec4f,
  cameraUp:vec4f,
  gameplayData:vec4f,
};
@group(0) @binding(0) var<uniform> frameData:FrameUniforms;
@group(0) @binding(1) var<storage,read> digSphereData:array<vec4f,32>;
const eyeCenters=array<vec3f,12>(
  vec3f(-6.2,3.2,8.85),vec3f(0.0,4.0,8.85),vec3f(6.1,2.8,8.85),vec3f(-3.2,-3.4,8.85),vec3f(4.1,-2.8,8.85),
  vec3f(-7.0,2.4,1.85),vec3f(-1.8,-3.7,1.85),vec3f(4.4,3.4,1.85),vec3f(7.3,-1.7,1.85),
  vec3f(-5.5,3.6,-6.15),vec3f(0.7,-3.8,-6.15),vec3f(5.9,2.6,-6.15)
);
fn distanceSphere(samplePosition:vec3f,sphereCenter:vec3f,sphereRadius:f32)->f32{return length(samplePosition-sphereCenter)-sphereRadius;}
fn distanceBox(samplePosition:vec3f,boxCenter:vec3f,boxHalfSize:vec3f)->f32{
  let offsetValue=abs(samplePosition-boxCenter)-boxHalfSize;
  return length(max(offsetValue,vec3f(0.0)))+min(max(offsetValue.x,max(offsetValue.y,offsetValue.z)),0.0);
}
fn distanceTorusZ(samplePosition:vec3f,torusCenter:vec3f,majorRadius:f32,minorRadius:f32)->f32{
  let localPosition=samplePosition-torusCenter;
  let torusPlane=vec2f(length(localPosition.xy)-majorRadius,localPosition.z);
  return length(torusPlane)-minorRadius;
}
fn carvedWallDistance(samplePosition:vec3f,boxCenter:vec3f,boxHalfSize:vec3f)->f32{
  var wallDistanceValue=distanceBox(samplePosition,boxCenter,boxHalfSize);
  let digCountLimit=min(u32(frameData.digCountValue),MAX_DIG_COUNT);
  for(var digIndex:u32=0u;digIndex<MAX_DIG_COUNT;digIndex=digIndex+1u){
    if(digIndex<digCountLimit){
      let digSphere=digSphereData[digIndex];
      let digDistanceValue=distanceSphere(samplePosition,digSphere.xyz,digSphere.w);
      wallDistanceValue=max(wallDistanceValue,-digDistanceValue);
    }
  }
  return wallDistanceValue;
}
fn sceneField(samplePosition:vec3f)->vec2f{
  var nearestDistance=WORLD_RADIUS_VALUE-length(samplePosition);
  var materialIndex=1.0;
  let wallDistanceA=carvedWallDistance(samplePosition,vec3f(0.0,0.0,8.0),vec3f(24.0,24.0,0.72));
  if(wallDistanceA<nearestDistance){nearestDistance=wallDistanceA;materialIndex=2.0;}
  let wallDistanceB=carvedWallDistance(samplePosition,vec3f(0.0,0.0,1.0),vec3f(24.0,24.0,0.72));
  if(wallDistanceB<nearestDistance){nearestDistance=wallDistanceB;materialIndex=2.0;}
  let wallDistanceC=carvedWallDistance(samplePosition,vec3f(0.0,0.0,-7.0),vec3f(24.0,24.0,0.72));
  if(wallDistanceC<nearestDistance){nearestDistance=wallDistanceC;materialIndex=2.0;}
  for(var eyeIndex:u32=0u;eyeIndex<EYE_COUNT;eyeIndex=eyeIndex+1u){
    let eyeDistanceValue=distanceSphere(samplePosition,eyeCenters[eyeIndex],0.56);
    if(eyeDistanceValue<nearestDistance){nearestDistance=eyeDistanceValue;materialIndex=4.0+f32(eyeIndex)*0.001;}
  }
  let exitRingDistance=distanceTorusZ(samplePosition,vec3f(0.0,0.0,-18.2),1.35,0.20);
  if(exitRingDistance<nearestDistance){nearestDistance=exitRingDistance;materialIndex=3.0;}
  return vec2f(nearestDistance,materialIndex);
}
fn estimateNormal(surfacePosition:vec3f)->vec3f{
  let normalEpsilon=0.0025;
  let baseDistance=sceneField(surfacePosition).x;
  let normalVector=vec3f(
    sceneField(surfacePosition+vec3f(normalEpsilon,0.0,0.0)).x-baseDistance,
    sceneField(surfacePosition+vec3f(0.0,normalEpsilon,0.0)).x-baseDistance,
    sceneField(surfacePosition+vec3f(0.0,0.0,normalEpsilon)).x-baseDistance
  );
  return normalize(normalVector);
}
fn hashValue(inputValue:f32)->f32{return fract(sin(inputValue*91.3458)*47453.5453);}
fn materialColor(surfacePosition:vec3f,surfaceNormal:vec3f,materialIndex:f32)->vec3f{
  if(materialIndex>3.9){
    let eyeIndex=u32((materialIndex-4.0)*1000.0+0.5);
    let safeEyeIndex=min(eyeIndex,EYE_COUNT-1u);
    let eyeCenter=eyeCenters[safeEyeIndex];
    let eyeSurfaceDirection=normalize(surfacePosition-eyeCenter);
    let gazeDirection=normalize(frameData.cameraPosition.xyz-eyeCenter);
    let irisAlignment=dot(eyeSurfaceDirection,gazeDirection);
    let irisMask=smoothstep(0.78,0.94,irisAlignment);
    let pupilMask=smoothstep(0.955,0.992,irisAlignment);
    let alertFraction=clamp(frameData.gameplayData.x,0.0,1.0);
    let scleraColor=vec3f(0.82,0.86,0.84)*(0.9+0.1*surfaceNormal.y);
    let irisColor=mix(vec3f(0.08,0.52,0.62),vec3f(0.78,0.10,0.06),alertFraction);
    var eyeColor=mix(scleraColor,irisColor,irisMask);
    eyeColor=mix(eyeColor,vec3f(0.004,0.006,0.008),pupilMask);
    return eyeColor;
  }
  if(materialIndex>2.5){return vec3f(0.18,1.45,1.10);}
  if(materialIndex>1.5){
    let grain=0.88+0.12*hashValue(floor(surfacePosition.x*2.3)+floor(surfacePosition.y*1.7)*17.0+floor(surfacePosition.z*2.1)*41.0);
    return vec3f(0.18,0.22,0.26)*grain;
  }
  let shellBands=0.88+0.12*sin(surfacePosition.y*2.1+surfacePosition.x*0.35);
  return vec3f(0.11,0.14,0.18)*shellBands;
}
fn skyColor(rayDirection:vec3f)->vec3f{
  let horizonFactor=pow(max(0.0,1.0-abs(rayDirection.y)),3.0);
  return vec3f(0.005,0.008,0.015)+vec3f(0.012,0.020,0.030)*horizonFactor;
}
@vertex fn vertexMain(@builtin(vertex_index) vertexIndex:u32)->@builtin(position) vec4f{
  var vertexPosition=vec2f(0.0);
  if(vertexIndex==0u){vertexPosition=vec2f(-1.0,-1.0);}else if(vertexIndex==1u){vertexPosition=vec2f(3.0,-1.0);}else{vertexPosition=vec2f(-1.0,3.0);}
  return vec4f(vertexPosition,0.0,1.0);
}
@fragment fn fragmentMain(@builtin(position) fragmentPosition:vec4f)->@location(0) vec4f{
  let resolutionValue=max(frameData.resolution,vec2f(1.0));
  var screenPoint=vec2f(fragmentPosition.x/resolutionValue.x*2.0-1.0,1.0-fragmentPosition.y/resolutionValue.y*2.0);
  screenPoint.x=screenPoint.x*(resolutionValue.x/resolutionValue.y);
  let rayDirection=normalize(frameData.cameraForward.xyz+screenPoint.x*frameData.cameraRight.xyz*0.86+screenPoint.y*frameData.cameraUp.xyz*0.86);
  let rayOrigin=frameData.cameraPosition.xyz;
  var travelDistance=0.0;
  var hitMaterial=0.0;
  var hitFlag=false;
  for(var marchIndex:u32=0u;marchIndex<112u;marchIndex=marchIndex+1u){
    let samplePosition=rayOrigin+rayDirection*travelDistance;
    let fieldValue=sceneField(samplePosition);
    if(abs(fieldValue.x)<0.0028||fieldValue.x<0.0){hitFlag=true;hitMaterial=fieldValue.y;break;}
    travelDistance=travelDistance+max(abs(fieldValue.x)*0.70,0.012);
    if(travelDistance>58.0){break;}
  }
  var finalColor=skyColor(rayDirection);
  if(hitFlag){
    let hitPosition=rayOrigin+rayDirection*travelDistance;
    let surfaceNormal=estimateNormal(hitPosition);
    let headLampDirection=normalize(frameData.cameraPosition.xyz-hitPosition);
    let diffuseAmount=max(dot(surfaceNormal,headLampDirection),0.0);
    let halfDirection=normalize(headLampDirection-rayDirection);
    let specularAmount=pow(max(dot(surfaceNormal,halfDirection),0.0),36.0);
    var baseColor=materialColor(hitPosition,surfaceNormal,hitMaterial);
    let distanceFade=1.0/(1.0+travelDistance*travelDistance*0.006);
    let rimAmount=pow(1.0-max(dot(surfaceNormal,-rayDirection),0.0),3.0);
    finalColor=baseColor*(0.12+1.35*diffuseAmount*distanceFade)+vec3f(0.42,0.55,0.66)*specularAmount*0.7+baseColor*rimAmount*0.18;
    if(hitMaterial>2.5&&hitMaterial<3.5){finalColor=finalColor+vec3f(0.05,0.65,0.42)*(1.2+0.5*sin(frameData.timeSeconds*4.0));}
    if(frameData.gameplayData.y>0.01&&hitMaterial>3.9){finalColor=finalColor+vec3f(0.15,0.45,0.60)*frameData.gameplayData.y;}
    let fogFactor=1.0-exp(-travelDistance*0.035);
    finalColor=mix(finalColor,vec3f(0.015,0.022,0.032),fogFactor*0.48);
  }
  let vignetteCoordinate=fragmentPosition.xy/resolutionValue-vec2f(0.5);
  let vignetteFactor=1.0-clamp(dot(vignetteCoordinate,vignetteCoordinate)*1.25,0.0,0.55);
  finalColor=finalColor*vignetteFactor;
  finalColor=finalColor/(finalColor+vec3f(1.0));
  finalColor=pow(finalColor,vec3f(0.4545));
  return vec4f(finalColor,1.0);
}
