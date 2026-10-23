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
@fragment fn fragmentMain(@builtin(position) pixelPosition:vec4f)->@location(0) vec4f{
 let uv=pixelPosition.xy/scene.screen.xy;
 let xy=vec2f((uv.x*2.0-1.0)*scene.screen.z,
  (1.0-uv.y*2.0)*scene.screen.w-scene.view.z);
 let containerRadius=scene.view.x;
 let radial=length(xy);
 var color=baseColor(xy);
 if(radial<containerRadius){
  // The rear wall is visible, while the sphere is optically translucent.
  let zShell=sqrt(max(0.0,containerRadius*containerRadius-radial*radial));
  let backdrop=color+vec3f(0.035,0.067,0.085)*clamp(zShell/containerRadius,0.0,1.0);
  color=backdrop;
  // Sphere tracing of the union of true sphere SDFs along the view ray.
  // The analytical outer-shell intersection only bounds the marching interval.
  // Rejecting a bead outside this XY ray's silhouette is safe: it cannot be hit.
  var depthFront=-1e5;
  var depthBack=-1e5;
  var indexFront=0u;
  var indexBack=0u;
  var probeDepth=zShell-0.004;
  for(var traceIndex=0u;traceIndex<64u;traceIndex=traceIndex+1u){
   if(probeDepth < -zShell-0.005){break;}
   var nearestDistance=1e4;
   var nearestIndex=0u;
   var hasCandidate=false;
   for(var beadIndex=0u;beadIndex<50u;beadIndex=beadIndex+1u){
    if(f32(beadIndex)>=scene.view.y){break;}
    let sphereData=scene.beads[beadIndex];
    let deltaXY=xy-sphereData.xy;
    if(dot(deltaXY,deltaXY)>sphereData.w*sphereData.w){continue;}
    hasCandidate=true;
    let signedDistance=length(vec3f(deltaXY,probeDepth-sphereData.z))-sphereData.w;
    if(signedDistance<nearestDistance){
     nearestDistance=signedDistance;
     nearestIndex=beadIndex;
    }
   }
   if(!hasCandidate){break;}
   if(nearestDistance<0.004){
    if(depthFront< -1e4){
     depthFront=probeDepth;
     indexFront=nearestIndex;
    }else{
     depthBack=probeDepth;
     indexBack=nearestIndex;
     break;
    }
    // Move to the back of the hit sphere, then resume SDF raymarching.
    let hitSphere=scene.beads[nearestIndex];
    let projectedDelta=xy-hitSphere.xy;
    let exitOffset=sqrt(max(0.0,hitSphere.w*hitSphere.w-dot(projectedDelta,projectedDelta)));
    probeDepth=hitSphere.z-exitOffset-0.012;
   }else{
    probeDepth=probeDepth-max(0.008,nearestDistance*0.90);
   }
  }
  if(depthBack>-1e4){
   let backShade=shadeMarble(indexBack,xy,depthBack,backdrop);
   color=mix(color,backShade,0.64);
  }
  if(depthFront>-1e4){
   let frontShade=shadeMarble(indexFront,xy,depthFront,color);
   let opacity=select(0.84,0.65,scene.options.x>0.5);
   color=mix(color,frontShade,opacity);
  }
  let surfaceZ=zShell/containerRadius;
  let FresnelShell=pow(1.0-surfaceZ,4.0);
  let overhead=pow(max(surfaceZ*0.86+xy.x/containerRadius*0.18-
    xy.y/containerRadius*0.21,0.0),19.0);
  color=mix(color,vec3f(0.22,0.59,0.65),FresnelShell*0.30);
  color+=vec3f(0.18,0.32,0.37)*overhead*0.065;
 }
 // Glowing glass rim; a thin second rim gives the shell a real thickness.
 let boundary=radial-containerRadius;
 let innerRim=exp(-pow((boundary+0.045)/0.068,2.0));
 let outerRim=exp(-pow((boundary-0.026)/0.060,2.0));
 let angle=atan2(xy.y,xy.x);
 let glint=pow(max(sin(angle*2.0+0.8),0.0),6.0);
 color+=innerRim*vec3f(0.12,0.46,0.56);
 color+=outerRim*(vec3f(0.15,0.44,0.50)+glint*vec3f(0.38,0.49,0.54));
 let brightArc=exp(-pow((angle-2.4)/0.32,2.0));
 color+=innerRim*brightArc*vec3f(0.65,0.78,0.83);
 let film=exp(-pow(boundary/0.25,2.0));
 color+=film*vec3f(0.026,0.053,0.062);
 let toneMapped=color/(vec3f(1.0)+color*0.34);
 return vec4f(clamp(toneMapped,vec3f(0.0),vec3f(1.0)),1.0);
}
`;
