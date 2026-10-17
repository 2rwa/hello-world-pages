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
 let earthRadius=cfg.boat.w;
 let orbXZ=orb.xz;
 // Meniscus only exists while the orb touches the locally sampled FFT sea.
 let orbBaseY=sqrt(max(1.0,earthRadius*earthRadius-dot(orbXZ,orbXZ)))-earthRadius+waveHeight(orbXZ);
 if(abs(orb.y-orbBaseY)>=ballRadius*0.995){return 0.0;}
 // Local FFT surface at the actual point, rather than a constant-height ring.
 let baseSeaY=sqrt(max(1.0,earthRadius*earthRadius-dot(xz,xz)))-earthRadius+waveHeight(xz);
 let seaPoint=vec3f(xz.x,baseSeaY,xz.y);
 let contactDistance=length(seaPoint-orb.xyz)-ballRadius;
 // Compact support, no exponential tail extending around an enlarged sphere.
 // Real macroscopic glass has only a tiny capillary rise: at most 35 mm here.
 let capillaryWidth=clamp(ballRadius*0.10,0.12,0.55);
 let capillaryRise=min(0.035,ballRadius*0.012);
 let innerRamp=smoothstep(-capillaryWidth*0.45,0.0,contactDistance);
 let outerRamp=1.0-smoothstep(0.0,capillaryWidth,contactDistance);
 return capillaryRise*innerRamp*outerRamp;
}
fn meniscusSurfaceHeight(xz:vec2f,orb:vec4f)->f32{
 return waveHeight(xz)+meniscusHeight(xz,orb);
}
fn meniscusImplicitValue(p:vec3f,earthCenter:vec3f,earthRadius:f32,orb:vec4f)->f32{
 return length(p-earthCenter)-earthRadius-meniscusSurfaceHeight(p.xz,orb);
}
fn meniscusWaterNormal(p:vec3f,earthCenter:vec3f,orb:vec4f)->vec3f{
 let originalNormal=waterNormal(p,earthCenter);
 if(meniscusOptions.x<0.5||orb.w<=0.0){return originalNormal;}
 // Retain the original FFT finite difference exactly; add ONLY the local
 // capillary gradient. This does not alter normal sampling over an outer shell.
 let spacing=clamp(orb.w*0.024,0.045,0.12);
 let dx=(meniscusHeight(p.xz+vec2f(spacing,0.0),orb)
        -meniscusHeight(p.xz-vec2f(spacing,0.0),orb))/(2.0*spacing);
 let dz=(meniscusHeight(p.xz+vec2f(0.0,spacing),orb)
        -meniscusHeight(p.xz-vec2f(0.0,spacing),orb))/(2.0*spacing);
 return normalize(originalNormal-vec3f(dx,0.0,dz));
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
   // This bounds test only chooses a meniscus source, never a march rate.
   // Use the actual maximum capillary width, not a ~2R artificial sphere.
   if(meniscusOptions.x>0.5){
    let capillaryWidth=clamp(candidate.w*0.10,0.12,0.55);
    let contactBounds=sphereIntersection(eye,ray,candidate.xyz,candidate.w+capillaryWidth);
    if(contactBounds.y>0.0&&contactBounds.x<nearestContactDistance){
     nearestContactDistance=contactBounds.x;
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
 // An implicit FFT surface is not a signed distance field. Avoid any
 // raymarch step-size branch keyed to sphere bounds: it produces a fake ring.
 // The whole ocean, with or without glass/meniscus, uses one safe schedule.
 .replace('let stride=clamp(abs(oldValue)*0.72,0.65,92.0);',
          'let stride=clamp(abs(oldValue)*0.72,0.12,92.0);')
 .replace('let normal=waterNormal(p,sphereCenter);',
          'let normal=meniscusWaterNormal(p,sphereCenter,contactOrb);')
 .replace(marker,' let background=skyColor(ray);\n'+glassOverlay+'\n if(!hit)');
if(withMeniscus.includes('let background=skyColor(ray);\n if(!hit)')||
   !withMeniscus.includes('meniscusWaterNormal(p,sphereCenter,contactOrb)'))
 throw Error('Failed to inject glass or meniscus geometry');
export const glassWGSL=(header+fragmentPrefix+withMeniscus)
 .replace('struct Vary {',opticsWGSL+'\n'+meniscusWGSL+'\nstruct Vary {');
