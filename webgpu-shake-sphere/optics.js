// WGSL optical helpers. This is concatenated with the production scene shader.
// All sphere distances used by the raymarcher are true signed distances.
export const optics = /* wgsl */ `
struct OpticalRay {
 origin:vec3f,
 direction:vec3f,
 valid:bool,
};
struct SphereContact {
 position:vec3f,
 normal:vec3f,
 beadIndex:u32,
 found:bool,
};
const GLASS_IOR:f32=1.48;
const MARBLE_IOR:f32=1.47;
const GLASS_WALL:f32=0.14;
fn raySphereNear(rayOrigin:vec3f,rayDirection:vec3f,center:vec3f,radius:f32)->f32{
 let relative=rayOrigin-center;
 let projection=dot(relative,rayDirection);
 let discriminant=projection*projection-dot(relative,relative)+radius*radius;
 if(discriminant<0.0){return -1.0;}
 return -projection-sqrt(discriminant);
}
fn raySphereFar(rayOrigin:vec3f,rayDirection:vec3f,center:vec3f,radius:f32)->f32{
 let relative=rayOrigin-center;
 let projection=dot(relative,rayDirection);
 let discriminant=projection*projection-dot(relative,relative)+radius*radius;
 if(discriminant<0.0){return -1.0;}
 return -projection+sqrt(discriminant);
}
fn shellEntry(worldXY:vec2f,shellFront:f32,refractionOn:bool)->OpticalRay{
 let firstPoint=vec3f(worldXY,shellFront);
 let incoming=vec3f(0.0,0.0,-1.0);
 let innerRadius=scene.view.x-GLASS_WALL;
 if(!refractionOn){
  return OpticalRay(firstPoint+incoming*0.008,incoming,length(worldXY)<innerRadius);
 }
 let incidentNormal=normalize(firstPoint);
 let wallDirection=refract(incoming,incidentNormal,1.0/GLASS_IOR);
 let wallOrigin=firstPoint+wallDirection*0.002;
 let distanceInner=raySphereNear(wallOrigin,wallDirection,vec3f(0.0),innerRadius);
 if(distanceInner<=0.0){
  return OpticalRay(firstPoint,incoming,false);
 }
 let innerPoint=wallOrigin+wallDirection*distanceInner;
 let interiorNormal=-normalize(innerPoint);
 let interiorDirection=refract(wallDirection,interiorNormal,GLASS_IOR);
 if(length(interiorDirection)<0.01){
  return OpticalRay(firstPoint,incoming,false);
 }
 return OpticalRay(innerPoint+interiorDirection*0.007,normalize(interiorDirection),true);
}
fn traceMarbles(rayStart:vec3f,rayDirection:vec3f)->SphereContact{
 var result=SphereContact(vec3f(0.0),vec3f(0.0,0.0,1.0),0u,false);
 let innerRadius=scene.view.x-GLASS_WALL;
 let rayLimit=raySphereFar(rayStart,rayDirection,vec3f(0.0),innerRadius);
 if(rayLimit<=0.0){return result;}
 var rayTravel=0.0;
 for(var marchIndex=0u;marchIndex<48u;marchIndex=marchIndex+1u){
  if(rayTravel>rayLimit){break;}
  let raySample=rayStart+rayDirection*rayTravel;
  var nearestDistance=1000.0;
  var nearestIndex=0u;
  for(var sphereIndex=0u;sphereIndex<50u;sphereIndex=sphereIndex+1u){
   if(f32(sphereIndex)>=scene.view.y){break;}
   let bead=scene.beads[sphereIndex];
   let signedDistance=length(raySample-bead.xyz)-bead.w;
   if(signedDistance<nearestDistance){
    nearestDistance=signedDistance;
    nearestIndex=sphereIndex;
   }
  }
  if(nearestDistance<0.005){
   let bead=scene.beads[nearestIndex];
   result=SphereContact(raySample,normalize(raySample-bead.xyz),nearestIndex,true);
   break;
  }
  rayTravel+=max(0.008,nearestDistance*0.85);
 }
 // Finite marching iteration counts can miss thin silhouettes and ray-entry
 // grazing cases. Exact sphere intersections provide a conservative fallback.
 // This also ensures every visible sphere remains hittable at mobile resolution.
 if(!result.found){
  var nearestRay=rayLimit;
  for(var exactIndex=0u;exactIndex<50u;exactIndex=exactIndex+1u){
   if(f32(exactIndex)>=scene.view.y){break;}
   let candidate=scene.beads[exactIndex];
   let crossing=raySphereNear(rayStart,rayDirection,candidate.xyz,candidate.w);
   if(crossing>0.0&&crossing<nearestRay){
    nearestRay=crossing;
    let crossingPos=rayStart+rayDirection*crossing;
    result=SphereContact(crossingPos,normalize(crossingPos-candidate.xyz),exactIndex,true);
   }
  }
 }
 return result;
}
fn beadTransmission(contact:SphereContact,incoming:vec3f,refractionOn:bool)->OpticalRay{
 let bead=scene.beads[contact.beadIndex];
 var insideDirection=incoming;
 if(refractionOn){
  let entered=refract(incoming,contact.normal,1.0/MARBLE_IOR);
  if(length(entered)>0.01){insideDirection=normalize(entered);}
 }
 let insideStart=contact.position+insideDirection*0.005;
 let distanceExit=raySphereFar(insideStart,insideDirection,bead.xyz,bead.w);
 if(distanceExit<=0.0){
  return OpticalRay(contact.position+incoming*0.02,incoming,false);
 }
 let outsidePoint=insideStart+insideDirection*distanceExit;
 var outsideDirection=insideDirection;
 if(refractionOn){
  let exitNormal=-normalize(outsidePoint-bead.xyz);
  let outgoing=refract(insideDirection,exitNormal,MARBLE_IOR);
  if(length(outgoing)>0.01){outsideDirection=normalize(outgoing);}
 }
 return OpticalRay(outsidePoint+outsideDirection*0.015,outsideDirection,true);
}
// Second bead is sampled along the *bent* ray so its image shifts inside the
// first bead. This limited additional hit avoids a second expensive SDF march.
fn findRearMarble(rayStart:vec3f,rayDirection:vec3f,excluded:u32)->SphereContact{
 var result=SphereContact(vec3f(0.0),vec3f(0.0,0.0,1.0),0u,false);
 let rayLimit=raySphereFar(rayStart,rayDirection,vec3f(0.0),scene.view.x-GLASS_WALL);
 var smallest=rayLimit;
 for(var idx=0u;idx<50u;idx=idx+1u){
  if(f32(idx)>=scene.view.y){break;}
  if(idx==excluded){continue;}
  let bead=scene.beads[idx];
  let hitDistance=raySphereNear(rayStart,rayDirection,bead.xyz,bead.w);
  if(hitDistance>0.003 && hitDistance<smallest){
   smallest=hitDistance;
   let point=rayStart+rayDirection*hitDistance;
   result=SphereContact(point,normalize(point-bead.xyz),idx,true);
  }
 }
 return result;
}
// After traversing the rear of the spherical vessel, sample a patterned
// background plane through both interfaces of the glass wall.
fn glassBackground(rayStart:vec3f,rayDirection:vec3f,refractionOn:bool)->vec3f{
 let innerRadius=scene.view.x-GLASS_WALL;
 let backDistance=raySphereFar(rayStart,rayDirection,vec3f(0.0),innerRadius);
 var outgoingOrigin=rayStart;
 var outgoingDirection=rayDirection;
 if(backDistance>0.0){
  outgoingOrigin=rayStart+rayDirection*backDistance;
  if(refractionOn){
   let innerNormal=-normalize(outgoingOrigin);
   let insideWall=refract(rayDirection,innerNormal,1.0/GLASS_IOR);
   if(length(insideWall)>0.01){
    let wallOrigin=outgoingOrigin+insideWall*0.004;
    let shellDistance=raySphereFar(wallOrigin,insideWall,vec3f(0.0),scene.view.x);
    if(shellDistance>0.0){
     let shellExit=wallOrigin+insideWall*shellDistance;
     let airDirection=refract(insideWall,-normalize(shellExit),GLASS_IOR);
     outgoingOrigin=shellExit;
     if(length(airDirection)>0.01){outgoingDirection=normalize(airDirection);}
    }
   }
  }
 }
 var backgroundXY=outgoingOrigin.xy+outgoingDirection.xy*4.5;
 if(outgoingDirection.z< -0.05){
  let planarDistance=(-7.0-outgoingOrigin.z)/outgoingDirection.z;
  backgroundXY=outgoingOrigin.xy+outgoingDirection.xy*max(planarDistance,0.0);
 }
 return baseColor(backgroundXY);
}
`;
