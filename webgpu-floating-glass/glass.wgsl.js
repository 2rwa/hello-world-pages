import {curvedOceanWGSL} from '../webgpu-curved-fft-ocean/ocean.wgsl.js';
import {opticsWGSL} from './optics.wgsl.js';
const glassOverlay = /* wgsl */ `
 let appearanceMode=i32(cfg.prior.w+0.5);
 if(appearanceMode!=4){
  var nearestDistance=100000000.0;
  var nearestIndex:i32=-1;
  let count=min(u32(max(0.0,ballOpts.x)),100u);
  for(var sphereIndex:u32=0u;sphereIndex<count;sphereIndex++){
   let orb=ballPos[sphereIndex];
   let sphereBounds=sphereIntersection(eye,ray,orb.xyz,orb.w);
   if(sphereBounds.x>0.0 && sphereBounds.x<nearestDistance){
    nearestDistance=sphereBounds.x;
    nearestIndex=i32(sphereIndex);
   }
  }
  if(nearestIndex>=0 && (!hit||nearestDistance<hitDist)){
   let orb=ballPos[u32(nearestIndex)];
   if(appearanceMode==1){
    let surfaceNormal=normalize((eye+ray*nearestDistance)-orb.xyz);
    return vec4f(surfaceNormal*0.5+0.5,1.0);
   }
   var glassColor=renderGlassSphere(eye,ray,nearestDistance,orb.xyz,orb.w,sphereCenter,radius);
   if(appearanceMode==2){
    let entryNormal=normalize((eye+ray*nearestDistance)-orb.xyz);
    let refracted=refract(ray,entryNormal,1.0/max(1.001,cfg.boat.y));
    return vec4f(refracted*0.5+0.5,1.0);
   }
   if(appearanceMode==3){
    let edgeNormal=normalize((eye+ray*nearestDistance)-orb.xyz);
    let rim=pow(1.0-clamp(dot(edgeNormal,-ray),0.0,1.0),2.0);
    glassColor+=vec3f(0.28,0.49,0.65)*rim;
   }
   return vec4f(toneMap(glassColor),1.0);
  }
 }
`;
const marker=' let background=skyColor(ray);\n if(!hit)';
if(!curvedOceanWGSL.includes(marker))throw Error('Base ocean shader marker missing');
export const glassWGSL=curvedOceanWGSL
 .replace('struct Vary {',opticsWGSL+'\nstruct Vary {')
 .replace(marker,' let background=skyColor(ray);\n'+glassOverlay+'\n if(!hit)');
