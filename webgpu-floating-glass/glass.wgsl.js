import {curvedOceanWGSL} from '../webgpu-curved-fft-ocean/ocean.wgsl.js';
import {opticsWGSL} from './optics.wgsl.js';

// Applied only to the floating-glass demo; the standalone curved ocean is unchanged.
// Geometry-aware local capillary approximation (exaggerated to metre scale).
// The capillary uplift changes both the ray intersection and geometric water normal.
const meniscusWGSL = /* wgsl */ `
@group(0) @binding(5) var<uniform> meniscusOptions:vec4f;
fn meniscusHeight(xz:vec2f,orb:vec4f)->f32{
 if(meniscusOptions.x<0.5||orb.w<=0.0){return 0.0;}
 let ballRadius=orb.w;
 let centerXZ=orb.xz;
 let curvatureRadius=cfg.boat.w;
 let curvedSurfaceY=sqrt(max(1.0,curvatureRadius*curvatureRadius-dot(centerXZ,centerXZ)))-curvatureRadius;
 let localBaseSeaY=curvedSurfaceY+waveHeight(centerXZ);
 let centerOffset=orb.y-localBaseSeaY;
 if(abs(centerOffset)>=ballRadius*0.98){return 0.0;}
 let contactRadius=sqrt(max(0.0,ballRadius*ballRadius-centerOffset*centerOffset));
 let signedRingDist=length(xz-centerXZ)-contactRadius;
 let transitionWidth=max(0.20,ballRadius*0.30);
 let rise=ballRadius*0.24*sqrt(max(0.0,1.0-centerOffset*centerOffset/(ballRadius*ballRadius)));
 let innerBlend=smoothstep(-transitionWidth*0.42,-transitionWidth*0.08,signedRingDist);
 let outerFalloff=exp(-max(0.0,signedRingDist)/transitionWidth);
 return rise*innerBlend*outerFalloff;
}
fn meniscusSurfaceHeight(xz:vec2f,orb:vec4f)->f32{
 return waveHeight(xz)+meniscusHeight(xz,orb);
}
fn meniscusImplicitValue(p:vec3f,earthCenter:vec3f,earthRadius:f32,orb:vec4f)->f32{
 return length(p-earthCenter)-earthRadius-meniscusSurfaceHeight(p.xz,orb);
}
fn meniscusWaterNormal(p:vec3f,earthCenter:vec3f,orb:vec4f)->vec3f{
 // Preserve *exactly* the original FFT water normal outside the actual meniscus.
 // Otherwise changing sampling spacing all over the ocean causes a fake halo.
 if(meniscusOptions.x<0.5||orb.w<=0.0||meniscusHeight(p.xz,orb)<0.005){
  return waterNormal(p,earthCenter);
 }
 let spacing=clamp(orb.w*0.085,0.08,0.35);
 let dx=(meniscusSurfaceHeight(p.xz+vec2f(spacing,0.0),orb)
        -meniscusSurfaceHeight(p.xz-vec2f(spacing,0.0),orb))/(2.0*spacing);
 let dz=(meniscusSurfaceHeight(p.xz+vec2f(0.0,spacing),orb)
        -meniscusSurfaceHeight(p.xz-vec2f(0.0,spacing),orb))/(2.0*spacing);
 return normalize(normalize(p-earthCenter)-vec3f(dx,0.0,dz));
}
`;

const prepass = /* wgsl */ `
 // Determine both visible glass and a nearby meniscus source once per pixel;
 // never scan 100 spheres for each of the 88 ocean tracing samples.
 var nearestGlassDistance=100000000.0;
 var nearestGlassIndex:i32=-1;
 var nearestContactDistance=100000000.0;
 var contactOrb=vec4f(0.0,0.0,0.0,-1.0);
 let sphereCount=min(u32(max(0.0,ballOpts.x)),100u);
 let comparisonMode=i32(cfg.prior.w+0.5);
 if(comparisonMode!=4){
  for(var sphereIndex:u32=0u;sphereIndex<sphereCount;sphereIndex++){
   let candidate=ballPos[sphereIndex];
   let glassBounds=sphereIntersection(eye,ray,candidate.xyz,candidate.w);
   if(glassBounds.x>0.0&&glassBounds.x<nearestGlassDistance){
    nearestGlassDistance=glassBounds.x;
    nearestGlassIndex=i32(sphereIndex);
   }
   if(meniscusOptions.x>0.5){
    let enlargedBounds=sphereIntersection(eye,ray,candidate.xyz,candidate.w*1.82);
    if(enlargedBounds.y>0.0&&enlargedBounds.x<nearestContactDistance){
     nearestContactDistance=enlargedBounds.x;
     contactOrb=candidate;
    }
   }
  }
 }
`;

const glassOverlay = /* wgsl */ `
 let appearanceMode=i32(cfg.prior.w+0.5);
 if(appearanceMode!=4&&nearestGlassIndex>=0&&(!hit||nearestGlassDistance<hitDist)){
  let orb=ballPos[u32(nearestGlassIndex)];
  if(appearanceMode==1){
   let surfaceNormal=normalize((eye+ray*nearestGlassDistance)-orb.xyz);
   return vec4f(surfaceNormal*0.5+0.5,1.0);
  }
  let glassColor=renderGlassSphere(eye,ray,nearestGlassDistance,orb.xyz,orb.w,sphereCenter,radius);
  if(appearanceMode==2){
   let entryNormal=normalize((eye+ray*nearestGlassDistance)-orb.xyz);
   let refracted=refract(ray,entryNormal,1.0/max(1.001,cfg.boat.y));
   return vec4f(refracted*0.5+0.5,1.0);
  }
  // No additive outline glow: only Fresnel reflection and physical specular remain.
  return vec4f(toneMap(glassColor),1.0);
 }
`;

const marker=' let background=skyColor(ray);\n if(!hit)';
const fragmentPrefix='@fragment fn mainFragment';
if(!curvedOceanWGSL.includes(marker)||!curvedOceanWGSL.includes(fragmentPrefix))
 throw Error('Curved ocean shader marker missing');
const [header,fragment]=curvedOceanWGSL.split(fragmentPrefix);
if(!fragment.includes(' let radius=cfg.boat.w;')||
   !fragment.includes('implicitValue(eye+ray*oldT,sphereCenter,radius)'))
 throw Error('Curved ocean fragment structure changed');
const withMeniscus=fragment
 .replace(' let radius=cfg.boat.w;',prepass+'\n let radius=cfg.boat.w;')
 .replaceAll('implicitValue(eye+ray*oldT,sphereCenter,radius)',
             'meniscusImplicitValue(eye+ray*oldT,sphereCenter,radius,contactOrb)')
 .replaceAll('implicitValue(eye+ray*nextT,sphereCenter,radius)',
             'meniscusImplicitValue(eye+ray*nextT,sphereCenter,radius,contactOrb)')
 .replaceAll('implicitValue(eye+ray*middle,sphereCenter,radius)',
             'meniscusImplicitValue(eye+ray*middle,sphereCenter,radius,contactOrb)')
 .replace('let stride=clamp(abs(oldValue)*0.72,0.65,92.0);',
          'let stride=select(clamp(abs(oldValue)*0.72,0.65,92.0),clamp(abs(oldValue)*0.55,0.15,8.0),contactOrb.w>0.0);')
 .replace('let normal=waterNormal(p,sphereCenter);',
          'let normal=meniscusWaterNormal(p,sphereCenter,contactOrb);')
 .replace(marker,' let background=skyColor(ray);\n'+glassOverlay+'\n if(!hit)');
if(withMeniscus.includes('let background=skyColor(ray);\n if(!hit)')||
   !withMeniscus.includes('meniscusWaterNormal(p,sphereCenter,contactOrb)'))
 throw Error('Failed to inject glass or meniscus geometry');
export const glassWGSL=(header+fragmentPrefix+withMeniscus)
 .replace('struct Vary {',opticsWGSL+'\n'+meniscusWGSL+'\nstruct Vary {');
