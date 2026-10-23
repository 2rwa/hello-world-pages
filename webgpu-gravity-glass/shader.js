export const wgsl = /* wgsl */ `
struct FrameData {
  screen: vec4f,
  control: vec4f,
  beads: array<vec4f, 5>,
  spins: array<vec4f, 5>,
};
@group(0) @binding(0) var<uniform> frame: FrameData;
struct VertexOut { @builtin(position) position: vec4f, };
@vertex fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var output: VertexOut;
  let xy = array<vec2f, 3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  output.position = vec4f(xy[vertexIndex],0.0,1.0);
  return output;
}
fn quatUnrotate(vectorValue: vec3f, q: vec4f) -> vec3f {
  let qvec = -q.xyz;
  let delta = 2.0*cross(qvec,vectorValue);
  return vectorValue + q.w*delta + cross(qvec,delta);
}
fn boardShade(boardPoint: vec2f) -> vec3f {
  let radialDistance = length(boardPoint);
  let boundary = min(frame.screen.z-abs(boardPoint.x),frame.screen.w-abs(boardPoint.y));
  let vignette = 1.0 - 0.22*clamp(radialDistance/max(frame.screen.w,frame.screen.z),0.0,1.0);
  var shade = mix(vec3f(0.027,0.085,0.12),vec3f(0.041,0.14,0.18),
    clamp(boardPoint.y/(frame.screen.w*2.0)+0.5,0.0,1.0))*vignette;
  let gx=fract(boardPoint.x*1.5);
  let gy=fract(boardPoint.y*1.5);
  let gridEdge=min(min(gx,1.0-gx),min(gy,1.0-gy));
  shade += vec3f(0.022,0.063,0.076)*(1.0-smoothstep(0.005,0.028,gridEdge));
  let ringRadius=min(frame.screen.z,frame.screen.w)*0.84;
  shade += vec3f(0.045,0.22,0.27)*(1.0-smoothstep(0.025,0.065,abs(radialDistance-ringRadius)));
  shade += vec3f(0.07,0.28,0.3)*(1.0-smoothstep(0.02,0.065,radialDistance));
  let frameLine=1.0-smoothstep(0.025,0.085,boundary);
  shade=mix(shade,vec3f(0.10,0.35,0.40),frameLine*0.78);
  for(var idx=0u;idx<5u;idx=idx+1u) {
    let beadInfo=frame.beads[idx];
    if(beadInfo.w<=0.0){continue;}
    let radius2D=length(boardPoint-beadInfo.xy);
    let shadow=exp(-radius2D*radius2D/(beadInfo.w*beadInfo.w*2.7));
    let caustic=exp(-pow((radius2D-beadInfo.w*0.82)/(beadInfo.w*0.17),2.0));
    shade *= (1.0-shadow*0.51);
    shade += caustic*vec3f(0.035,0.22,0.27);
  }
  return shade;
}
fn skyReflection(directionValue: vec3f) -> vec3f {
  let horizon=pow(clamp(1.0-abs(directionValue.z),0.0,1.0),1.6);
  let paneX=1.0-smoothstep(0.15,0.27,abs(directionValue.x+0.32));
  let paneY=1.0-smoothstep(0.16,0.28,abs(directionValue.y-0.24));
  let thinStrip=(1.0-smoothstep(0.02,0.075,abs(directionValue.x-0.45)))*
    (1.0-smoothstep(0.12,0.5,abs(directionValue.y+0.35)));
  return vec3f(0.12,0.32,0.40)+horizon*vec3f(0.15,0.27,0.3)+
    paneX*paneY*vec3f(0.82,0.94,0.99)+thinStrip*vec3f(0.42,0.75,0.82);
}
fn sphereHit(rayOrigin: vec3f,rayDir: vec3f,sphereCentre: vec3f,radiusValue: f32) -> f32 {
  let relative=rayOrigin-sphereCentre;
  let projection=dot(relative,rayDir);
  let discriminant=projection*projection-dot(relative,relative)+radiusValue*radiusValue;
  if(discriminant<0.0){return -1.0;}
  let nearDistance=-projection-sqrt(discriminant);
  if(nearDistance>0.0){return nearDistance;}
  return -1.0;
}
fn glassShade(entryPoint: vec3f,rayDir: vec3f,sphereCentre: vec3f,
  radiusValue: f32,spinValue: vec4f,beadIndex: u32) -> vec3f {
  let surfaceNormal=normalize(entryPoint-sphereCentre);
  let glassIOR=1.49;
  let refractedIn=refract(rayDir,surfaceNormal,1.0/glassIOR);
  let exitDistance=max(0.0,-2.0*dot(entryPoint-sphereCentre,refractedIn));
  let exitPoint=entryPoint+refractedIn*exitDistance;
  let exitNormal=normalize(exitPoint-sphereCentre);
  var refractedOut=refract(refractedIn,-exitNormal,glassIOR);
  if(length(refractedOut)<0.01){refractedOut=reflect(refractedIn,-exitNormal);}
  let boardTravel=max(0.0,-exitPoint.z/min(refractedOut.z,-0.08));
  let projected=exitPoint.xy+refractedOut.xy*boardTravel;
  let under=boardShade(projected);
  let lightDir=normalize(vec3f(-0.36,0.45,0.82));
  let diffuse=max(dot(surfaceNormal,lightDir),0.0);
  let tint=vec3f(0.83,0.97,0.99)-f32(beadIndex)*vec3f(0.02,0.008,0.0);
  let absorb=exp(-vec3f(0.38,0.11,0.085)*exitDistance);
  let fresnelBase=pow((glassIOR-1.0)/(glassIOR+1.0),2.0);
  let facing=clamp(dot(-rayDir,surfaceNormal),0.0,1.0);
  let fresnelFactor=fresnelBase+(1.0-fresnelBase)*pow(1.0-facing,5.0);
  let reflectedRay=reflect(rayDir,surfaceNormal);
  var glassColor=mix(under*tint*absorb*1.65,skyReflection(reflectedRay),fresnelFactor*0.95);
  glassColor += vec3f(0.035,0.09,0.10)*diffuse;
  glassColor += vec3f(0.8,0.95,1.0)*pow(max(dot(reflectedRay,lightDir),0.0),115.0)*1.15;
  let localN=quatUnrotate(surfaceNormal,spinValue);
  let inclusion=1.0-smoothstep(0.065,0.13,
    distance(localN,normalize(vec3f(0.32,-0.12,0.94))));
  glassColor=mix(glassColor,vec3f(0.19,0.76,0.82),inclusion*0.56);
  return glassColor;
}
@fragment fn fragmentMain(@builtin(position) pixelPosition: vec4f) -> @location(0) vec4f {
  let screenUV=pixelPosition.xy/frame.screen.xy;
  let planeXY=vec2f((screenUV.x*2.0-1.0)*frame.screen.z,
    (1.0-screenUV.y*2.0)*frame.screen.w);
  let rayOrigin=vec3f(planeXY,9.0);
  let rayDir=vec3f(0.0,0.0,-1.0);
  var finalColor=boardShade(planeXY);
  var nearestHit=1e6;
  for(var idx=0u;idx<5u;idx=idx+1u){
    let beadInfo=frame.beads[idx];
    if(beadInfo.w<=0.0){continue;}
    let sphereCentre=vec3f(beadInfo.xy,beadInfo.w);
    let hitDistance=sphereHit(rayOrigin,rayDir,sphereCentre,beadInfo.w);
    if(hitDistance>0.0 && hitDistance<nearestHit){
      nearestHit=hitDistance;
      let entry=rayOrigin+hitDistance*rayDir;
      finalColor=glassShade(entry,rayDir,sphereCentre,beadInfo.w,frame.spins[idx],idx);
    }
  }
  var mapped=finalColor/(vec3f(1.0)+finalColor*0.28);
  mapped *= 1.0-0.16*smoothstep(0.26,0.8,length(screenUV-vec2f(0.5,0.5)));
  return vec4f(clamp(mapped,vec3f(0.0),vec3f(1.0)),1.0);
}
`;
