// WebGPU fragment ray tracing: spherical glass, refracted Gaussian smoke, Fresnel shell.
struct Params {
 scene:vec4<f32>,       // container radius, smoke count, ball count, diagnostic mode
 optics:vec4<f32>,      // IOR, dispersion, reflectivity, gloss
 haze:vec4<f32>,        // density, opacity, shell opacity, bloom
 eye:vec4<f32>,         // camera position xyz, FOV scale
 right:vec4<f32>,
 up:vec4<f32>,
 forward:vec4<f32>,
 tint:vec4<f32>,
 viewport:vec4<f32>,    // render dimensions, time, unused
};
struct SmokeParticle { pointSize:vec4<f32>, densityAge:vec4<f32> };
struct GlassBall { pointRadius:vec4<f32>, velocity:vec4<f32> };
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var<storage,read> particles:array<SmokeParticle>;
@group(0) @binding(2) var<storage,read> marbles:array<GlassBall>;

struct VertexOut{ @builtin(position) position:vec4<f32> };
@vertex fn vs_main(@builtin(vertex_index) vertexIndex:u32)->VertexOut {
 var points=array<vec2<f32>,3>(vec2<f32>(-1.,-1.),vec2<f32>(3.,-1.),vec2<f32>(-1.,3.));
 var output:VertexOut;output.position=vec4<f32>(points[vertexIndex],0.,1.);return output;
}
fn intersection(eyePos:vec3<f32>,viewDir:vec3<f32>,center:vec3<f32>,radius:f32)->vec2<f32>{
 let oc=eyePos-center;let bb=dot(oc,viewDir);let cc=dot(oc,oc)-radius*radius;
 let disc=bb*bb-cc;
 if(disc<0.){return vec2<f32>(-1.,-1.);}
 let root=sqrt(disc);return vec2<f32>(-bb-root,-bb+root);
}
fn environment(viewDir:vec3<f32>)->vec3<f32>{
 let sky=clamp(viewDir.y*.65+.5,0.,1.);
 let base=mix(vec3<f32>(.009,.015,.041),vec3<f32>(.041,.085,.136),sky);
 let glimmer=pow(max(0.,dot(viewDir,normalize(vec3<f32>(-.53,.71,.51)))),90.);
 let cool=pow(max(0.,dot(viewDir,normalize(vec3<f32>(.4,.1,-.9)))),150.);
 return base+vec3<f32>(.17,.36,.56)*glimmer+vec3<f32>(.23,.11,.42)*cool;
}
fn smokeIntegral(origin:vec3<f32>,direction:vec3<f32>,startDistance:f32,endDistance:f32)->vec4<f32>{
 if(endDistance<=startDistance){return vec4<f32>(0.);}
 var opticalDepth=0.;var lighting=vec3<f32>(0.);
 let maxCount=min(u32(cfg.scene.y),arrayLength(&particles));
 for(var index=0u;index<maxCount;index++){
  let p=particles[index];
  let d=p.pointSize.xyz-origin;
  let projected=dot(d,direction);
  let closest=clamp(projected,startDistance,endDistance);
  let perpendicular=d-direction*closest;
  let width=max(.015,p.pointSize.w*(1.+cfg.haze.x*.04));
  let sq=dot(perpendicular,perpendicular)/(width*width);
  if(sq>12.){continue;}
  // Analytic screen-space Gaussian column density in world 3D.
  let segment=min(1.,(endDistance-startDistance)/(width*2.));
  let cut=exp(-sq*1.8)*segment;
  let irregular=.78+.22*sin(dot(p.pointSize.xyz,vec3<f32>(13.9,7.1,11.3))+cfg.viewport.z*1.6+sq*2.1);
  let ageFade=clamp(p.densityAge.y,0.,1.);
  let opacity=cut*p.densityAge.x*irregular*(.35+.65*ageFade)*cfg.haze.x*cfg.haze.y*.31;
  opticalDepth+=opacity;
  let illumination=.44+.56*clamp(p.pointSize.y/cfg.scene.x*.5+.5,0.,1.);
  lighting+=cfg.tint.xyz*opacity*illumination;
 }
 let alpha=1.-exp(-opticalDepth);
 let albedo=lighting/max(.0001,opticalDepth);
 return vec4<f32>(albedo,alpha);
}
fn compositeHaze(backdrop:vec3<f32>,haze:vec4<f32>)->vec3<f32>{
 return mix(backdrop,haze.xyz*1.85+vec3<f32>(.02,.034,.051),haze.w);
}
fn schlick(nDotV:f32,ior:f32)->f32{
 let base=pow((1.-ior)/(1.+ior),2.);
 return base+(1.-base)*pow(1.-clamp(nDotV,0.,1.),5.);
}
fn lightSpec(normal:vec3<f32>,viewDir:vec3<f32>)->vec3<f32>{
 let lightDir=normalize(vec3<f32>(-.54,.82,1.));
 let halfDir=normalize(lightDir-viewDir);
 let power=mix(30.,160.,cfg.optics.w);
 let bright=pow(max(0.,dot(normal,halfDir)),power);
 let broad=pow(max(0.,dot(normal,halfDir)),12.)*.095;
 return vec3<f32>(.86,.96,1.)*(bright*1.8+broad)*(1.+cfg.haze.w*.8);
}
@fragment fn fs_main(@builtin(position) fragmentPos:vec4<f32>)->@location(0) vec4<f32>{
 let uv=(fragmentPos.xy/cfg.viewport.xy)*2.-vec2<f32>(1.,1.);
 let aspect=cfg.viewport.x/cfg.viewport.y;
 let viewDir=normalize(cfg.forward.xyz+cfg.right.xyz*uv.x*aspect*cfg.eye.w-cfg.up.xyz*uv.y*cfg.eye.w);
 let origin=cfg.eye.xyz;
 var color=environment(viewDir);
 let background=color;
 let shellHit=intersection(origin,viewDir,vec3<f32>(0.),cfg.scene.x);
 if(shellHit.y<=max(0.,shellHit.x)){return vec4<f32>(color,1.);}
 let entry=max(.0,shellHit.x+.003);let exitDistance=shellHit.y-.003;
 let mode=i32(cfg.scene.w+.5);
 let frontPoint=origin+viewDir*shellHit.x;
 let outerNormal=normalize(frontPoint);
 let outerFresnel=schlick(max(0.,-dot(viewDir,outerNormal)),1.47);
 // Nearest refracting marble (exact 3D ray / sphere intersection).
 var chosen:i32=-1;var firstDistance=exitDistance;var selectedRadius=0.;var selectedCenter=vec3<f32>(0.);
 if(mode==0||mode==3){
  let marbleCount=min(u32(cfg.scene.z),arrayLength(&marbles));
  for(var index=0u;index<marbleCount;index++){
   let marble=marbles[index];let hit=intersection(origin,viewDir,marble.pointRadius.xyz,marble.pointRadius.w);
   if(hit.x>entry&&hit.x<firstDistance&&hit.y>hit.x){chosen=i32(index);firstDistance=hit.x;selectedCenter=marble.pointRadius.xyz;selectedRadius=marble.pointRadius.w;}
  }
 }
 if(mode==0||mode==2){
  let firstPart=smokeIntegral(origin,viewDir,entry,select(exitDistance,firstDistance,chosen>=0));
  color=compositeHaze(color,firstPart);
 }
 if(chosen>=0){
  let entryPoint=origin+viewDir*firstDistance;let normal=normalize(entryPoint-selectedCenter);
  let ior=max(1.001,cfg.optics.x);
  var insideDir=refract(viewDir,normal,1./ior);
  if(length(insideDir)<.05){insideDir=reflect(viewDir,normal);}
  let innerPoint=entryPoint+insideDir*.0007;
  let traversal=intersection(innerPoint,insideDir,selectedCenter,selectedRadius);
  let exitPoint=innerPoint+insideDir*max(.0001,traversal.y);
  let exitNormal=normalize(exitPoint-selectedCenter);
  var refracted=refract(insideDir,-exitNormal,ior);
  if(length(refracted)<.05){refracted=reflect(insideDir,exitNormal);}
  refracted=normalize(refracted);
  let exterior=exitPoint+refracted*.003;
  let path=intersection(exterior,refracted,vec3<f32>(0.),cfg.scene.x);
  let viewWorld=environment(refracted);
  var transmitted=viewWorld;
  if(mode==0&&path.y>.0){
   let throughHaze=smokeIntegral(exterior,refracted,0.,path.y);
   transmitted=compositeHaze(transmitted,throughHaze);
   if(cfg.optics.y>.002){
    let sideways=normalize(cross(exitNormal,refracted)+vec3<f32>(.0001));
    let chromatic=normalize(refracted+sideways*cfg.optics.y*.11);
    let colorRay=intersection(exterior,chromatic,vec3<f32>(0.),cfg.scene.x);
    let shifted=compositeHaze(environment(chromatic),smokeIntegral(exterior,chromatic,0.,max(0.,colorRay.y)));
    transmitted=vec3<f32>(shifted.r,transmitted.g,transmitted.b);
   }
  }
  let fresnel=schlick(max(0.,-dot(viewDir,normal)),ior);
  let reflectColor=environment(reflect(viewDir,normal));
  let tint=vec3<f32>(.91,.975,1.);
  let pathLength=length(exitPoint-entryPoint);
  transmitted*=exp(-pathLength*vec3<f32>(.10,.037,.024));
  let spec=lightSpec(normal,viewDir)+lightSpec(exitNormal,refracted)*.13;
  var glassColor=mix(transmitted*tint,reflectColor,clamp(fresnel*cfg.optics.z+.025,0.,.95))+spec;
  let edge=pow(1.-max(0.,-dot(viewDir,normal)),2.);
  glassColor+=vec3<f32>(.08,.25,.35)*edge*.6*cfg.optics.z;
  // The smoke in front of the marble remains in front of the refracted surface.
  if(mode==0){
   let foreground=smokeIntegral(origin,viewDir,entry,firstDistance);
   color=compositeHaze(glassColor,foreground);
  }else{color=glassColor;}
 }
 // Physical shell, with view-dependent transparent reflection/refraction.
 if(mode==0 || mode==1){
  let bend=normalize(refract(viewDir,outerNormal,1./1.46)+vec3<f32>(.000001));
  let reflected=environment(reflect(viewDir,outerNormal));
  let shellAlpha=clamp(cfg.haze.z*(outerFresnel*.72+.055),0.,.85);
  color=mix(color,reflected+vec3<f32>(.018,.10,.15),shellAlpha);
  color+=lightSpec(outerNormal,viewDir)*cfg.haze.z*.78;
  let rim=pow(1.-max(0.,-dot(viewDir,outerNormal)),3.);
  color+=vec3<f32>(.10,.30,.48)*rim*cfg.haze.z*.38;
  color+=environment(bend)*outerFresnel*.12*cfg.haze.z;
 }
 // Mild post exposure and highlight bloom approximation.
 color=1.-exp(-color*vec3<f32>(1.08,1.04,1.));
 color+=max(color-vec3<f32>(.66),vec3<f32>(0.))*cfg.haze.w*.18;
 return vec4<f32>(clamp(color,vec3<f32>(0.),vec3<f32>(1.)),1.);
}
