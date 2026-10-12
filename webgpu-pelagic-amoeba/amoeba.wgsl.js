export const amoebaWGSL = /* wgsl */ `
struct Params {viewProj:mat4x4f,sim:vec4f,boat:vec4f,prior:vec4f,extra:vec4f,eye:vec4f};
struct Opts {shape:vec4f,trace:vec4f,style:vec4f};
struct BodySphere {centerRadius:vec4f,phaseValues:vec4f};
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var<uniform> cfgAmoeba:Opts;
@group(0) @binding(2) var<storage,read> bodySpheres:array<BodySphere>;
@group(0) @binding(3) var sceneColor:texture_2d<f32>;
@group(0) @binding(4) var sceneDepth:texture_depth_2d;
@group(0) @binding(5) var sceneSampler:sampler;
struct FullScreenOut {@builtin(position) position:vec4f,@location(0) screen:vec2f};
@vertex fn fullScreenVertex(@builtin(vertex_index) vertexId:u32)->FullScreenOut {
 let points=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
 var result:FullScreenOut;
 result.screen=points[vertexId];
 result.position=vec4f(result.screen,0.0,1.0);
 return result;
}
fn currentLocal(worldPos:vec3f)->vec3f {
 let heading=vec3f(cos(cfg.sim.w),0.0,sin(cfg.sim.w));
 let sideways=vec3f(-heading.z,0.0,heading.x);
 let offset=worldPos-cfg.boat.xyz;
 return vec3f(dot(offset,heading),offset.y,dot(offset,sideways));
}
fn smoothUnion(a:f32,b:f32,blendWidth:f32)->f32 {
 let h=clamp(0.5+0.5*(b-a)/blendWidth,0.0,1.0);
 return mix(b,a,h)-blendWidth*h*(1.0-h);
}
fn bodyDistance(worldPos:vec3f)->f32 {
 let pos=currentLocal(worldPos);
 var totalDist=100000.0;
 let count=u32(clamp(cfgAmoeba.shape.x,3.0,100.0));
 let time=cfg.sim.x;
 let running=clamp(abs(cfg.prior.w)/20.0,0.0,1.0);
 for(var idx:u32=0u;idx<100u;idx++){
  if(idx>=count){break;}
  let particle=bodySpheres[idx];
  let phase=particle.phaseValues.x;
  let sway=cfgAmoeba.trace.x;
  let drift=vec3f(
    0.30*sin(time*1.7+phase),
    0.38*sin(time*2.1+phase*1.3),
    0.34*cos(time*1.4+phase*1.7)
  )*sway;
  let position=particle.centerRadius.xyz+drift;
  position.x*=1.0+running*cfgAmoeba.trace.y*0.40;
  position.z*=1.0-0.12*running;
  let radius=particle.centerRadius.w*(1.0+0.07*sway*sin(time*2.3+phase*2.2));
  let ballDistance=length(pos-position)-radius;
  if(idx==0u){totalDist=ballDistance;}
  else{totalDist=smoothUnion(totalDist,ballDistance,max(0.05,cfgAmoeba.shape.y));}
 }
 return totalDist;
}
fn bodyNormal(worldPos:vec3f)->vec3f {
 let e=0.028;
 let k0=vec3f(1.0,-1.0,-1.0);
 let k1=vec3f(-1.0,-1.0,1.0);
 let k2=vec3f(-1.0,1.0,-1.0);
 let k3=vec3f(1.0,1.0,1.0);
 return normalize(k0*bodyDistance(worldPos+k0*e)+k1*bodyDistance(worldPos+k1*e)
  +k2*bodyDistance(worldPos+k2*e)+k3*bodyDistance(worldPos+k3*e));
}
fn skyLight(rayDir:vec3f)->vec3f {
 let up=max(rayDir.y,0.0);
 let base=mix(vec3f(0.45,0.73,0.84),vec3f(0.025,0.17,0.39),pow(up,0.65));
 let elevation=clamp(cfg.extra.y,0.08,1.45);
 let sunDir=normalize(vec3f(-0.78*cos(elevation),sin(elevation),0.62*cos(elevation)));
 let disc=pow(max(dot(normalize(rayDir),sunDir),0.0),1200.0);
 return base+vec3f(1.0,0.87,0.58)*disc*2.6;
}
fn projectUV(worldPos:vec3f)->vec2f {
 let clipPos=cfg.viewProj*vec4f(worldPos,1.0);
 let ndc=clipPos.xy/max(0.001,clipPos.w);
 return vec2f(ndc.x*0.5+0.5,0.5-ndc.y*0.5);
}
fn screenSample(uv:vec2f)->vec3f {
 return textureSampleLevel(sceneColor,sceneSampler,clamp(uv,vec2f(0.001),vec2f(0.999)),0.0).rgb;
}
fn glassFresnel(cosTheta:f32,ior:f32)->f32 {
 let f0=pow((ior-1.0)/(ior+1.0),2.0);
 return f0+(1.0-f0)*pow(1.0-clamp(cosTheta,0.0,1.0),5.0);
}
struct RayHit {position:vec3f,found:bool,lengthTravel:f32};
fn marchFront(rayOrigin:vec3f,rayDir:vec3f,nearT:f32,farT:f32)->RayHit {
 var distanceTravel=nearT;
 var foundHit=false;
 let maxIterations=u32(clamp(cfgAmoeba.trace.w,24.0,96.0));
 for(var step:u32=0u;step<96u;step++){
  if(step>=maxIterations||distanceTravel>farT){break;}
  let currentPos=rayOrigin+rayDir*distanceTravel;
  let signedDistance=bodyDistance(currentPos);
  if(abs(signedDistance)<0.016){foundHit=true;break;}
  distanceTravel+=max(0.018,abs(signedDistance)*0.62);
 }
 return RayHit(rayOrigin+rayDir*distanceTravel,foundHit,distanceTravel);
}
fn marchInterior(startPos:vec3f,rayDir:vec3f)->RayHit {
 var distanceTravel=0.0;
 var foundHit=false;
 let maxIterations=u32(clamp(cfgAmoeba.trace.w,24.0,96.0));
 for(var step:u32=0u;step<96u;step++){
  if(step>=maxIterations||distanceTravel>35.0){break;}
  let currentPos=startPos+rayDir*distanceTravel;
  let signedDistance=bodyDistance(currentPos);
  if((signedDistance>=-0.012)&&distanceTravel>0.025){foundHit=true;break;}
  distanceTravel+=max(0.024,abs(signedDistance)*0.64);
 }
 return RayHit(startPos+rayDir*distanceTravel,foundHit,distanceTravel);
}
@fragment fn fullScreenFragment(input:FullScreenOut)->@location(0) vec4f {
 let originalUV=vec2f(input.screen.x*0.5+0.5,0.5-input.screen.y*0.5);
 let original=screenSample(originalUV);
 let forward=normalize(cfg.boat.xyz-cfg.eye.xyz);
 let right=normalize(cross(forward,vec3f(0.0,1.0,0.0)));
 let upper=cross(right,forward);
 let viewDir=normalize(forward+(right*input.screen.x*cfg.extra.w+upper*input.screen.y)*0.533);
 let rayStart=cfg.eye.xyz;
 let toCenter=rayStart-cfg.boat.xyz;
 let halfProjected=dot(toCenter,viewDir);
 let radius=cfgAmoeba.style.w;
 let delta=halfProjected*halfProjected-dot(toCenter,toCenter)+radius*radius;
 if(delta<0.0){return vec4f(original,1.0);}
 let distanceSqrt=sqrt(delta);
 let boundNear=max(0.0,-halfProjected-distanceSqrt);
 let boundFar=-halfProjected+distanceSqrt;
 if(boundFar<=0.0){return vec4f(original,1.0);}
 let entry=marchFront(rayStart,viewDir,boundNear,boundFar);
 if(!entry.found){return vec4f(original,1.0);}
 // Retain the existing ocean depth: portions beneath visible waves remain occluded.
 let clipHit=cfg.viewProj*vec4f(entry.position,1.0);
 let fragDepth=clipHit.z/max(0.001,clipHit.w);
 let sampledDepth=textureLoad(sceneDepth,vec2i(input.position.xy),0);
 if(fragDepth>sampledDepth+0.0005){return vec4f(original,1.0);}
 let outsideNormal=bodyNormal(entry.position);
 let ior=clamp(cfgAmoeba.shape.z,1.01,2.4);
 let incoming=refract(viewDir,outsideNormal,1.0/ior);
 let entryFresnel=glassFresnel(dot(-viewDir,outsideNormal),ior);
 let reflected=skyLight(reflect(viewDir,outsideNormal));
 if(length(incoming)<0.01){return vec4f(reflected,1.0);}
 var nextStart=entry.position+incoming*0.065;
 var nextDir=normalize(incoming);
 var transmission=vec3f(0.0);
 var reflectedWeight=vec3f(1.0);
 var travel=0.0;
 let maxBounces=u32(clamp(cfgAmoeba.trace.z,0.0,3.0));
 let absorption=vec3f(0.12,0.070,0.039)*cfgAmoeba.shape.w;
 for(var bounceIndex:u32=0u;bounceIndex<4u;bounceIndex++){
  if(bounceIndex>maxBounces){break;}
  let exitHit=marchInterior(nextStart,nextDir);
  if(!exitHit.found){
   transmission+=reflectedWeight*original*0.5;
   break;
  }
  let exitNormal=bodyNormal(exitHit.position);
  travel+=exitHit.lengthTravel;
  reflectedWeight*=exp(-absorption*exitHit.lengthTravel);
  let outDir=refract(nextDir,-exitNormal,ior);
  let exitFresnel=glassFresnel(dot(nextDir,exitNormal),ior);
  if(length(outDir)>0.01){
   let advanced=exitHit.position+normalize(outDir)*17.0;
   let refractedUV=projectUV(advanced);
   let displacedColor=screenSample(refractedUV);
   transmission+=reflectedWeight*displacedColor*(1.0-exitFresnel);
  }
  if(bounceIndex==maxBounces){
   transmission+=reflectedWeight*exitFresnel*skyLight(reflect(nextDir,exitNormal));
   break;
  }
  reflectedWeight*=exitFresnel;
  nextDir=normalize(reflect(nextDir,exitNormal));
  nextStart=exitHit.position+nextDir*0.07;
 }
 let shapeGlow=vec3f(0.12,0.55,0.65)*cfgAmoeba.style.x*(0.16+0.13*travel);
 let streak=max(0.0,dot(outsideNormal,normalize(vec3f(-0.6,0.85,0.4))));
 let rim=pow(1.0-max(dot(-viewDir,outsideNormal),0.0),2.7);
 let glint=pow(streak,22.0)*0.20+rim*0.22;
 let combined=transmission*(1.0-entryFresnel)+reflected*entryFresnel+shapeGlow+
  vec3f(0.42,0.83,0.95)*glint;
 let glass=mix(original,combined,clamp(cfgAmoeba.style.y,0.0,1.0));
 return vec4f(clamp(glass,vec3f(0.0),vec3f(1.0)),1.0);
}
`;
