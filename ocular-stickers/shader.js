// Derived from ocular-globe/main.js; transparent background and eyelid/pupil controls.
export const shader=`
struct EyeData { centerRadius:vec4<f32>, gazeHue:vec4<f32>, tearShape:vec4<f32> }
struct SceneData { screenTime:vec4<f32>, cameraPos:vec4<f32>, cameraForward:vec4<f32>, cameraUp:vec4<f32>, shellParams:vec4<f32>, impactData:vec4<f32>, tearParams:vec4<f32>, eyes:array<EyeData,24> }
@group(0) @binding(0) var<uniform> sceneData:SceneData;
@vertex fn vsMain(@builtin(vertex_index) vertexIndex:u32)->@builtin(position) vec4<f32>{
 let vertices=array<vec2<f32>,3>(vec2<f32>(-1.,-1.),vec2<f32>(3.,-1.),vec2<f32>(-1.,3.));
 return vec4<f32>(vertices[vertexIndex],0.,1.);
}
fn sphereInterval(rayOrigin:vec3<f32>,rayDir:vec3<f32>,centerPos:vec3<f32>,sphereRadius:f32)->vec2<f32>{
 let offsetPos=rayOrigin-centerPos;let rayB=dot(offsetPos,rayDir);
 let disc=rayB*rayB-dot(offsetPos,offsetPos)+sphereRadius*sphereRadius;
 if(disc<0.){return vec2<f32>(1.e5,-1.);}
 let rootDisc=sqrt(disc);return vec2<f32>(-rayB-rootDisc,-rayB+rootDisc);
}
struct SurfaceHit { travel:f32, eyeIndex:i32 }
fn eyeSdf(samplePos:vec3<f32>)->SurfaceHit{
 var nearestDist=1.e5;var nearestIndex=-1;
 for(var eyeIndex=0u;eyeIndex<24u;eyeIndex+=1u){
  if(eyeIndex>=u32(sceneData.screenTime.w)){break;}
  let eyeData=sceneData.eyes[eyeIndex].centerRadius;
  let eyeDist=length(samplePos-eyeData.xyz)-eyeData.w;
  if(eyeDist<nearestDist){nearestDist=eyeDist;nearestIndex=i32(eyeIndex);}
 }
 return SurfaceHit(nearestDist,nearestIndex);
}
fn marchEyes(rayOrigin:vec3<f32>,rayDir:vec3<f32>,endT:f32)->SurfaceHit{
 // Exact union of sphere SDFs; a conservative analytic bound skips empty space.
 var startT=endT;var lastT=0.;
 for(var eyeIndex=0u;eyeIndex<24u;eyeIndex+=1u){
  if(eyeIndex>=u32(sceneData.screenTime.w)){break;}
  let eyeData=sceneData.eyes[eyeIndex].centerRadius;
  let interval=sphereInterval(rayOrigin,rayDir,eyeData.xyz,eyeData.w+.012);
  if(interval.y>0. && interval.x<endT){startT=min(startT,max(0.,interval.x));lastT=max(lastT,min(endT,interval.y));}
 }
 var rayT=startT;
 for(var stepIndex=0u;stepIndex<48u;stepIndex+=1u){
  if(rayT>lastT || rayT>=endT){break;}
  let hitData=eyeSdf(rayOrigin+rayDir*rayT);
  if(hitData.travel<.0015){return SurfaceHit(rayT,hitData.eyeIndex);}
  rayT+=max(.001,hitData.travel*.92);
 }
 return SurfaceHit(endT,-1);
}
fn palette(hueValue:f32)->vec3<f32>{return vec3<f32>(.52)+.43*cos(6.283185*(hueValue+vec3<f32>(0.,.67,.33)));}
fn environment(rayDir:vec3<f32>)->vec3<f32>{
 let sky=vec3<f32>(.022,.056,.091)+vec3<f32>(.022,.061,.085)*max(rayDir.y,0.);
 let lightA=pow(max(dot(rayDir,normalize(vec3<f32>(-.55,.75,.45))),0.),38.);
 let lightB=pow(max(dot(rayDir,normalize(vec3<f32>(.7,.2,.55))),0.),85.);
 let bands=pow(max(0.,1.-abs(rayDir.y+.18)*5.),4.);
 return sky+vec3<f32>(.32,.69,.9)*lightA+vec3<f32>(.65,.45,.8)*lightB+vec3<f32>(.016,.065,.075)*bands;
}
fn shadeEye(hitPos:vec3<f32>,rayDir:vec3<f32>,eyeIndex:u32)->vec3<f32>{
 let eyeData=sceneData.eyes[eyeIndex];let surfaceNormal=normalize(hitPos-eyeData.centerRadius.xyz);
 let gazeDir=normalize(eyeData.gazeHue.xyz);
 let axisBase=select(vec3<f32>(0.,1.,0.),vec3<f32>(1.,0.,0.),abs(gazeDir.y)>.95);
 let irisRight=normalize(cross(axisBase,gazeDir));let irisUp=cross(gazeDir,irisRight);
 let irisUv=vec2<f32>(dot(surfaceNormal,irisRight),dot(surfaceNormal,irisUp));
 let irisRadius=length(irisUv);let irisAngle=atan2(irisUv.y,irisUv.x);
 let frontFace=dot(surfaceNormal,gazeDir);
 let timeValue=sceneData.screenTime.z;
 var baseColor=vec3<f32>(.87,.92,.90);
 let veins=pow(abs(sin(irisAngle*13.+sin(irisRadius*22.+eyeData.gazeHue.w*5.)*1.2+sin(irisAngle*3.)*.8)),23.);
 let branches=pow(abs(sin(irisAngle*29.-irisRadius*15.+sin(irisAngle*8.)*1.2)),30.);
 let veinAmount=(veins*.75+branches*.25)*smoothstep(.64,.98,irisRadius);
 baseColor-=vec3<f32>(.035,.22,.19)*veinAmount;
 if(frontFace>0. && irisRadius<.64){
  let irisHue=eyeData.gazeHue.w;let fibers=.62+.24*sin(irisAngle*49.+sin(irisRadius*27.)*3.1)+.12*sin(irisAngle*91.-irisRadius*19.)+.07*sin(irisAngle*147.+irisRadius*33.);
  let irisTint=palette(irisHue)*.72+vec3<f32>(.025,.075,.08);
  let pupilRadius=sceneData.tearParams.z;
  baseColor=irisTint*fibers*(.73+.27*smoothstep(.22,.48,irisRadius));
  baseColor=mix(baseColor,vec3<f32>(.015,.028,.036),smoothstep(.54,.64,irisRadius));
  baseColor=mix(vec3<f32>(.005,.009,.015),baseColor,smoothstep(pupilRadius-.008,pupilRadius+.008,irisRadius));
 }
 let lidLevel=sceneData.tearParams.w; let lidEdge=dot(surfaceNormal,irisUp)+.12*irisUv.x*irisUv.x; if(frontFace>0. && lidEdge>lidLevel){baseColor=mix(vec3<f32>(.38,.43,.48),vec3<f32>(.78,.75,.72),smoothstep(lidLevel,lidLevel+.12,lidEdge));} let lightDir=normalize(vec3<f32>(-.55,.86,.7));let fillDir=normalize(vec3<f32>(.8,.1,-.35));
 let diffuse=max(dot(surfaceNormal,lightDir),0.);let fill=max(dot(surfaceNormal,fillDir),0.);
 let rim=pow(1.-max(dot(surfaceNormal,-rayDir),0.),3.);
 let gloss=pow(max(dot(surfaceNormal,normalize(lightDir-rayDir)),0.),95.);
 let gloss2=pow(max(dot(surfaceNormal,normalize(vec3<f32>(.8,.25,.7)-rayDir)),0.),180.);
 let refl=environment(reflect(rayDir,surfaceNormal));
 return baseColor*(.29+.73*diffuse+.21*fill)+vec3<f32>(.8,.93,1.)*gloss*1.55+vec3<f32>(.55,.77,.9)*gloss2*.8+refl*(.15+.6*rim);
}

fn smoothUnion(distA:f32,distB:f32,blendWidth:f32)->f32{
 let blendValue=clamp(.5+.5*(distB-distA)/blendWidth,0.,1.);
 return mix(distB,distA,blendValue)-blendWidth*blendValue*(1.-blendValue);
}
// Smooth minimum of sphere SDFs is a conservative 1-Lipschitz field.
// No density-function values are treated as distances.
fn liquidSdf(samplePos:vec3<f32>)->f32{
 var fieldDist=1.e5;
 for(var eyeIndex=0u;eyeIndex<24u;eyeIndex+=1u){
  if(eyeIndex>=u32(sceneData.screenTime.w)){break;}
  let eyeData=sceneData.eyes[eyeIndex];
  let mainDist=length(samplePos-eyeData.centerRadius.xyz)-eyeData.centerRadius.w*sceneData.tearParams.x;
  let lobeDist=length(samplePos-eyeData.centerRadius.xyz-eyeData.tearShape.xyz)-eyeData.tearShape.w;
  let localDist=smoothUnion(mainDist,lobeDist,.16);
  fieldDist=smoothUnion(fieldDist,localDist,sceneData.tearParams.y);
 }
 // The liquid may flatten at the inner wall, but never render outside it.
 return max(fieldDist,length(samplePos)-sceneData.shellParams.x+.006);
}
fn liquidNormal(samplePos:vec3<f32>)->vec3<f32>{
 let epsilon=.003;
 let axisX=vec3<f32>(epsilon,0.,0.);let axisY=vec3<f32>(0.,epsilon,0.);let axisZ=vec3<f32>(0.,0.,epsilon);
 let gradient=vec3<f32>(liquidSdf(samplePos+axisX)-liquidSdf(samplePos-axisX),liquidSdf(samplePos+axisY)-liquidSdf(samplePos-axisY),liquidSdf(samplePos+axisZ)-liquidSdf(samplePos-axisZ));
 return gradient/max(length(gradient),.00001);
}
fn marchLiquid(rayOrigin:vec3<f32>,rayDir:vec3<f32>,endT:f32,insideFlag:bool)->f32{
 var rayT=0.;
 var lastT=0.;
 for(var stepIndex=0u;stepIndex<100u;stepIndex+=1u){
  if(rayT>=endT){break;}
  let signedDist=liquidSdf(rayOrigin+rayDir*rayT);
  let distanceValue=select(signedDist,-signedDist,insideFlag);
  if(distanceValue<.0018){
   if(distanceValue<0. && rayT>lastT){
    var lowT=lastT;var highT=rayT;
    for(var refineIndex=0u;refineIndex<5u;refineIndex+=1u){
     let midT=(lowT+highT)*.5;
     let midDist=liquidSdf(rayOrigin+rayDir*midT);
     if(select(midDist,-midDist,insideFlag)>0.){lowT=midT;}else{highT=midT;}
    }
    return (lowT+highT)*.5;
   }
   return rayT;
  }
  lastT=rayT;rayT+=max(.001,distanceValue*.85);
 }
 return endT;
}
fn liquidLighting(surfaceNormal:vec3<f32>,rayDir:vec3<f32>)->vec3<f32>{
 let lightA=normalize(vec3<f32>(-.55,.82,.56));let lightB=normalize(vec3<f32>(.8,.15,.55));
 let specA=pow(max(dot(surfaceNormal,normalize(lightA-rayDir)),0.),95.);
 let specB=pow(max(dot(surfaceNormal,normalize(lightB-rayDir)),0.),38.);
 let rim=pow(1.-max(dot(surfaceNormal,-rayDir),0.),3.);
 return vec3<f32>(.95,.98,1.)*specA*1.8+vec3<f32>(.24,.66,.9)*specB*.65+vec3<f32>(.12,.36,.48)*rim*.48;
}

@fragment fn fsMain(@builtin(position) pixelPos:vec4<f32>)->@location(0) vec4<f32>{
 let screenSize=sceneData.screenTime.xy;
 let uvPos=vec2<f32>((2.*pixelPos.x-screenSize.x)/screenSize.y,(screenSize.y-2.*pixelPos.y)/screenSize.y);
 let rayOrigin=sceneData.cameraPos.xyz;let forwardDir=sceneData.cameraForward.xyz;let upDir=sceneData.cameraUp.xyz;let rightDir=normalize(cross(forwardDir,upDir));
 let rayDir=normalize(forwardDir*1.72+rightDir*uvPos.x+upDir*uvPos.y);
 let shellRadius=sceneData.shellParams.x;let iorValue=sceneData.shellParams.y;let tearFlag=sceneData.shellParams.z;
 var finalColor=vec3<f32>(0.); var opacityValue=0.;
 let shellHit=sphereInterval(rayOrigin,rayDir,vec3<f32>(0.),shellRadius);
 if(shellHit.x>0. && shellHit.y>shellHit.x){
  let shellPos=rayOrigin+rayDir*shellHit.x;let shellNormal=normalize(shellPos);
  let insideOrigin=shellPos+rayDir*.002;let endT=shellHit.y-shellHit.x-.002;
  // Empty space inside the outer shell: only the tears refract rays.
  var insideColor=environment(rayDir)*.85;
  var tearT=endT;
  if(tearFlag>.5){tearT=marchLiquid(insideOrigin,rayDir,endT,false);}
  if(tearT<endT){ opacityValue=1.;
   let liquidPos=insideOrigin+rayDir*tearT;let surfaceNormal=liquidNormal(liquidPos);
   let facing=max(dot(-rayDir,surfaceNormal),0.);
   let refractedDir=normalize(refract(rayDir,surfaceNormal,1./iorValue));
   let liquidOrigin=liquidPos-surfaceNormal*.006+refractedDir*.004;
   let liquidLimit=sphereInterval(liquidOrigin,refractedDir,vec3<f32>(0.),shellRadius).y;
   let exitT=marchLiquid(liquidOrigin,refractedDir,max(.005,liquidLimit),true);
   let hitEye=marchEyes(liquidOrigin,refractedDir,max(.005,exitT));
   var pathLength=exitT;
   if(hitEye.eyeIndex>=0){
    insideColor=shadeEye(liquidOrigin+refractedDir*hitEye.travel,refractedDir,u32(hitEye.eyeIndex));
    pathLength=hitEye.travel;
   }else{
    let exitPos=liquidOrigin+refractedDir*exitT;
    let exitNormal=liquidNormal(exitPos);
    let outDir=refract(refractedDir,-exitNormal,iorValue);
    let reflectedDir=reflect(refractedDir,exitNormal);
    if(length(outDir)>.0001){
     let nextDir=normalize(outDir);let nextOrigin=exitPos+exitNormal*.005+nextDir*.005;
     let nextLimit=max(0.,sphereInterval(nextOrigin,nextDir,vec3<f32>(0.),shellRadius).y);
     let behindEye=marchEyes(nextOrigin,nextDir,nextLimit);
     insideColor=environment(nextDir);
     if(behindEye.eyeIndex>=0){insideColor=shadeEye(nextOrigin+nextDir*behindEye.travel,nextDir,u32(behindEye.eyeIndex));}
    }else{
     let reflectedOrigin=exitPos-exitNormal*.008+reflectedDir*.005;
     let reflectionEye=marchEyes(reflectedOrigin,reflectedDir,max(.005,sphereInterval(reflectedOrigin,reflectedDir,vec3<f32>(0.),shellRadius).y));
     insideColor=environment(reflectedDir);
     if(reflectionEye.eyeIndex>=0){insideColor=shadeEye(reflectedOrigin+reflectedDir*reflectionEye.travel,reflectedDir,u32(reflectionEye.eyeIndex));}
    }
   }
   let transmission=exp(-max(pathLength,0.)*vec3<f32>(.13,.041,.018));
   let f0=(iorValue-1.)/(iorValue+1.);
   let fresnel=f0*f0+(1.-f0*f0)*pow(1.-facing,5.);
   insideColor=insideColor*transmission+vec3<f32>(.025,.15,.19)*(vec3<f32>(1.)-transmission);
   insideColor=mix(insideColor,environment(reflect(rayDir,surfaceNormal)),fresnel)+liquidLighting(surfaceNormal,rayDir);
  }else{
   let hitEye=marchEyes(insideOrigin,rayDir,endT);
   if(hitEye.eyeIndex>=0){opacityValue=1.; insideColor=shadeEye(insideOrigin+rayDir*hitEye.travel,rayDir,u32(hitEye.eyeIndex));}
  }
  finalColor=insideColor;
  if(sceneData.shellParams.w>.5){
   let facing=max(dot(-rayDir,shellNormal),0.);
   let rim=pow(1.-facing,4.);
   let shellSpec=pow(max(dot(shellNormal,normalize(vec3<f32>(-.65,.75,.35))),0.),42.);
   let rippleAge=sceneData.impactData.w;
   let rippleDistance=acos(clamp(dot(shellNormal,sceneData.impactData.xyz),-1.,1.));
   let rippleOffset=(rippleDistance-rippleAge*2.5)*19.;
   let ripple=exp(-rippleOffset*rippleOffset-rippleAge*3.);
   finalColor+=vec3<f32>(.09,.32,.43)*rim*.7+vec3<f32>(.22,.38,.48)*shellSpec*.24+vec3<f32>(.12,.52,.65)*ripple*.38;
  }
 }
 finalColor=pow(max(finalColor,vec3<f32>(0.)),vec3<f32>(.83));
 return vec4<f32>(clamp(finalColor,vec3<f32>(0.),vec3<f32>(1.)),opacityValue);
}

`;
