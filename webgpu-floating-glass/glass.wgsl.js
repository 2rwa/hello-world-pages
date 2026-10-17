import {curvedOceanWGSL} from '../webgpu-curved-fft-ocean/ocean.wgsl.js';

// Share the exact five-cascade FFT ocean shader. Only add a true refractive
// sphere hit and a second water intersection for rays transmitted through it.
const glassHelpers = /* wgsl */ `
fn sphereIntersections(rayOrigin:vec3f, rayDirection:vec3f, orbCenter:vec3f, orbRadius:f32)->vec2f{
 let offset=rayOrigin-orbCenter;
 let halfB=dot(offset,rayDirection);
 let determinant=halfB*halfB-(dot(offset,offset)-orbRadius*orbRadius);
 if(determinant<0.0){return vec2f(-1.0,-1.0);}
 let root=sqrt(determinant);
 return vec2f(-halfB-root,-halfB+root);
}
fn traceBackgroundWater(rayOrigin:vec3f, rayDirection:vec3f, earthCenter:vec3f, earthRadius:f32)->f32{
 let offset=rayOrigin-earthCenter;
 let outerRadius=earthRadius+max(65.0,cfg.sim.y*25.0);
 let halfB=dot(offset,rayDirection);
 let determinant=halfB*halfB-dot(offset,offset)+outerRadius*outerRadius;
 if(determinant<0.0){return -1.0;}
 let root=sqrt(determinant);
 let farT=-halfB+root;
 var previousT=max(0.0,-halfB-root);
 if(farT<=0.0){return -1.0;}
 var previousValue=implicitValue(rayOrigin+rayDirection*previousT,earthCenter,earthRadius);
 if(previousValue<=0.0){return previousT;}
 for(var marchIndex:i32=0;marchIndex<96;marchIndex++){
  if(previousT>=farT){break;}
  let currentT=min(farT,previousT+clamp(abs(previousValue)*0.72,0.52,80.0));
  let currentValue=implicitValue(rayOrigin+rayDirection*currentT,earthCenter,earthRadius);
  if(currentValue<=0.0){
   var lowT=previousT;
   var highT=currentT;
   for(var refineIndex:i32=0;refineIndex<6;refineIndex++){
    let middle=(lowT+highT)*0.5;
    if(implicitValue(rayOrigin+rayDirection*middle,earthCenter,earthRadius)>0.0){lowT=middle;}else{highT=middle;}
   }
   return (lowT+highT)*0.5;
  }
  previousT=currentT;
  previousValue=currentValue;
 }
 return -1.0;
}
fn secondaryWaterColor(position:vec3f,rayDirection:vec3f,earthCenter:vec3f)->vec3f{
 let normal=waterNormal(position,earthCenter);
 let fresnel=0.02+0.98*pow(1.0-clamp(dot(normal,-rayDirection),0.0,1.0),5.0);
 let reflectDir=reflect(rayDirection,normal);
 var color=mix(vec3f(0.006,0.082,0.155),skyColor(reflectDir),clamp(fresnel+0.10,0.0,1.0));
 let steep=length(normal-normalize(position-earthCenter));
 color=mix(color,vec3f(0.68,0.86,0.90),smoothstep(0.50,1.20,steep)*0.35*cfg.extra.y);
 return color;
}
`;

const glassFragment = /* wgsl */ `
 // Anchor drifts slowly across the FFT world: no CPU sine-wave substitution for
 // vertical buoyancy. Every pixel obtains the same deterministic GPU FFT height.
 let driftPoint=vec2f(sin(cfg.sim.x*0.12)*5.5,cos(cfg.sim.x*0.082)*3.4);
 let waveLevel=waveHeight(driftPoint);
 let meanLevel=sqrt(max(1.0,radius*radius-dot(driftPoint,driftPoint)))-radius;
 let orbRadius=cfg.boat.x;
 let orbCenter=vec3f(driftPoint.x,meanLevel+waveLevel+orbRadius*cfg.boat.z,driftPoint.y);
 let orbT=sphereIntersections(eye,ray,orbCenter,orbRadius);
 let appearanceMode=i32(cfg.prior.w+0.5);
 if(appearanceMode!=4 && orbT.x>0.0 && (!hit || orbT.x<hitDist)){
  let entryPoint=eye+ray*orbT.x;
  let entryNormal=normalize(entryPoint-orbCenter);
  let refractiveIndex=cfg.boat.y;
  let insideDir=refract(ray,entryNormal,1.0/refractiveIndex);
  let entryFresnel=pow((refractiveIndex-1.0)/(refractiveIndex+1.0),2.0);
  let viewIncidence=clamp(dot(-ray,entryNormal),0.0,1.0);
  let reflectionWeight=entryFresnel+(1.0-entryFresnel)*pow(1.0-viewIncidence,5.0);
  var throughDir=ray;
  var throughPoint=entryPoint+ray*(orbT.y-orbT.x+0.08);
  var travelLength=orbT.y-orbT.x;
  if(dot(insideDir,insideDir)>0.01){
   let interiorOrigin=entryPoint+insideDir*0.025;
   let farExit=sphereIntersections(interiorOrigin,insideDir,orbCenter,orbRadius);
   if(farExit.y>0.0){
    let exitPoint=interiorOrigin+insideDir*farExit.y;
    let outwardNormal=normalize(exitPoint-orbCenter);
    let exitRefraction=refract(insideDir,-outwardNormal,refractiveIndex);
    throughDir=normalize(select(reflect(insideDir,-outwardNormal),exitRefraction,dot(exitRefraction,exitRefraction)>0.01));
    throughPoint=exitPoint+throughDir*0.15;
    travelLength=length(exitPoint-entryPoint);
   }
  }
  // Refracted ray samples the real FFT surface again behind the glass.
  let behindDistance=traceBackgroundWater(throughPoint,throughDir,sphereCenter,radius);
  var throughColor=skyColor(throughDir);
  if(behindDistance>=0.0){
   let beneath=throughPoint+throughDir*max(0.0,behindDistance);
   throughColor=secondaryWaterColor(beneath,throughDir,sphereCenter);
  }
  let glassTint=cfg.extra.z;
  let absorption=vec3f(0.008,0.023,0.037)*glassTint;
  let transmission=exp(-travelLength*absorption);
  throughColor*=transmission;
  let rim=pow(1.0-viewIncidence,2.5);
  let glintDir=normalize(sunDirection()-ray);
  let sparkle=pow(max(dot(entryNormal,glintDir),0.0),220.0);
  let sheen=pow(max(dot(entryNormal,glintDir),0.0),38.0);
  let reflected=skyColor(reflect(ray,entryNormal));
  var glassColor=mix(throughColor,reflected,reflectionWeight);
  glassColor+=vec3f(0.035,0.09,0.13)*rim*glassTint;
  glassColor+=vec3f(1.0,0.92,0.77)*(sparkle*3.7+sheen*0.12);
  // Slight inner meniscus-like cue indicates the waterline where immersed.
  let relativeHeight=(entryPoint.y-meanLevel-waveLevel)/max(0.01,orbRadius);
  let waterline=exp(-pow(relativeHeight*19.0,2.0));
  glassColor+=vec3f(0.06,0.16,0.22)*waterline*0.38;
  if(appearanceMode==1){return vec4f(entryNormal*0.5+0.5,1.0);}
  if(appearanceMode==2){return vec4f(throughDir*0.5+0.5,1.0);}
  if(appearanceMode==3){
   glassColor=mix(glassColor,vec3f(0.87,0.98,1.0),clamp(rim*0.65,0.0,1.0));
  }
  return vec4f(toneMap(glassColor),1.0);
 }
`;
export const glassWGSL=curvedOceanWGSL
 .replace('@fragment fn mainFragment',glassHelpers+'\n@fragment fn mainFragment')
 .replace(' let background=skyColor(ray);\n if(!hit)', ' let background=skyColor(ray);\n'+glassFragment+'\n if(!hit)');
if(!glassWGSL.includes('let driftPoint=')||glassWGSL.includes('let background=skyColor(ray);\n if(!hit)'))
 throw Error('Curved ocean shader injection failed');
