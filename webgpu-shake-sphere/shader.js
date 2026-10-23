import {optics} from './optics.js';
export const wgsl = /* wgsl */ `
struct Scene {
 screen:vec4f,
 view:vec4f,
 options:vec4f,
 beads:array<vec4f,50>,
 flags:array<vec4f,50>,
};
@group(0) @binding(0) var<uniform> scene:Scene;
struct VertexOut{@builtin(position) position:vec4f,};
@vertex fn vertexMain(@builtin(vertex_index) vi:u32)->VertexOut{
 var output:VertexOut;
 let vertices=array<vec2f,3>(
  vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
 output.position=vec4f(vertices[vi],0.0,1.0);
 return output;
}
fn baseColor(plane:vec2f)->vec3f{
 let uv=plane/max(scene.screen.z,scene.screen.w);
 let distance2D=length(uv);
 let vignette=clamp(1.0-distance2D*0.27,0.25,1.0);
 let cold=vec3f(0.014,0.032,0.054);
 let warm=vec3f(0.023,0.060,0.079);
 var c=mix(cold,warm,clamp(0.5+uv.y*0.34,0.0,1.0))*vignette;
 let radialGlow=exp(-distance2D*2.8);
 c+=vec3f(0.025,0.052,0.066)*radialGlow;
 let lineX=fract(plane.x*0.96);
 let lineY=fract(plane.y*0.96);
 let gridEdge=min(min(lineX,1.0-lineX),min(lineY,1.0-lineY));
 c+=vec3f(0.009,0.024,0.029)*(1.0-smoothstep(0.004,0.021,gridEdge));
 return c;
}
fn glassTint(ballIndex:u32)->vec3f{
 let p=f32(ballIndex)*2.399963;
 return vec3f(0.50,0.72,0.78)+vec3f(
   0.24*cos(p),0.20*cos(p+2.1),0.18*cos(p+4.2));
}
fn shadeMarble(ballIndex:u32,worldXY:vec2f,frontDepth:f32,
 backgroundColor:vec3f)->vec3f{
 let bead=scene.beads[ballIndex];
 let marker=scene.flags[ballIndex];
 let normal=normalize(vec3f(worldXY-bead.xy,frontDepth-bead.z));
 let facing=clamp(normal.z,0.0,1.0);
 let fresnel=0.04+0.96*pow(1.0-facing,5.0);
 let light=normalize(vec3f(-0.37,0.54,0.76));
 let diffuse=max(dot(normal,light),0.0);
 let transmitted=backgroundColor*1.4+glassTint(ballIndex)*0.28;
 let env=vec3f(0.14,0.32,0.39)+vec3f(0.50,0.66,0.72)*diffuse;
 var color=mix(transmitted,env,fresnel*0.83);
 let highlight=pow(max(dot(reflect(vec3f(0.0,0.0,-1.0),normal),light),0.0),94.0);
 color+=vec3f(0.76,0.96,1.0)*highlight;
 let topSpec=pow(max(0.0,normal.z*0.75+normal.x*0.32-normal.y*0.24),13.0);
 color+=glassTint(ballIndex)*topSpec*0.13;
 if(scene.options.y>0.5){
   // TRUE 3D interpenetration -> red / magenta.
   let penetration=clamp(marker.x/bead.w*2.0,0.0,1.0);
   color=mix(color,vec3f(1.0,0.045,0.12)+vec3f(0.3,0.0,0.2)*penetration,
     penetration*0.82);
   // View-space projection overlap (without physical penetration) -> cyan ring.
   let hasDepthMate=clamp(marker.y,0.0,1.0);
   let rim=pow(1.0-facing,5.0);
   color+=vec3f(0.04,0.39,0.50)*hasDepthMate*rim;
 }
 return color;
}
` + optics + /* wgsl */ `
@fragment fn fragmentMain(@builtin(position) pixelPosition:vec4f)->@location(0) vec4f{
 let uv=pixelPosition.xy/scene.screen.xy;
 // Pixel Y points down; ray coordinates point up.
 let xy=vec2f((uv.x*2.0-1.0)*scene.screen.z,
  (1.0-uv.y*2.0)*scene.screen.w-scene.view.z);
 let containerRadius=scene.view.x;
 let radial=length(xy);
 let opticalOn=scene.options.x>0.5;
 var color=baseColor(xy);
 var debugHitAlpha=0.25;
 if(radial<containerRadius){
  let zShell=sqrt(max(0.0,containerRadius*containerRadius-radial*radial));
  let entrance=shellEntry(xy,zShell,opticalOn);
  if(entrance.valid){
   // Raymarch toward the marble surfaces along the refracted cavity ray.
   let primaryHit=traceMarbles(entrance.origin,entrance.direction);
   var transmittedStart=entrance.origin;
   var transmittedDirection=entrance.direction;
   var marbleThickness=0.0;
   if(primaryHit.found){
    debugHitAlpha=1.0;
    let transmittedRay=beadTransmission(primaryHit,entrance.direction,opticalOn);
    if(transmittedRay.valid){
     transmittedStart=transmittedRay.origin;
     transmittedDirection=transmittedRay.direction;
     marbleThickness=length(transmittedStart-primaryHit.position);
    }
   }
   var transmissionColor=glassBackground(transmittedStart,transmittedDirection,opticalOn);
   // Background or rear marble is seen through the front marble's bent rays.
   if(primaryHit.found){
    let rearHit=findRearMarble(transmittedStart,transmittedDirection,primaryHit.beadIndex);
    if(rearHit.found){
     let rearColor=shadeMarble(rearHit.beadIndex,rearHit.position.xy,
       rearHit.position.z,transmissionColor);
     transmissionColor=mix(transmissionColor,rearColor,0.72);
    }
    let beadColor=shadeMarble(primaryHit.beadIndex,primaryHit.position.xy,
      primaryHit.position.z,transmissionColor);
    let transmissionLoss=exp(-marbleThickness*0.19);
    color=mix(transmissionColor*transmissionLoss,beadColor,0.79);
   }else{
    color=transmissionColor;
   }
   let domeFacing=zShell/containerRadius;
   let shellFresnel=pow(1.0-domeFacing,5.0);
   color=mix(color,vec3f(0.13,0.42,0.56),shellFresnel*0.39);
   let domeGlint=pow(max(domeFacing*0.86+xy.x/containerRadius*0.18-
     xy.y/containerRadius*0.21,0.0),22.0);
   color+=vec3f(0.31,0.52,0.59)*domeGlint*0.046;
  }else{
   color=mix(color,vec3f(0.12,0.36,0.46),0.18);
  }
 }
 // Analytic Fresnel rim of the spherical glass wall (no fake double-sized halo).
 let rimDistance=radial-containerRadius;
 let innerRim=exp(-pow((rimDistance+0.045)/0.064,2.0));
 let outerRim=exp(-pow((rimDistance-0.026)/0.058,2.0));
 let arcAngle=atan2(xy.y,xy.x);
 let glint=pow(max(sin(arcAngle*2.0+0.8),0.0),6.0);
 color+=innerRim*vec3f(0.11,0.40,0.49);
 color+=outerRim*(vec3f(0.13,0.38,0.45)+glint*vec3f(0.32,0.42,0.46));
 let brightArc=exp(-pow((arcAngle-2.4)/0.32,2.0));
 color+=innerRim*brightArc*vec3f(0.62,0.71,0.78);
 let toneMapped=color/(vec3f(1.0)+color*0.34);
 return vec4f(clamp(toneMapped,vec3f(0.0),vec3f(1.0)),debugHitAlpha);
}
`;