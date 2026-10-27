struct SceneParams {
 resolution:vec4f, camera:vec4f, waves:vec4f, settings:vec4f, lighting:vec4f,
};
@group(0) @binding(0) var<uniform> scene:SceneParams;
struct VertexOutput { @builtin(position) position:vec4f, };
@vertex fn vertexMain(@builtin(vertex_index) vertexIndex:u32)->VertexOutput {
 var out:VertexOutput;
 var coords=array<vec2f,3>(vec2f(-1.,-3.),vec2f(3.,1.),vec2f(-1.,1.));
 out.position=vec4f(coords[vertexIndex],0.,1.);
 return out;
}
fn sunDirection()->vec3f {
 let angle=scene.lighting.x;
 let elev=scene.lighting.y;
 return vec3f(sin(angle)*cos(elev),sin(elev),cos(angle)*cos(elev));
}
fn hash21(pos:vec2f)->f32 {
 return fract(sin(dot(pos,vec2f(127.1,311.7)))*43758.5453);
}
// Narrow-band wave trains: complex phasors define a stochastic phase field;
// a harmonic transfer function sharpens the crests. Each band owns its
// wavelength, dispersion frequency and spatial orientation control.
fn oceanHeight(posXZ:vec2f, footprint:f32)->f32 {
 let elapsed=scene.camera.w;
 var displacement=0.0;
 for(var trainIndex:i32=0;trainIndex<6;trainIndex=trainIndex+1) {
  if(f32(trainIndex)>=scene.settings.x){break;}
  let band=f32(trainIndex);
  let wavelength=54.0*pow(0.435,band);
  let waveK=6.2831853/wavelength;
  let omega=sqrt(9.81*waveK);
  let spatial=scene.waves.z;
  let heading=scene.settings.y+band*0.31+
   spatial*(0.22*sin(posXZ.x*0.013+posXZ.y*0.017+elapsed*0.047)+
            0.09*cos(posXZ.y*0.038-elapsed*0.083));
  let dir0=vec2f(cos(heading),sin(heading));
  let dir1=vec2f(cos(heading+0.39),sin(heading+0.39));
  let warped=posXZ+spatial*vec2f(3.6*sin(posXZ.y*0.013+elapsed*0.06),
                                 3.0*cos(posXZ.x*0.016-elapsed*0.05));
  let phase0=waveK*dot(warped,dir0)-omega*elapsed+band*2.17;
  let phase1=waveK*1.075*dot(warped,dir1)-omega*elapsed*1.036+band*4.36;
  let complexWave=0.77*vec2f(cos(phase0),sin(phase0))+
                  0.23*vec2f(cos(phase1),sin(phase1));
  let choppy=complexWave.x+0.25*scene.waves.y*
    (complexWave.x*complexWave.x-complexWave.y*complexWave.y);
  let lowpass=1.0/(1.0+pow(max(0.0,waveK*footprint*0.45),4.0));
  let gust=1.0+spatial*0.22*sin(warped.x*0.036+elapsed*0.17)*
                             sin(warped.y*0.042-elapsed*0.13);
  let amplitude=0.95*scene.waves.x*pow(0.51,band);
  displacement=displacement+amplitude*lowpass*gust*choppy;
 }
 return displacement;
}
fn skyColor(rayDir:vec3f)->vec3f {
 let altitude=clamp(rayDir.y,0.0,1.0);
 let haze=pow(1.0-altitude,4.0);
 var color=mix(vec3f(0.025,0.105,0.205),vec3f(0.27,0.49,0.72),pow(altitude,0.6));
 color=mix(color,vec3f(0.70,0.79,0.82),haze*0.52);
 let sunDot=max(dot(rayDir,sunDirection()),0.0);
 color=color+vec3f(1.0,0.44,0.15)*pow(sunDot,13.0)*0.25;
 color=color+vec3f(1.0,0.76,0.48)*pow(sunDot,2400.0)*9.0;
 color=color+vec3f(1.0,0.75,0.41)*pow(sunDot,100.0)*0.16;
 return color;
}
fn oceanNormal(posXZ:vec2f, radius:f32,footprint:f32)->vec3f {
 let left=oceanHeight(posXZ-vec2f(radius,0.0),footprint);
 let right=oceanHeight(posXZ+vec2f(radius,0.0),footprint);
 let back=oceanHeight(posXZ-vec2f(0.0,radius),footprint);
 let front=oceanHeight(posXZ+vec2f(0.0,radius),footprint);
 return normalize(vec3f(left-right,2.0*radius,back-front));
}
fn oceanShading(rayDir:vec3f,position:vec3f,travel:f32)->vec3f {
 let footprint=max(0.012,travel*0.0010);
 let radius=clamp(0.105+travel*0.001,0.105,1.35);
 let surfaceNormal=oceanNormal(position.xz,radius,footprint);
 let reflected=reflect(rayDir,surfaceNormal);
 let facing=max(dot(-rayDir,surfaceNormal),0.0);
 let fresnel=0.025+0.975*pow(1.0-facing,5.0);
 let distanceMix=clamp(travel/750.0,0.0,1.0);
 let lit=max(dot(surfaceNormal,sunDirection()),0.0);
 var base=mix(vec3f(0.006,0.095,0.145),vec3f(0.012,0.19,0.23),lit*0.56);
 base=base+vec3f(0.008,0.078,0.072)*pow(1.0-surfaceNormal.y,1.3);
 base=mix(base,vec3f(0.025,0.095,0.15),distanceMix*0.65);
 let reflectedSky=skyColor(reflected);
 let roughness=0.028+distanceMix*0.065;
 let sunlight=max(dot(reflected,sunDirection()),0.0);
 let glare=pow(sunlight,0.16/max(0.001,roughness*roughness));
 var color=mix(base,reflectedSky,fresnel*0.93+0.055);
 color=color+vec3f(1.0,0.78,0.49)*glare*(0.2+0.55*fresnel);
 let halfVector=normalize(sunDirection()-rayDir);
 color=color+vec3f(0.22,0.32,0.30)*
   pow(max(dot(surfaceNormal,halfVector),0.0),75.0)*0.12;
 // Phase-correlated foam rather than screen-space random splashes.
 let slope=length(surfaceNormal.xz)/max(surfaceNormal.y,0.12);
 let phase=6.2831853/54.0*
   dot(position.xz,vec2f(cos(scene.settings.y),sin(scene.settings.y)))-
   sqrt(9.81*6.2831853/54.0)*scene.camera.w;
 let steepFoam=smoothstep(0.21,0.68,slope);
 let crestFoam=smoothstep(0.1,0.89,cos(phase));
 let bubbles=0.67+0.33*hash21(floor(position.xz*1.6+
                          vec2f(scene.camera.w*0.21,scene.camera.w*0.08)));
 let foam=steepFoam*mix(0.34,1.0,crestFoam)*bubbles*scene.waves.w;
 color=mix(color,vec3f(0.72,0.86,0.86),clamp(foam,0.0,0.94));
 let mist=smoothstep(160.0,1250.0,travel);
 let horizonColor=skyColor(normalize(vec3f(rayDir.x,0.025,rayDir.z)));
 return mix(color,horizonColor,mist*0.78);
}
@fragment fn fragmentMain(@builtin(position) pixel:vec4f)->@location(0) vec4f {
 let uv=vec2f(pixel.x/scene.resolution.x*2.0-1.0,
              1.0-pixel.y/scene.resolution.y*2.0);
 let aspect=scene.resolution.x/scene.resolution.y;
 let yaw=scene.camera.y;
 let pitch=scene.camera.z;
 let forward=vec3f(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch));
 let right=vec3f(cos(yaw),0.0,-sin(yaw));
 let cameraUp=normalize(cross(forward,right));
 let rayDir=normalize(forward+right*uv.x*aspect*0.78+cameraUp*uv.y*0.78);
 let eye=vec3f(0.0,scene.camera.x,0.0);
 var pixelColor=skyColor(rayDir);
 // Height fields are not distance fields. We bracket the first sign change,
 // then refine with bisection; never use naive SDF sphere tracing.
 if(rayDir.y < -0.0025){
  let heightBound=2.65*scene.waves.x+0.15;
  let nearT=max(0.0,(eye.y-heightBound)/(-rayDir.y));
  let farT=min(1450.0,(eye.y+heightBound)/(-rayDir.y));
  if(nearT<farT && nearT<1450.0){
   var previousT=nearT;
   var previousDiff=eye.y+rayDir.y*nearT-
     oceanHeight((eye+rayDir*nearT).xz,max(0.012,nearT*0.0010));
   var intersected=false;
   var startT=nearT;
   var endT=farT;
   for(var coarse:i32=1;coarse<=20;coarse=coarse+1){
    let sampleT=mix(nearT,farT,f32(coarse)/20.0);
    let sampleP=eye+rayDir*sampleT;
    let signedDelta=sampleP.y-oceanHeight(sampleP.xz,max(0.012,sampleT*0.0010));
    if(previousDiff>=0.0 && signedDelta<=0.0){
     startT=previousT;
     endT=sampleT;
     intersected=true;
     break;
    }
    previousT=sampleT;
    previousDiff=signedDelta;
   }
   if(intersected){
    for(var fine:i32=0;fine<6;fine=fine+1){
     let middleT=(startT+endT)*0.5;
     let middleP=eye+rayDir*middleT;
     let signedDelta=middleP.y-oceanHeight(middleP.xz,max(0.012,middleT*0.0010));
     if(signedDelta>0.0){startT=middleT;}
     else{endT=middleT;}
    }
    let hitT=(startT+endT)*0.5;
    pixelColor=oceanShading(rayDir,eye+rayDir*hitT,hitT);
   }
  }
 }
 let tone=vec3f(1.0)-exp(-max(pixelColor,vec3f(0.0))*1.30);
 return vec4f(pow(tone,vec3f(1.0/2.2)),1.0);
}