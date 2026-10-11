struct Uniforms{
 dims:vec4<f32>,          // width height time aspect
 camPos:vec4<f32>,        // xyz and focal length
 camRight:vec4<f32>,      // xyz and environment style
 camUp:vec4<f32>,         // xyz and outer shell intensity
 camForward:vec4<f32>,    // xyz and globe hue
 shape:vec4<f32>,         // count, smooth union, surface warp, ior
 optics:vec4<f32>,        // refraction strength, chromatic dispersion, Fresnel, roughness
 material:vec4<f32>,      // glass thickness, hue, saturation, body tint
 lighting:vec4<f32>,      // specular, light angle, environment, rim
 options:vec4<f32>,       // shell tint, shell thickness, glow, view mode
};
struct Blob{centerRadius:vec4<f32>,extras:vec4<f32>,};
@group(0) @binding(0) var<uniform> cfg:Uniforms;
@group(0) @binding(1) var<storage,read> bodies:array<Blob,32>;
struct ScreenOut{@builtin(position) pos:vec4<f32>,@location(0) uv:vec2<f32>,};
@vertex fn vertexMain(@builtin(vertex_index) vid:u32)->ScreenOut{
 var coords=array<vec2<f32>,3>(vec2<f32>(-1.0,-3.0),vec2<f32>(-1.0,1.0),vec2<f32>(3.0,1.0));
 let p=coords[vid];var result:ScreenOut;result.pos=vec4<f32>(p,0.0,1.0);result.uv=p*.5+vec2<f32>(.5);return result;
}
fn rayFor(uv:vec2<f32>)->vec3<f32>{
 let xy=(uv*2.0-1.0)*vec2<f32>(cfg.dims.w,1.0);
 return normalize(cfg.camRight.xyz*xy.x+cfg.camUp.xyz*xy.y+cfg.camForward.xyz*cfg.camPos.w);
}
fn sphereHit(ro:vec3<f32>,rd:vec3<f32>,radius:f32)->vec2<f32>{
 let b=dot(ro,rd);
 let v=b*b-dot(ro,ro)+radius*radius;
 if(v<0.0){return vec2<f32>(1e5,-1e5);}
 let h=sqrt(v);return vec2<f32>(-b-h,-b+h);
}
fn smoothDistance(a:f32,b:f32,k:f32)->f32{
 if(k<=.0001){return min(a,b);}
 let h=max(k-abs(a-b),0.0)/k;
 return min(a,b)-h*h*k*.25;
}
fn field(pos:vec3<f32>)->f32{
 var dist=1e5;
 let n=i32(cfg.shape.x);
 for(var i=0;i<32;i=i+1){
  if(i>=n){break;}
  let blob=bodies[i];
  let center=blob.centerRadius.xyz;
  let radius=blob.centerRadius.w;
  let raw=length(pos-center)-radius;
  dist=smoothDistance(dist,raw,cfg.shape.y);
 }
 let warp=cfg.shape.z;
 if(warp>.0001){
  let t=cfg.dims.z;
  let nr=sin(pos.x*9.1+t*.4)*sin(pos.y*10.8-t*.24)*sin(pos.z*8.7+t*.31);
  dist+=nr*.022*warp;
 }
 return dist;
}
fn fieldNormal(pos:vec3<f32>)->vec3<f32>{
 let h=.005;
 let nx=field(pos+vec3<f32>(h,0.0,0.0))-field(pos-vec3<f32>(h,0.0,0.0));
 let ny=field(pos+vec3<f32>(0.0,h,0.0))-field(pos-vec3<f32>(0.0,h,0.0));
 let nz=field(pos+vec3<f32>(0.0,0.0,h))-field(pos-vec3<f32>(0.0,0.0,h));
 return normalize(vec3<f32>(nx,ny,nz)+vec3<f32>(1e-8));
}
fn traceBlob(ro:vec3<f32>,rd:vec3<f32>,maxTravel:f32)->vec2<f32>{
 var t=0.0;
 // Smooth union and noise are not exact signed distance functions.
 // Use guarded small steps and check the field at each sample.
 for(var i=0;i<76;i=i+1){
  if(t>maxTravel){break;}
  let d=field(ro+rd*t);
  if(d<.0026){return vec2<f32>(t,1.0);}
  t+=clamp(d*.48,.006,.07);
 }
 return vec2<f32>(t,0.0);
}
fn exitBlob(ro:vec3<f32>,rd:vec3<f32>,maxTravel:f32)->vec2<f32>{
 var t=.005;
 for(var i=0;i<70;i=i+1){
  if(t>maxTravel){break;}
  let d=field(ro+rd*t);
  if(d>.003){return vec2<f32>(t,1.0);}
  t+=clamp(abs(d)*.40,.006,.042);
 }
 return vec2<f32>(t,0.0);
}
fn softbox(dir:vec3<f32>,axis:vec3<f32>,power:f32)->f32{
 return pow(max(0.0,dot(dir,normalize(axis))),power);
}
fn environment(dir:vec3<f32>)->vec3<f32>{
 let d=normalize(dir);let style=cfg.camRight.w;
 let v=clamp(.5+.5*d.y,0.0,1.0);
 var col=mix(vec3<f32>(.011,.026,.049),vec3<f32>(.045,.092,.142),v);
 if(style>.5&&style<1.5){col=mix(vec3<f32>(.003,.018,.023),vec3<f32>(.009,.095,.102),v);}
 if(style>=1.5){col=mix(vec3<f32>(.007,.005,.028),vec3<f32>(.055,.026,.089),v);}
 // Large angular softboxes: optical cues for refraction and reflection.
 let boxA=softbox(d,vec3<f32>(-.48,.51,-.72),32.0);
 let boxB=softbox(d,vec3<f32>(.70,.42,.28),66.0);
 let boxC=softbox(d,vec3<f32>(-.12,-.88,.32),29.0);
 col+=vec3<f32>(.92,1.08,1.19)*boxA*.92;
 col+=vec3<f32>(.27,.88,1.1)*boxB*.65;
 col+=vec3<f32>(.80,.39,.25)*boxC*.34;
 // Narrow studio slits and horizon create recognizable warped reflections.
 let slit=pow(max(0.0,cos(atan2(d.x,d.z)*4.0)),52.0);
 col+=vec3<f32>(.17,.25,.38)*slit*.26*(.4+.6*v);
 let horizon=exp(-abs(d.y+.20)*23.0);
 col+=vec3<f32>(.028,.072,.086)*horizon;
 return col*cfg.lighting.z;
}
fn spectralColor(dir:vec3<f32>,normal:vec3<f32>,strength:f32)->vec3<f32>{
 let shifted=normal*cfg.optics.y*.015*strength;
 let base=environment(dir);
 let red=environment(normalize(dir+shifted)).r;
 let blue=environment(normalize(dir-shifted)).b;
 return vec3<f32>(red,base.g,blue);
}
fn glassTint()->vec3<f32>{
 let theta=cfg.material.y*6.2831853;
 let rgb=.5+.5*cos(vec3<f32>(theta,theta-2.094395,theta+2.094395));
 return mix(vec3<f32>(.89,.96,1.0),rgb,cfg.material.z);
}
fn shadeGlass(hit:vec3<f32>,incident:vec3<f32>,maxTravel:f32)->vec3<f32>{
 let normal=fieldNormal(hit);
 let ndv=clamp(dot(normal,-incident),0.0,1.0);
 let ior=max(1.0001,cfg.shape.w);
 let fresnelBase=pow((ior-1.0)/(ior+1.0),2.0);
 let fresnel=clamp((fresnelBase+(1.0-fresnelBase)*pow(1.0-ndv,5.0))*cfg.optics.z,0.0,1.0);
 let reflected=reflect(incident,normal);
 let refractionInput=refract(incident,normal,1.0/ior);
 var through=incident;
 var thickness=.25;
 if(length(refractionInput)>.1){
  let inside=normalize(refractionInput);
  let start=hit+inside*.013;
  let exiting=exitBlob(start,inside,maxTravel);
  thickness=exiting.x;
  if(exiting.y>.5){
   let exitPosition=start+inside*exiting.x;
   let exitNormal=fieldNormal(exitPosition);
   let outgoing=refract(inside,-exitNormal,ior);
   if(length(outgoing)>.05){through=normalize(outgoing);}
   else{through=normalize(reflect(inside,-exitNormal));}
  }else{through=inside;}
 }
 let refracted=spectralColor(through,normal,1.0);
 let baseline=environment(incident);
 let incoming=environment(reflected);
 let strength=cfg.optics.x;
 var transmitted=mix(baseline,refracted,clamp(strength,0.0,1.0));
 if(strength>1.0){transmitted+=max(refracted-baseline,vec3<f32>(0.0))*(strength-1.0);}
 let absorption=exp(-vec3<f32>(.22,.09,.045)*thickness*cfg.material.x);
 let tint=glassTint();
 transmitted*=mix(vec3<f32>(1.0),tint,.50*cfg.material.w)*absorption;
 let lightDir=normalize(vec3<f32>(cos(cfg.lighting.y)*.80,.69,sin(cfg.lighting.y)*.8));
 let specular=pow(max(0.0,dot(reflect(-lightDir,normal),-incident)),mix(120.0,19.0,cfg.optics.w));
 let rim=pow(1.0-ndv,2.4);
 var body= mix(transmitted,incoming,fresnel)+vec3<f32>(1.0,.97,.90)*specular*.7*cfg.lighting.x;
 body+=mix(vec3<f32>(.10,.43,.61),tint,.4)*rim*.47*cfg.lighting.x;
 // Fresnel edge tint is deliberately brighter than neutral transmission:
 // it lets overlapping transparent lobes remain recognizable.
 body+=mix(vec3<f32>(.12,.27,.32),tint,.76)*(.033+.21*rim)*cfg.material.w;
 let broadGlint=pow(max(0.0,dot(reflect(-lightDir,normal),-incident)),33.0);
 body+=vec3<f32>(.74,.94,1.05)*broadGlint*.48*cfg.lighting.x;
 return body;
}
fn outerShell(viewDir:vec3<f32>,entry:vec3<f32>,under:vec3<f32>)->vec3<f32>{
 let normal=normalize(entry);
 let ndv=max(0.0,dot(normal,-viewDir));
 let edge=pow(1.0-ndv,4.9);
 let thin=pow(1.0-ndv,13.0);
 let lightDir=normalize(vec3<f32>(-.57,.61,.55));
 let streak=pow(max(0.0,dot(reflect(-lightDir,normal),-viewDir)),83.0);
 let frontReflect=environment(reflect(viewDir,normal));
 let shellAlpha=clamp(cfg.camUp.w*(edge*.42+thin*.26+streak*.24+.008),0.0,.9);
 let edgeTint=mix(vec3<f32>(.20,.68,.73),vec3<f32>(.37,.58,.99),cfg.options.x);
 let added=edgeTint*(edge*.27+thin*.20)*cfg.lighting.w;
 return mix(under,frontReflect,shellAlpha*.67)+added+vec3<f32>(1.0)*streak*.18*cfg.camUp.w;
}
@fragment fn fragmentMain(input:ScreenOut)->@location(0) vec4<f32>{
 let ray=rayFor(input.uv);
 var color=environment(ray);
 let hit=sphereHit(cfg.camPos.xyz,ray,1.0);
 if(hit.y<=hit.x||hit.y<=0.0){return vec4<f32>(color,1.0);}
 let front=cfg.camPos.xyz+ray*max(hit.x,0.0);
 let innerStart=front+ray*.012;
 let crossing=sphereHit(innerStart,ray,.98);
 if(crossing.y>0.0){
  let surface=traceBlob(innerStart,ray,max(0.0,crossing.y-.02));
  // Inner globe interior is dark enough to reveal transparent refraction.
  color=mix(color,environment(normalize(ray+normalize(front)*.10))*.86+vec3<f32>(.009,.022,.030),.43);
  if(surface.y>.5){
   let pos=innerStart+ray*surface.x;
   if(cfg.options.w>.5&&cfg.options.w<1.5){
    color=fieldNormal(pos)*.5+vec3<f32>(.5);
   }else if(cfg.options.w>=1.5){
    color=vec3<f32>(.20,.57,.82)*(1.0-clamp(surface.x/2.2,0.0,1.0))+.07;
   }else{
    color=shadeGlass(pos,ray,max(0.15,crossing.y-surface.x));
   }
  }
 }
 if(cfg.options.w<.5){color=outerShell(ray,front,color);}
 return vec4<f32>(max(color,vec3<f32>(0.0)),1.0);
}
