struct SceneUniform {
 dims:vec4<f32>,       // width height time aspect
 cameraPos:vec4<f32>,  // origin xyz, projection focal
 camRight:vec4<f32>,   // xyz, hueA
 camUp:vec4<f32>,      // xyz, hueB
 camForward:vec4<f32>, // xyz, saturation
 fog:vec4<f32>,        // opacity, softness, turbulence noise, wisp
 volume:vec4<f32>,     // core strength, light intensity, light angle, impact glow
 glass:vec4<f32>,      // glass opacity, tint, phase ratio, particle count
};
struct SmokeBody{ centerRadius:vec4<f32>, velocityDensity:vec4<f32>, extra:vec4<f32>, };
@group(0) @binding(0) var<uniform> cfg:SceneUniform;
@group(0) @binding(1) var<storage,read> bodies:array<SmokeBody,192>;
struct QuadOut {
 @builtin(position) pos:vec4<f32>,
 @location(0) uv:vec2<f32>,
 @location(1) world:vec3<f32>,
 @location(2) density:f32,
 @location(3) phase:f32,
 @location(4) seed:f32,
 @location(5) energy:f32,
};
struct ScreenOut{@builtin(position) pos:vec4<f32>,@location(0) uv:vec2<f32>,};
fn tileCorner(k:u32)->vec2<f32>{
 var corners=array<vec2<f32>,6>(
 vec2<f32>(-1.0,-1.0),vec2<f32>(1.0,-1.0),vec2<f32>(-1.0,1.0),
 vec2<f32>(-1.0,1.0),vec2<f32>(1.0,-1.0),vec2<f32>(1.0,1.0));
 return corners[k];
}
@vertex fn quadVertex(@builtin(vertex_index) vertexId:u32,@builtin(instance_index) instanceId:u32)->QuadOut{
 let p=bodies[instanceId];
 let coord=tileCorner(vertexId);
 let radius=p.centerRadius.w*(1.5+cfg.fog.y*.55);
 let world=p.centerRadius.xyz+(cfg.camRight.xyz*coord.x+cfg.camUp.xyz*coord.y)*radius;
 let relative=world-cfg.cameraPos.xyz;
 let depth=max(.03,dot(relative,cfg.camForward.xyz));
 var result:QuadOut;
 result.pos=vec4<f32>(
  dot(relative,cfg.camRight.xyz)*cfg.cameraPos.w/max(.01,depth*cfg.dims.w),
  dot(relative,cfg.camUp.xyz)*cfg.cameraPos.w/depth,.5,1.0
 );
 result.uv=coord;result.world=world;
 result.density=p.velocityDensity.w;
 result.phase=p.extra.x;result.seed=p.extra.y;result.energy=p.extra.z;
 return result;
}
@vertex fn screenVertex(@builtin(vertex_index) idx:u32)->ScreenOut{
 var corners=array<vec2<f32>,3>(vec2<f32>(-1.0,-3.0),vec2<f32>(-1.0,1.0),vec2<f32>(3.0,1.0));
 let pos=corners[idx];var out:ScreenOut;out.pos=vec4<f32>(pos,0.0,1.0);out.uv=pos*.5+vec2<f32>(.5);return out;
}
fn directionFromUv(uv:vec2<f32>)->vec3<f32>{
 let pos=(uv*2.0-1.0)*vec2<f32>(cfg.dims.w,1.0);
 return normalize(cfg.camRight.xyz*pos.x+cfg.camUp.xyz*pos.y+cfg.camForward.xyz*cfg.cameraPos.w);
}
fn hitGlobe(origin:vec3<f32>,direction:vec3<f32>)->vec2<f32>{
 let b=dot(origin,direction);
 let c=dot(origin,origin)-1.0;
 let discr=b*b-c;
 if(discr<=0.0){return vec2<f32>(1e4,-1e4);}
 let h=sqrt(discr);return vec2<f32>(-b-h,-b+h);
}
fn colorPhase(value:f32)->vec3<f32>{
 let hue=select(cfg.camRight.w,cfg.camUp.w,value>.5);
 let angle=hue*6.2831853;
 let rainbow=vec3<f32>(.55)+vec3<f32>(.45)*cos(vec3<f32>(angle,angle+2.094395,angle+4.18879));
 return mix(vec3<f32>(.69,.81,.94),rainbow,cfg.camForward.w);
}
@fragment fn backdrop(input:ScreenOut)->@location(0) vec4<f32>{
 let ray=directionFromUv(input.uv);
 let sky=mix(vec3<f32>(.005,.010,.028),vec3<f32>(.015,.055,.078),clamp(ray.y*.5+.5,0.0,1.0));
 var shade=sky;
 let crossing=hitGlobe(cfg.cameraPos.xyz,ray);
 if(crossing.y>crossing.x){
  let front=cfg.cameraPos.xyz+ray*crossing.x;
  let normal=normalize(front);
  let factor=pow(1.0-max(0.0,dot(normal,-ray)),3.4);
  shade+=mix(vec3<f32>(.008,.019,.03),vec3<f32>(.028,.080,.10),factor);
  shade+=vec3<f32>(.024,.076,.12)*pow(1.0-abs(normal.y),5.0);
 }return vec4<f32>(shade,1.0);
}
@fragment fn smoke(input:QuadOut)->@location(0) vec4<f32>{
 if(dot(input.world,input.world)>1.005*1.005){discard;}
 let r2=dot(input.uv,input.uv);
 if(r2>1.94){discard;}
 let time=cfg.dims.z;let phase=input.seed;
 let turbulence=sin(input.uv.x*7.9+phase+time*.51)*sin(input.uv.y*6.1-phase+time*.37);
 let fine=sin(input.uv.x*17.8+input.uv.y*11.2+phase*1.4-time*.42);
 let wisp=sin(input.uv.x*10.2-input.uv.y*4.1+phase+time*.24);
 let contour=max(0.0,r2+cfg.fog.z*(turbulence*.19+fine*.06)+cfg.fog.w*wisp*.10);
 let cloud=exp(-contour*(1.5+cfg.fog.y*.75));
 let edge=1.0-smoothstep(.56,1.64,contour);
 let alpha=clamp(cfg.fog.x*input.density*cloud*edge*(.85+.15*turbulence),0.0,.78);
 if(alpha<.001){discard;}
 let localNormal=normalize(vec3<f32>(input.uv.x,input.uv.y,sqrt(max(.03,1.0-r2*.62))));
 let light=normalize(vec3<f32>(sin(cfg.volume.z),.65,cos(cfg.volume.z)));
 let diff=max(0.0,dot(localNormal,light));
 let forward=pow(max(0.0,dot(light,localNormal)),6.0);
 let core=exp(-r2*6.0)*cfg.volume.x;
 let tint=colorPhase(input.phase);
 let shimmer=input.energy*cfg.volume.w*.45;
 let edgeTint=mix(vec3<f32>(.26,.48,.65),tint,.7+diff*.3);
 let rgb=edgeTint*(.35+diff*.72+forward*.12+core*.50)*cfg.volume.y
    +tint*shimmer+vec3<f32>(.11,.18,.21)*fine*.15;
 return vec4<f32>(max(rgb,vec3<f32>(0.0))*alpha,alpha);
}
@fragment fn glassFront(input:ScreenOut)->@location(0) vec4<f32>{
 let ray=directionFromUv(input.uv);let crossing=hitGlobe(cfg.cameraPos.xyz,ray);
 if(crossing.y<=crossing.x){return vec4<f32>(0.0);}
 let pt=cfg.cameraPos.xyz+ray*crossing.x;
 let normal=normalize(pt);
 let facing=max(0.0,dot(normal,-ray));
 let fresnel=pow(1.0-facing,5.0);
 let gleam=pow(max(0.0,dot(reflect(-ray,normal),normalize(vec3<f32>(-.4,.78,1.0)))),28.0);
 let rim=pow(1.0-facing,9.0);
 let transparency=clamp((fresnel*.50+gleam*.22+rim*.30+.006)*cfg.glass.x,0.0,.78);
 let tint=mix(vec3<f32>(.26,.72,.82),vec3<f32>(.48,.70,1.0),cfg.glass.y);
 return vec4<f32>(tint*transparency,transparency);
}
