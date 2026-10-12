struct ControlData {
  controlA: vec4<f32>, // time, width, height, camera distance
  controlB: vec4<f32>, // yaw, pitch, animation, core colour mode
  controlC: vec4<f32>, // quality, glow, turn, unused
};
@group(0) @binding(0) var<uniform> controls: ControlData;

fn sdSphere(pointPos: vec3<f32>, sphereRadius: f32) -> f32 {
  return length(pointPos) - sphereRadius;
}
fn sdBox(pointPos: vec3<f32>, boxHalf: vec3<f32>) -> f32 {
  let signedSize = abs(pointPos) - boxHalf;
  return length(max(signedSize, vec3<f32>(0.0))) + min(max(signedSize.x,max(signedSize.y,signedSize.z)),0.0);
}
fn sdRoundBox(pointPos: vec3<f32>, boxHalf: vec3<f32>, cornerRadius: f32) -> f32 {
  return sdBox(pointPos, boxHalf) - cornerRadius;
}
fn sdCapsule(pointPos: vec3<f32>, endA: vec3<f32>, endB: vec3<f32>, tubeRadius: f32) -> f32 {
  let relPos = pointPos - endA;
  let tangent = endB - endA;
  return length(relPos-tangent*clamp(dot(relPos,tangent)/dot(tangent,tangent),0.0,1.0))-tubeRadius;
}
fn sdTorus(pointPos: vec3<f32>, ringRadius: vec2<f32>) -> f32 {
  return length(vec2<f32>(length(pointPos.xz)-ringRadius.x,pointPos.y))-ringRadius.y;
}
fn rotatePlane(pointPos: vec2<f32>, angle: f32) -> vec2<f32> {
  let angleS = sin(angle);
  let angleC = cos(angle);
  return vec2<f32>(angleC*pointPos.x-angleS*pointPos.y,angleS*pointPos.x+angleC*pointPos.y);
}
fn closer(existingHit: vec2<f32>, surfaceDist: f32, materialId: f32) -> vec2<f32> {
  return select(existingHit,vec2<f32>(surfaceDist,materialId),surfaceDist<existingHit.x);
}

fn modelMap(inputPos: vec3<f32>) -> vec2<f32> {
  var modelPos = inputPos;
  modelPos.y -= 0.07*sin(controls.controlA.x*1.6)*controls.controlB.z;
  modelPos.xz = rotatePlane(modelPos.xz,0.12*sin(controls.controlA.x*0.7)*controls.controlB.z+controls.controlC.z);
  if (length(modelPos)>3.6) { return vec2<f32>(length(modelPos)-3.15,0.0); }
  var hit = vec2<f32>(99.0,0.0);

  // Rounded central machine body, glowing glass reactor and two frame rings.
  hit=closer(hit,sdCapsule(modelPos,vec3<f32>(0.,-.65,0.),vec3<f32>(0.,.78,0.),.41),1.);
  hit=closer(hit,sdRoundBox(modelPos-vec3<f32>(0.,.16,.31),vec3<f32>(.50,.57,.20),.14),5.);
  hit=closer(hit,sdSphere(modelPos-vec3<f32>(0.,.16,.52),.43),3.);
  var reactorPos=modelPos-vec3<f32>(0.,.16,.56);
  hit=closer(hit,sdTorus(vec3<f32>(reactorPos.x,reactorPos.z,reactorPos.y),vec2<f32>(.47,.074)),6.);
  hit=closer(hit,sdSphere(modelPos-vec3<f32>(0.,.16,.85),.12),4.);

  // Head and visor; material IDs are chosen by the closest SDF surface.
  hit=closer(hit,sdSphere(modelPos-vec3<f32>(0.,1.08,.02),.35),1.);
  hit=closer(hit,sdRoundBox(modelPos-vec3<f32>(0.,1.12,.34),vec3<f32>(.285,.135,.058),.064),5.);
  for(var eyeIndex:i32=0;eyeIndex<2;eyeIndex++){
    let side=select(-1.,1.,eyeIndex==1);
    hit=closer(hit,sdRoundBox(modelPos-vec3<f32>(side*.14,1.13,.410),vec3<f32>(.08,.032,.025),.025),4.);
    hit=closer(hit,sdSphere(modelPos-vec3<f32>(side*.32,1.27,.07),.105),6.);
  }
  // Shoulder / forearm actuators, wing spars and plasma weapon pods.
  let swing=.13*sin(controls.controlA.x*2.0)*controls.controlB.z;
  for(var partIndex:i32=0;partIndex<2;partIndex++){
    let side=select(-1.,1.,partIndex==1);
    let shoulder=vec3<f32>(side*.53,.48,.01);
    let elbow=vec3<f32>(side*1.07,.24+swing,.10);
    let wrist=vec3<f32>(side*1.46,.13+swing,.38);
    hit=closer(hit,sdSphere(modelPos-shoulder,.235),6.);
    hit=closer(hit,sdCapsule(modelPos,shoulder,elbow,.16),1.);
    hit=closer(hit,sdSphere(modelPos-elbow,.19),5.);
    hit=closer(hit,sdCapsule(modelPos,elbow,wrist,.195),1.);
    hit=closer(hit,sdSphere(modelPos-wrist,.15),6.);
    hit=closer(hit,sdCapsule(modelPos,vec3<f32>(side*.47,.40,-.17),vec3<f32>(side*1.45,1.03,-.48),.105),1.);
    hit=closer(hit,sdCapsule(modelPos,vec3<f32>(side*1.40,1.0,-.48),vec3<f32>(side*1.92,.56,-.39),.12),6.);
    hit=closer(hit,sdSphere(modelPos-vec3<f32>(side*1.72,.10+swing,.49),.29),5.);
    hit=closer(hit,sdTorus(vec3<f32>(modelPos.x-side*1.72,modelPos.z-.72,modelPos.y-.10-swing),vec2<f32>(.22,.065)),6.);
    hit=closer(hit,sdSphere(modelPos-vec3<f32>(side*1.72,.10+swing,.77),.175),4.);
    hit=closer(hit,sdCapsule(modelPos,vec3<f32>(side*.28,-.62,-.02),vec3<f32>(side*.38,-1.27,.08),.19),1.);
    hit=closer(hit,sdCapsule(modelPos,vec3<f32>(side*.39,-1.16,.07),vec3<f32>(side*.56,-1.58,-.15),.125),6.);
  }
  // Rocket nozzle, exhaust center, central horn and front armour edges.
  hit=closer(hit,sdCapsule(modelPos,vec3<f32>(0.,-.63,-.18),vec3<f32>(0.,-1.13,-.31),.28),5.);
  hit=closer(hit,sdTorus(modelPos-vec3<f32>(0.,-1.21,-.34),vec2<f32>(.26,.08)),6.);
  hit=closer(hit,sdSphere(modelPos-vec3<f32>(0.,-1.26,-.34),.15),4.);
  hit=closer(hit,sdCapsule(modelPos,vec3<f32>(0.,1.34,-.02),vec3<f32>(0.,1.66,-.10),.073),6.);
  return hit;
}

fn sceneNormal(hitPos: vec3<f32>) -> vec3<f32> {
  let normalEps = 0.0018;
  let xAxis=vec3<f32>(normalEps,0.,0.);
  let yAxis=vec3<f32>(0.,normalEps,0.);
  let zAxis=vec3<f32>(0.,0.,normalEps);
  return normalize(vec3<f32>(modelMap(hitPos+xAxis).x-modelMap(hitPos-xAxis).x,
    modelMap(hitPos+yAxis).x-modelMap(hitPos-yAxis).x,
    modelMap(hitPos+zAxis).x-modelMap(hitPos-zAxis).x));
}
fn hash21(pixelPos:vec2<f32>)->f32{
  return fract(sin(dot(pixelPos,vec2<f32>(127.1,311.7)))*43758.5453);
}
fn background(rayDir:vec3<f32>)->vec3<f32>{
  let upper=clamp(rayDir.y*.5+.5,0.,1.);
  var spaceColor=mix(vec3<f32>(.015,.025,.067),vec3<f32>(.055,.085,.17),upper);
  let polar=atan2(rayDir.x,rayDir.z);
  let starmap=vec2<f32>(polar*180.,rayDir.y*115.);
  let gridPos=floor(starmap);
  let randValue=hash21(gridPos);
  let spot=length(fract(starmap)-vec2<f32>(.5));
  let star=(1.-smoothstep(.02,.095,spot))*select(0.,.75,randValue>.985);
  return spaceColor+vec3<f32>(star*.64,star*.82,star);
}
fn shade(hitPos:vec3<f32>,viewDir:vec3<f32>,materialId:f32,travel:f32)->vec3<f32>{
  let surfaceNormal=sceneNormal(hitPos);
  let lightDir=normalize(vec3<f32>(-.55,.75,1.));
  let diffuse=max(dot(surfaceNormal,lightDir),0.);
  let halfDir=normalize(lightDir-viewDir);
  let highlight=pow(max(dot(surfaceNormal,halfDir),0.),45.);
  let edgeLight=pow(1.-max(dot(surfaceNormal,-viewDir),0.),3.);
  var baseColor=vec3<f32>(.11,.26,.40);
  var metalness=.7;
  var lightEmission=vec3<f32>(0.);
  if(materialId<1.5){baseColor=vec3<f32>(.58,.76,.9);}
  else if(materialId<3.5){
    baseColor=vec3<f32>(.035,.30,.43);
    lightEmission=vec3<f32>(.035,.34,.48)+edgeLight*vec3<f32>(.08,.36,.55);
    metalness=.95;
  }
  else if(materialId<4.5){baseColor=vec3<f32>(.23,.88,1.);lightEmission=vec3<f32>(.12,1.05,1.9)*controls.controlC.y;}
  else if(materialId<5.5){baseColor=vec3<f32>(.045,.07,.12);metalness=.6;}
  else {baseColor=vec3<f32>(.95,.51,.22);metalness=.9;}
  let irradiance=.22+.77*diffuse+.13*max(dot(surfaceNormal,normalize(vec3<f32>(.8,.3,-.5))),0.);
  var finalColor=baseColor*irradiance;
  finalColor+=vec3<f32>(.9,.94,1.)*highlight*(.18+.8*metalness);
  finalColor+=edgeLight*vec3<f32>(.15,.28,.41);
  finalColor+=lightEmission;
  let distanceFog=1.-exp(-travel*.012);
  return mix(finalColor,background(viewDir),distanceFog*.5);
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexId:u32)->@builtin(position) vec4<f32>{
  var triangle= array<vec2<f32>,3>(vec2<f32>(-1.,-1.),vec2<f32>(3.,-1.),vec2<f32>(-1.,3.));
  return vec4<f32>(triangle[vertexId],0.,1.);
}
@fragment
fn fragmentMain(@builtin(position) fragPos:vec4<f32>)->@location(0) vec4<f32>{
  let canvasSize=controls.controlA.yz;
  let pixelUV=vec2<f32>((fragPos.x/canvasSize.x*2.-1.)*(canvasSize.x/canvasSize.y),1.-fragPos.y/canvasSize.y*2.);
  let camYaw=controls.controlB.x;
  let camPitch=controls.controlB.y;
  let cameraDist=controls.controlA.w;
  let cameraPos=vec3<f32>(sin(camYaw)*cos(camPitch),sin(camPitch),cos(camYaw)*cos(camPitch))*cameraDist;
  let cameraForward=normalize(-cameraPos);
  let cameraRight=normalize(cross(cameraForward,vec3<f32>(0.,1.,0.)));
  let cameraUp=cross(cameraRight,cameraForward);
  let rayDir=normalize(cameraForward*1.95+cameraRight*pixelUV.x+cameraUp*pixelUV.y);
  var distanceAlongRay=0.;
  var materialId=0.;
  var hitFlag=false;
  let iterationCap=i32(controls.controlC.x);
  for(var rayIndex:i32=0;rayIndex<116;rayIndex++){
    if(rayIndex>=iterationCap){break;}
    let tracePos=cameraPos+rayDir*distanceAlongRay;
    let surface=modelMap(tracePos);
    if(surface.x<.0014){hitFlag=true;materialId=surface.y;break;}
    distanceAlongRay+=max(surface.x*.83,.005);
    if(distanceAlongRay>20.){break;}
  }
  var outputColor=background(rayDir);
  if(hitFlag){outputColor=shade(cameraPos+rayDir*distanceAlongRay,rayDir,materialId,distanceAlongRay);}
  // Gentle halo near the centre, procedural vignette and cinematic tonemap.
  let vignette=1.-.34*smoothstep(.45,2.1,length(pixelUV));
  outputColor*=vignette;
  outputColor=outputColor/(outputColor+vec3<f32>(1.));
  outputColor=pow(outputColor,vec3<f32>(.86));
  return vec4<f32>(outputColor,1.);
}
