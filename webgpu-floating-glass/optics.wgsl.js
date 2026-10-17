export const opticsWGSL = /* wgsl */ `
@group(0) @binding(3) var<storage,read> ballPos:array<vec4f>;
@group(0) @binding(4) var<uniform> ballOpts:vec4f;
// ballOpts = [visible sphere count, internal interface bounce count, spread, drift speed].
fn sphereIntersection(rayOrigin:vec3f,rayDirection:vec3f,spherePos:vec3f,sphereSize:f32)->vec2f{
 let offset=rayOrigin-spherePos;
 let halfB=dot(offset,rayDirection);
 let delta=halfB*halfB-dot(offset,offset)+sphereSize*sphereSize;
 if(delta<0.0){return vec2f(-1.0,-1.0);}
 let root=sqrt(delta);
 return vec2f(-halfB-root,-halfB+root);
}
fn secondaryWaterDistance(rayOrigin:vec3f,rayDirection:vec3f,earthCenter:vec3f,earthRadius:f32)->f32{
 let relative=rayOrigin-earthCenter;
 let oceanOuterRadius=earthRadius+max(65.0,cfg.sim.y*25.0);
 let halfB=dot(relative,rayDirection);
 let delta=halfB*halfB-dot(relative,relative)+oceanOuterRadius*oceanOuterRadius;
 if(delta<0.0){return -1.0;}
 let root=sqrt(delta);
 let maxDistance=-halfB+root;
 var formerT=max(0.0,-halfB-root);
 if(maxDistance<=0.0){return -1.0;}
 var formerVal=implicitValue(rayOrigin+rayDirection*formerT,earthCenter,earthRadius);
 if(formerVal<=0.0){return formerT;}
 for(var iteration:i32=0;iteration<80;iteration++){
  if(formerT>=maxDistance){break;}
  let nextT=min(maxDistance,formerT+clamp(abs(formerVal)*0.72,0.52,80.0));
  let nextVal=implicitValue(rayOrigin+rayDirection*nextT,earthCenter,earthRadius);
  if(nextVal<=0.0){
   var lower=formerT;var upper=nextT;
   for(var bisect:i32=0;bisect<6;bisect++){
    let middle=(lower+upper)*0.5;
    if(implicitValue(rayOrigin+rayDirection*middle,earthCenter,earthRadius)>0.0){lower=middle;}else{upper=middle;}
   }
   return (lower+upper)*0.5;
  }
  formerT=nextT;formerVal=nextVal;
 }
 return -1.0;
}
fn backgroundAfterGlass(rayOrigin:vec3f,rayDirection:vec3f,earthCenter:vec3f,earthRadius:f32)->vec3f{
 var color=skyColor(rayDirection);
 let seaT=secondaryWaterDistance(rayOrigin,rayDirection,earthCenter,earthRadius);
 if(seaT>=0.0){
  let seaPos=rayOrigin+rayDirection*seaT;
  let seaNormal=waterNormal(seaPos,earthCenter);
  let toEye=-rayDirection;
  let oceanReflectance=0.02+0.98*pow(1.0-clamp(dot(toEye,seaNormal),0.0,1.0),5.0);
  color=mix(vec3f(0.006,0.08,0.15),skyColor(reflect(rayDirection,seaNormal)),clamp(oceanReflectance+0.12,0.0,1.0));
  let seaSlope=length(seaNormal-normalize(seaPos-earthCenter));
  color=mix(color,vec3f(0.65,0.85,0.88),smoothstep(0.45,1.15,seaSlope)*cfg.extra.y*0.20);
 }
 return color;
}
fn renderGlassSphere(rayOrigin:vec3f,rayDirection:vec3f,sphereEntry:f32,
 sphereCenter:vec3f,sphereRadius:f32,earthCenter:vec3f,earthRadius:f32)->vec3f{
 let entryPos=rayOrigin+rayDirection*sphereEntry;
 let entryNormal=normalize(entryPos-sphereCenter);
 let indexOfRefraction=max(1.001,cfg.boat.y);
 let baseReflectance=pow((indexOfRefraction-1.0)/(indexOfRefraction+1.0),2.0);
 let entryCosine=clamp(dot(-rayDirection,entryNormal),0.0,1.0);
 let entryReflectance=baseReflectance+(1.0-baseReflectance)*pow(1.0-entryCosine,5.0);
 let reflectionDir=reflect(rayDirection,entryNormal);
 var radiance=skyColor(reflectionDir)*entryReflectance;
 let firstTransmission=refract(rayDirection,entryNormal,1.0/indexOfRefraction);
 if(dot(firstTransmission,firstTransmission)>0.001){
  var interiorDir=normalize(firstTransmission);
  var interiorOrigin=entryPos+interiorDir*0.02;
  var remainingEnergy=1.0-entryReflectance;
  let maxBounces=clamp(i32(ballOpts.y+0.5),1,8);
  let rgbAbsorption=vec3f(0.008,0.023,0.038)*max(0.0,cfg.extra.z);
  var pathAbsorption=vec3f(1.0);
  for(var bounce:i32=0;bounce<8;bounce++){
   if(bounce>=maxBounces||remainingEnergy<0.002){break;}
   let crossings=sphereIntersection(interiorOrigin,interiorDir,sphereCenter,sphereRadius);
   if(crossings.y<=0.0){break;}
   let exitPos=interiorOrigin+interiorDir*crossings.y;
   pathAbsorption*=exp(-rgbAbsorption*crossings.y);
   let exitNormal=normalize(exitPos-sphereCenter);
   let cosExit=clamp(dot(interiorDir,exitNormal),0.0,1.0);
   let exitDirection=refract(interiorDir,-exitNormal,indexOfRefraction);
   var internalReflection=baseReflectance+(1.0-baseReflectance)*pow(1.0-cosExit,5.0);
   if(dot(exitDirection,exitDirection)<0.00001){internalReflection=1.0;}
   let escaped=remainingEnergy*(1.0-internalReflection);
   if(escaped>0.005 && dot(exitDirection,exitDirection)>0.00001){
    let transmittedDir=normalize(exitDirection);
    let nextPoint=exitPos+transmittedDir*0.12;
    let behind=backgroundAfterGlass(nextPoint,transmittedDir,earthCenter,earthRadius);
    radiance+=behind*pathAbsorption*escaped;
   }
   remainingEnergy*=internalReflection;
   interiorDir=normalize(reflect(interiorDir,-exitNormal));
   interiorOrigin=exitPos+interiorDir*0.02;
  }
 }
 let toEye=-rayDirection;
 let glint=normalize(toEye+sunDirection());
 let sunlight=pow(max(dot(entryNormal,glint),0.0),180.0);
 let sheen=pow(max(dot(entryNormal,glint),0.0),44.0);
 // Optical highlights come from sun reflection and Fresnel interfaces only.
 // Deliberately no extra outline glow or painted-on waterline.
 radiance+=vec3f(1.0,0.93,0.77)*(sunlight*2.6+sheen*0.12);
 return radiance;
}
`;
