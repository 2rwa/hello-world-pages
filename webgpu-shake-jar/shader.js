export const wgsl = /* wgsl */ `
struct FrameData {
  screen: vec4f,
  view: vec4f,
  params: vec4f,
  beads: array<vec4f, 50>,
  spins: array<vec4f, 50>,
};
@group(0) @binding(0) var<uniform> frame: FrameData;
struct VertexOut{@builtin(position) position:vec4f,};
@vertex fn vertexMain(@builtin(vertex_index) vertexIndex:u32)->VertexOut{
  var output:VertexOut;
  let vertexPositions=array<vec2f,3>(
    vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  output.position=vec4f(vertexPositions[vertexIndex],0.0,1.0);
  return output;
}
fn cosPalette(index:u32)->vec3f{
 let angle=f32(index)*2.399963;
 return 0.58+0.32*cos(vec3f(0.0,2.094,4.188)+angle);
}
fn background(plane:vec2f)->vec3f{
 let uv=plane/max(frame.screen.z,frame.screen.w);
 let radial=length(uv);
 let bloom=exp(-radial*2.2);
 let diagonal=0.5+0.5*sin(uv.x*3.3-uv.y*4.2);
 let dark=vec3f(0.015,0.029,0.052);
 return dark+vec3f(0.026,0.054,0.071)*bloom
   +vec3f(0.004,0.012,0.026)*diagonal;
}
fn floorShade(plane:vec2f)->vec3f{
 let r=length(plane);
 let radius=frame.view.z;
 let diffuse=vec3f(0.048,0.12,0.15)*(1.0-0.12*r/radius);
 let gx=fract(plane.x*1.45);
 let gy=fract(plane.y*1.45);
 let smallGrid=min(min(gx,1.0-gx),min(gy,1.0-gy));
 let micro=1.0-smoothstep(0.005,0.028,smallGrid);
 var color=diffuse+vec3f(0.023,0.068,0.073)*micro;
 let circularMark=abs(r/radius-0.73);
 color+=vec3f(0.022,0.10,0.12)*(1.0-smoothstep(0.008,0.024,circularMark));
 let broadBeam=pow(max(0.0,1.0-abs(plane.x+plane.y*0.33)/6.0),2.0);
 color+=vec3f(0.015,0.028,0.026)*broadBeam;
 for(var idx=0u;idx<50u;idx=idx+1u){
  if(f32(idx)>=frame.view.w){break;}
  let bead=frame.beads[idx];
  let shadowCenter=bead.xy+vec2f(0.07,-0.10)*bead.z;
  let separation=plane-shadowCenter;
  let distSq=dot(separation,separation)/(bead.w*bead.w);
  if(distSq>15.0){continue;}
  let softness=1.45+bead.z*0.9;
  let shadow=exp(-distSq/softness)*0.42;
  let annulus=exp(-pow((sqrt(distSq)-1.27-bead.z*0.25)/0.26,2.0));
  color*=1.0-shadow;
  color+=annulus*vec3f(0.032,0.10,0.15);
 }
 return color;
}
fn envReflection(directionValue:vec3f)->vec3f{
 let pane=1.0-smoothstep(0.16,0.30,abs(directionValue.x+0.33));
 let top=1.0-smoothstep(0.10,0.36,abs(directionValue.y-0.26));
 let rim=pow(max(0.0,1.0-abs(directionValue.z)),3.0);
 return vec3f(0.12,0.24,0.30)+pane*top*vec3f(0.82,0.93,1.0)+
   rim*vec3f(0.19,0.26,0.29);
}
fn rotateNormal(normalValue:vec3f,q:vec4f)->vec3f{
 let qvec=-q.xyz;
 let axisDelta=2.0*cross(qvec,normalValue);
 return normalValue+q.w*axisDelta+cross(qvec,axisDelta);
}
fn shadeGlass(rayEntry:vec3f,rayDir:vec3f,bead:vec4f,spin:vec4f,beadIndex:u32)->vec3f{
 let sphereCentre=vec3f(bead.xy,bead.z);
 let outward=normalize(rayEntry-sphereCentre);
 let eta=1.0/1.49;
 let internalRay=refract(rayDir,outward,eta);
 let thickness=max(0.0,-2.0*dot(rayEntry-sphereCentre,internalRay));
 let exitPoint=rayEntry+internalRay*thickness;
 let exitNormal=normalize(exitPoint-sphereCentre);
 var outputRay=refract(internalRay,-exitNormal,1.49);
 if(dot(outputRay,outputRay)<0.01){outputRay=reflect(internalRay,-exitNormal);}
 let distanceToFloor=max(0.0,-exitPoint.z/min(outputRay.z,-0.08));
 let landing=exitPoint.xy+outputRay.xy*distanceToFloor;
 let floorColor=floorShade(landing);
 let reflected=reflect(rayDir,outward);
 let fresnelBase=pow((1.49-1.0)/(1.49+1.0),2.0);
 let angle=clamp(dot(-rayDir,outward),0.0,1.0);
 let fresnel=fresnelBase+(1.0-fresnelBase)*pow(1.0-angle,5.0);
 let chroma=cosPalette(beadIndex);
 let absorber=exp(-vec3f(0.22,0.18,0.25)*thickness);
 let transmitted=floorColor*(0.74+chroma*0.72)*absorber*1.57;
 var finalColor=mix(transmitted,envReflection(reflected),fresnel*0.93);
 let lightDir=normalize(vec3f(-0.38,0.51,0.79));
 let highlight=pow(max(0.0,dot(reflected,lightDir)),135.0);
 finalColor+=vec3f(0.90,0.99,1.0)*highlight*1.18;
 let cleanN=rotateNormal(outward,spin);
 let inclusion=1.0-smoothstep(0.045,0.105,distance(cleanN,normalize(vec3f(0.2,0.7,0.7))));
 finalColor=mix(finalColor,chroma*0.7+vec3f(0.12,0.15,0.2),inclusion*0.33);
 let topLight=max(dot(outward,lightDir),0.0);
 finalColor+=vec3f(0.035,0.068,0.076)*topLight;
 return finalColor;
}
fn jarColor(plane:vec2f)->vec3f{
 let r=length(plane);
 let radius=frame.view.z;
 let edge=r-radius;
 let exterior=background(plane);
 let floor=floorShade(plane);
 let inside=1.0-smoothstep(-0.015,0.035,edge);
 var color=mix(exterior,floor,inside);
 // A transparent cylindrical rim, outer bevel and inner glass highlight.
 let darkOuter=exp(-pow(edge/0.29,2.0));
 let inner=exp(-pow((edge+0.11)/0.051,2.0));
 let outer=exp(-pow((edge-0.095)/0.063,2.0));
 let glint=(0.52+0.48*sin(atan2(plane.y,plane.x)*2.0+1.6));
 color*=1.0-0.18*darkOuter;
 color+=vec3f(0.09,0.27,0.30)*darkOuter;
 color+=vec3f(0.42,0.83,0.92)*inner*(0.50+0.50*glint);
 color+=vec3f(0.24,0.50,0.56)*outer*(0.65+0.35*glint);
 let upperGlass=exp(-pow((edge+0.23)/0.19,2.0))*
   max(0.0,0.45+0.55*cos(atan2(plane.y,plane.x)*2.0+0.35));
 color+=vec3f(0.034,0.064,0.083)*upperGlass;
 // Short highlights like overhead reflections in the jar's lid.
 let a=atan2(plane.y,plane.x);
 let arcA=exp(-pow((a-2.08)/0.30,2.0));
 let arcB=exp(-pow((a+0.70)/0.17,2.0));
 color+=vec3f(0.52,0.86,0.96)*(arcA+arcB*0.7)*inner;
 return color;
}
@fragment fn fragmentMain(@builtin(position) pixelPosition:vec4f)->@location(0) vec4f{
 let uv=pixelPosition.xy/frame.screen.xy;
 let xy=vec2f((uv.x*2.0-1.0)*frame.screen.z,
   (1.0-uv.y*2.0)*frame.screen.w)-frame.view.xy;
 var finalColor=jarColor(xy);
 if(length(xy)<frame.view.z-0.04){
  var frontDepth=-1e6;
  var beadIndex=0u;
  for(var idx=0u;idx<50u;idx=idx+1u){
   if(f32(idx)>=frame.view.w){break;}
   let bead=frame.beads[idx];
   let diff=xy-bead.xy;
   let dSq=dot(diff,diff);
   let radiusSq=bead.w*bead.w;
   if(dSq<radiusSq){
    let depth=bead.z+sqrt(max(radiusSq-dSq,0.0));
    if(depth>frontDepth){frontDepth=depth;beadIndex=idx;}
   }
  }
  if(frontDepth>0.0){
    let bead=frame.beads[beadIndex];
    let entry=vec3f(xy,frontDepth);
    finalColor=shadeGlass(entry,vec3f(0.0,0.0,-1.0),bead,frame.spins[beadIndex],beadIndex);
  }
 }
 // Glass-lid stripe and gentle specular sweep.
 let ripple=1.0-smoothstep(0.022,0.12,abs(xy.y-xy.x*0.26-2.2));
 let lidMask=1.0-smoothstep(frame.view.z-0.95,frame.view.z-0.12,length(xy));
 finalColor+=vec3f(0.018,0.046,0.06)*ripple*lidMask;
 let toneMapped=finalColor/(vec3f(1.0)+finalColor*0.31);
 return vec4f(clamp(toneMapped,vec3f(0.0),vec3f(1.0)),1.0);
}
`;
