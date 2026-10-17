// Optical glass SDF raymarcher. One shader for canvas and offscreen CI.
struct Settings {
  resolution: vec2f,
  elapsed: f32,
  rotation: f32,
  magnification: f32,
  pieceCount: f32,
  glow: f32,
  paletteId: f32,
  mirrorId: f32,
  randomSeed: f32,
  motion: f32,
  unusedValue: f32,
}
@group(0) @binding(0) var<uniform> u: Settings;
const PI: f32 = 3.14159265359;
const ROOT3: f32 = 1.73205080757;
const TRI_SIDE: f32 = 0.56;
@vertex fn vsMain(@builtin(vertex_index) vertexId:u32)->@builtin(position) vec4f {
  let vertices = array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  return vec4f(vertices[vertexId],0.0,1.0);
}
fn rot2(p:vec2f,angle:f32)->vec2f {
  let cs=cos(angle);
  let sn=sin(angle);
  return vec2f(cs*p.x-sn*p.y,sn*p.x+cs*p.y);
}
fn hash1(v:f32)->f32 { return fract(sin(v*127.1+78.233)*43758.5453); }
fn mirrorTriangle(point:vec2f)->vec2f {
  var p=point+vec2f(0.27,0.17);
  let sideLeft=vec2f(-0.8660254,0.5);
  let sideRight=vec2f(0.8660254,0.5);
  // Three physical mirror planes are unfolded as an equilateral triangle tiling.
  for(var stepIndex:i32=0;stepIndex<32;stepIndex=stepIndex+1) {
    if(p.y<0.0){ p=vec2f(p.x,-p.y); }
    let leftOutside=dot(p,sideLeft);
    if(leftOutside>0.0){ p=p-2.0*leftOutside*sideLeft; }
    let rightOutside=dot(p-vec2f(TRI_SIDE,0.0),sideRight);
    if(rightOutside>0.0){ p=p-2.0*rightOutside*sideRight; }
  }
  return p-vec2f(TRI_SIDE*0.5,TRI_SIDE*0.288675);
}
fn mirrorWedge(point:vec2f)->vec2f {
  let radius=length(point);
  let foldedAngle=acos(clamp(cos(6.0*atan2(point.y,point.x)),-1.0,1.0))/6.0;
  let repetition=fract(radius*2.65);
  let r=(repetition*0.84+0.08)*TRI_SIDE;
  return vec2f(cos(foldedAngle)*r,sin(foldedAngle)*r)-vec2f(TRI_SIDE*0.42,TRI_SIDE*0.15);
}
fn pieceCenter(pieceId:i32)->vec3f {
  let ident=f32(pieceId)+u.randomSeed*71.0;
  var baryU=hash1(ident*3.17+1.7);
  var baryV=hash1(ident*9.23+2.4);
  if(baryU+baryV>1.0){ baryU=1.0-baryU; baryV=1.0-baryV; }
  let centre2=vec2f(TRI_SIDE*(baryU+0.5*baryV),TRI_SIDE*0.8660254*baryV)
       -vec2f(TRI_SIDE*0.5,TRI_SIDE*0.288675);
  let phase=u.elapsed*0.38+ident*0.71;
  let wander=vec2f(sin(phase),cos(phase*0.87))*(0.007+u.motion*0.022);
  let depth=0.20+hash1(ident*5.49+8.6)*1.75;
  return vec3f(centre2+wander,depth);
}
fn pieceDistance(pos:vec3f,pieceId:i32)->f32 {
  let fid=f32(pieceId);
  let phase=fid*1.37+u.randomSeed*2.7;
  var local=pos-pieceCenter(pieceId);
  let xyRotated=rot2(local.xy,phase+u.elapsed*(0.16+u.motion*0.32));
  local=vec3f(xyRotated,local.z);
  let xzRotated=rot2(vec2f(local.x,local.z),phase*0.37+sin(u.elapsed*0.29+phase)*0.18);
  local=vec3f(xzRotated.x,local.y,xzRotated.y);
  let scaleFactor=0.78+0.52*hash1(fid*3.4+u.randomSeed);
  let sizeX=(0.035+0.053*hash1(fid*1.9+2.0))*scaleFactor;
  let sizeY=(0.043+0.084*hash1(fid*2.1+4.0))*scaleFactor;
  let sizeZ=0.032+0.018*hash1(fid*4.4+9.0);
  if(pieceId%3==0) {
    let corner=abs(local)/vec3f(sizeX,sizeY,sizeZ);
    return (corner.x+corner.y+corner.z-1.0)*min(sizeX,min(sizeY,sizeZ))*0.57735;
  }
  let boxOffset=abs(local)-vec3f(sizeX,sizeY,sizeZ);
  return length(max(boxOffset,vec3f(0.0)))+min(max(boxOffset.x,max(boxOffset.y,boxOffset.z)),0.0)-0.005;
}
fn nearestGlass(pos:vec3f)->vec2f {
  var nearest=10.0;
  var nearestId=-1.0;
  for(var pieceId:i32=0;pieceId<26;pieceId=pieceId+1) {
    if(f32(pieceId)>=u.pieceCount){break;}
    let d=pieceDistance(pos,pieceId);
    if(d<nearest){nearest=d;nearestId=f32(pieceId);}
  }
  return vec2f(nearest,nearestId);
}
fn glassNormal(pos:vec3f,pieceId:i32)->vec3f {
  let epsilon=0.003;
  let dx=pieceDistance(pos+vec3f(epsilon,0.0,0.0),pieceId)-pieceDistance(pos-vec3f(epsilon,0.0,0.0),pieceId);
  let dy=pieceDistance(pos+vec3f(0.0,epsilon,0.0),pieceId)-pieceDistance(pos-vec3f(0.0,epsilon,0.0),pieceId);
  let dz=pieceDistance(pos+vec3f(0.0,0.0,epsilon),pieceId)-pieceDistance(pos-vec3f(0.0,0.0,epsilon),pieceId);
  return normalize(vec3f(dx,dy,dz)+vec3f(0.00001));
}
fn glassTone(pieceId:i32)->vec3f {
  let hue=hash1(f32(pieceId)*8.3+u.randomSeed*0.63);
  if(u.paletteId<0.5){
    if(hue<0.25){return vec3f(1.0,0.14,0.16);}
    if(hue<0.53){return vec3f(1.0,0.57,0.10);}
    if(hue<0.75){return vec3f(0.90,0.17,0.48);}
    return vec3f(0.27,0.67,0.49);
  }
  if(u.paletteId<1.5){
    if(hue<0.3){return vec3f(0.10,0.40,0.97);}
    if(hue<0.58){return vec3f(0.02,0.77,0.60);}
    if(hue<0.8){return vec3f(0.31,0.78,0.95);}
    return vec3f(0.85,0.70,0.28);
  }
  if(u.paletteId<2.5){
    if(hue<0.3){return vec3f(0.94,0.50,0.55);}
    if(hue<0.57){return vec3f(0.62,0.59,0.88);}
    if(hue<0.8){return vec3f(0.53,0.82,0.68);}
    return vec3f(0.98,0.81,0.45);
  }
  if(hue<0.24){return vec3f(0.96,0.22,0.15);}
  if(hue<0.48){return vec3f(0.21,0.45,0.98);}
  if(hue<0.74){return vec3f(0.12,0.89,0.43);}
  return vec3f(1.0,0.68,0.09);
}
fn traceGlass(origin:vec3f,direction:vec3f,startT:f32)->vec2f {
  var distTravel=startT;
  var foundId=-1.0;
  for(var marchIndex:i32=0;marchIndex<58;marchIndex=marchIndex+1) {
    let pos=origin+direction*distTravel;
    if(pos.z>2.35){break;}
    let glass=nearestGlass(pos);
    if(glass.x<0.003){foundId=glass.y;break;}
    distTravel=distTravel+clamp(glass.x*0.8,0.008,0.16);
  }
  return vec2f(distTravel,foundId);
}
fn triangularSeam(point:vec2f)->f32 {
  let p=point+vec2f(TRI_SIDE*0.5,TRI_SIDE*0.288675);
  let edgeBottom=p.y;
  let edgeLeft=ROOT3*p.x-p.y;
  let edgeRight=ROOT3*(TRI_SIDE-p.x)-p.y;
  return min(edgeBottom,min(edgeLeft,edgeRight));
}
@fragment fn fsMain(@builtin(position) fragmentPos:vec4f)->@location(0) vec4f {
  // Canvas pixel coordinates are y-down; the optic is invariant under a y flip.
  let screenUV=(fragmentPos.xy/u.resolution-vec2f(0.5))*2.0;
  let axis=screenUV*vec2f(u.resolution.x/u.resolution.y,1.0);
  let radius=length(axis);
  let outer=vec3f(0.012,0.018,0.019);
  if(radius>=0.985){
    let ring=exp(-pow((radius-1.015)*60.0,2.0));
    let metal=vec3f(0.36,0.24,0.10)*ring;
    return vec4f(outer+metal,1.0);
  }
  let rayPlane=rot2(axis*u.magnification,u.rotation);
  var mirrored:vec2f;
  if(u.mirrorId<0.5){mirrored=mirrorTriangle(rayPlane);}
  else{mirrored=mirrorWedge(rayPlane);}
  // Backlit translucent glass at different depths, in the mirrored triangular chamber.
  let origin=vec3f(mirrored,-0.38);
  let rayDirection=vec3f(0.0,0.0,1.0);
  let seam=triangularSeam(mirrored);
  let filigree=(1.0-smoothstep(0.0015,0.013,seam))*(1.0-u.mirrorId);
  let grain=hash1(floor(mirrored.x*290.0)+floor(mirrored.y*311.0)*17.0);
  let glowFalloff=1.0-0.25*radius*radius;
  var base=vec3f(0.41,0.34,0.26)+vec3f(0.12,0.09,0.05)*grain;
  if(u.paletteId>0.5&&u.paletteId<1.5){base=vec3f(0.19,0.34,0.42)+vec3f(0.05,0.10,0.12)*grain;}
  if(u.paletteId>1.5&&u.paletteId<2.5){base=vec3f(0.46,0.39,0.42)+vec3f(0.12,0.08,0.1)*grain;}
  if(u.paletteId>2.5){base=vec3f(0.29,0.32,0.38)+vec3f(0.10,0.07,0.07)*grain;}
  var finalColor=base;
  var transmittance=1.0;
  var nextT=0.0;
  for(var layerIndex:i32=0;layerIndex<3;layerIndex=layerIndex+1){
    let traced=traceGlass(origin,rayDirection,nextT);
    if(traced.y<0.0){break;}
    let hitId=i32(traced.y);
    let hitPos=origin+rayDirection*traced.x;
    let surfNormal=glassNormal(hitPos,hitId);
    let tint=glassTone(hitId);
    let lighting=0.47+0.43*max(0.0,dot(surfNormal,normalize(vec3f(-0.52,0.7,-0.50))));
    let rim=pow(1.0-abs(dot(surfNormal,rayDirection)),2.2);
    let sparkle=pow(max(dot(reflect(rayDirection,surfNormal),normalize(vec3f(0.35,-0.48,-0.81))),0.0),12.0);
    let iridescence=vec3f(0.13,0.24,0.39)*rim+vec3f(1.0,0.78,0.48)*sparkle*0.8;
    let glassLight=tint*(0.70+lighting*0.68)+iridescence;
    let coverage=0.77;
    finalColor=mix(finalColor,finalColor*(1.0-coverage)+glassLight*coverage,transmittance);
    transmittance=transmittance*0.58;
    nextT=traced.x+0.11;
  }
  let mottling=sin(mirrored.x*69.0+mirrored.y*53.0)*sin(mirrored.y*37.0);
  finalColor=finalColor+vec3f(0.03,0.025,0.02)*mottling;
  finalColor=finalColor*(1.0-0.35*filigree);
  let shadow=1.0-smoothstep(0.71,0.985,radius);
  let edgeGold=exp(-pow((radius-0.946)*72.0,2.0));
  finalColor=finalColor*shadow*glowFalloff*u.glow+vec3f(0.14,0.098,0.041)*edgeGold;
  finalColor=pow(max(finalColor,vec3f(0.0)),vec3f(0.86));
  return vec4f(finalColor,1.0);
}