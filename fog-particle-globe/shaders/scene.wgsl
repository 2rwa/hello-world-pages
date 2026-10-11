struct SceneUniform {
 dimensions:vec4<f32>, // width,height,time,aspect
 right:vec4<f32>,      // camera right, focal
 up:vec4<f32>,         // camera up, shell intensity
 forward:vec4<f32>,    // camera forward, display density
 origin:vec4<f32>,     // camera position, sphere radius
 color:vec4<f32>,      // hue, saturation, variation, illumination
 shape:vec4<f32>,      // opacity, gaussian softness, wisps, noise
 optics:vec4<f32>,     // anisotropy, light azimuth, count, debug
};
struct FogParticle { centerRadius:vec4<f32>, motionOpacity:vec4<f32>, extras:vec4<f32>, };
@group(0) @binding(0) var<uniform> cfg:SceneUniform;
@group(0) @binding(1) var<storage,read> particles:array<FogParticle,2400>;
struct ScreenOut{@builtin(position) pos:vec4<f32>,@location(0) uv:vec2<f32>,};
struct FogOut{
 @builtin(position) pos:vec4<f32>,
 @location(0) localUv:vec2<f32>,
 @location(1) worldPos:vec3<f32>,
 @location(2) opacity:f32,
 @location(3) tintSeed:f32,
 @location(4) phase:f32,
};
fn vertexCorner(idx:u32)->vec2<f32>{
 var corners=array<vec2<f32>,6>(
  vec2<f32>(-1.0,-1.0),vec2<f32>(1.0,-1.0),vec2<f32>(-1.0,1.0),
  vec2<f32>(-1.0,1.0),vec2<f32>(1.0,-1.0),vec2<f32>(1.0,1.0));
 return corners[idx];
}
@vertex fn screenVertex(@builtin(vertex_index) vertexId:u32)->ScreenOut{
 var corners=array<vec2<f32>,3>(vec2<f32>(-1.0,-3.0),vec2<f32>(-1.0,1.0),vec2<f32>(3.0,1.0));
 let v=corners[vertexId];var out:ScreenOut;out.pos=vec4<f32>(v,0.0,1.0);out.uv=v*.5+vec2<f32>(.5);return out;
}
@vertex fn fogVertex(@builtin(vertex_index) vertexId:u32,@builtin(instance_index) instanceId:u32)->FogOut{
 let p=particles[instanceId];
 let corner=vertexCorner(vertexId);
 let radius=p.centerRadius.w*2.3;
 let world=p.centerRadius.xyz+(cfg.right.xyz*corner.x+cfg.up.xyz*corner.y)*radius;
 let relative=world-cfg.origin.xyz;
 let zDepth=max(.05,dot(relative,cfg.forward.xyz));
 let screenX=dot(relative,cfg.right.xyz)*cfg.right.w/(zDepth*cfg.dimensions.w);
 let screenY=dot(relative,cfg.up.xyz)*cfg.right.w/zDepth;
 var result:FogOut;
 result.pos=vec4<f32>(screenX,screenY,.5,1.0);
 result.localUv=corner;
 result.worldPos=world;
 result.opacity=p.motionOpacity.w;
 result.tintSeed=p.extras.x;
 result.phase=p.extras.y;
 return result;
}
fn colorWheel(seed:f32)->vec3<f32>{
 let angle=6.2831853*(cfg.color.x+seed*cfg.color.z);
 let rainbow=vec3<f32>(.5)+.5*cos(vec3<f32>(angle,angle-2.094395,angle+2.094395));
 return mix(vec3<f32>(.70,.85,1.0),rainbow,cfg.color.y);
}
fn viewRay(uv:vec2<f32>)->vec3<f32>{
 let xy=(uv*2.0-1.0)*vec2<f32>(cfg.dimensions.w,1.0);
 return normalize(cfg.right.xyz*xy.x+cfg.up.xyz*xy.y+cfg.forward.xyz*cfg.right.w);
}
fn hitSphere(origin:vec3<f32>,direction:vec3<f32>,radius:f32)->vec2<f32>{
 let b=dot(origin,direction);
 let c=dot(origin,origin)-radius*radius;
 let discriminant=b*b-c;
 if(discriminant<0.0){return vec2<f32>(1e6,-1e6);}
 let root=sqrt(discriminant);
 return vec2<f32>(-b-root,-b+root);
}
@fragment fn backgroundFragment(input:ScreenOut)->@location(0) vec4<f32>{
 let ray=viewRay(input.uv);
 let sky=mix(vec3<f32>(.009,.017,.037),vec3<f32>(.012,.051,.072),clamp(ray.y*.5+.5,0.0,1.0));
 var col=sky+vec3<f32>(.035,.07,.095)*pow(max(0.0,1.0-length(input.uv*2.0-1.0)),3.0);
 let crossing=hitSphere(cfg.origin.xyz,ray,cfg.origin.w);
 if(crossing.y>crossing.x){
  let normal=normalize(cfg.origin.xyz+ray*crossing.x);
  let fresnel=pow(1.0-max(0.0,dot(normal,-ray)),4.0);
  let gradient=.5+.5*normal.y;
  col+=vec3<f32>(.025,.10,.135)*(.25+.75*gradient);
  col+=vec3<f32>(.12,.42,.52)*fresnel*.48*cfg.up.w;
 }
 return vec4<f32>(col,1.0);
}
@fragment fn fogFragment(input:FogOut)->@location(0) vec4<f32>{
 if(dot(input.worldPos,input.worldPos)>.997*.997){discard;}
 let uv=input.localUv;
 let radius2=dot(uv,uv);
 if(radius2>1.95){discard;}
 let timer=cfg.dimensions.z;
 let wave=sin(uv.x*8.4+input.phase+timer*.34)*sin(uv.y*6.7-input.phase+timer*.19);
 let detail=sin(uv.x*22.4+uv.y*14.3+input.phase*1.8-timer*.14);
 let distortion=(wave*.18+detail*.07)*cfg.shape.w;
 let swirl=sin(uv.x*7.0+uv.y*2.9+input.phase+timer*.15)*cfg.shape.z;
 let adjusted=max(0.0,radius2+distortion+swirl*.08);
 let gaussian=exp(-adjusted*(2.5+cfg.shape.y*2.6));
 let cutoff=1.0-smoothstep(.73,1.55,adjusted);
 let jitter=.68+.32*wave+.14*detail;
 let opacity=clamp(cfg.shape.x*input.opacity*cfg.forward.w*gaussian*cutoff*max(.12,jitter),0.0,.55);
 if(opacity<.001){discard;}
 let sun=normalize(vec3<f32>(cos(cfg.optics.y)*.8,.64,sin(cfg.optics.y)*.8));
 let viewAngle=max(-1.0,min(1.0,dot(sun,cfg.forward.xyz)));
 let anisotropy=cfg.optics.x;
 let scattering=(1.0-anisotropy*anisotropy)/
   pow(max(.12,1.0+anisotropy*anisotropy-2.0*anisotropy*viewAngle),1.5);
 let lighting=(.27+.44*clamp(.5+input.worldPos.y*.5,0.0,1.0)+.22*min(4.0,scattering))*cfg.color.w;
 let tint=colorWheel(input.tintSeed);
 let gradient=vec3<f32>(.1,.17,.23)*(1.0-max(.0,input.worldPos.y))*.4;
 let rgb=(tint*lighting+gradient)*opacity;
 return vec4<f32>(rgb,opacity);
}
@fragment fn shellFragment(input:ScreenOut)->@location(0) vec4<f32>{
 let ray=viewRay(input.uv);
 let crossing=hitSphere(cfg.origin.xyz,ray,cfg.origin.w);
 if(crossing.y<=crossing.x){return vec4<f32>(0.0);}
 let entry=cfg.origin.xyz+ray*crossing.x;
 let normal=normalize(entry);
 let facing=max(.0,dot(normal,-ray));
 let rim=pow(1.0-facing,5.4);
 let highlight=pow(max(0.0,dot(reflect(-ray,normal),normalize(vec3<f32>(-.4,.8,1.0)))),18.0);
 let alpha=clamp((rim*.6+highlight*.18+.008)*cfg.up.w,0.0,.85);
 return vec4<f32>(vec3<f32>(.22,.68,.85)*alpha,alpha);
}
