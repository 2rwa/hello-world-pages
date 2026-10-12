export function renderWGSL(grid) { return /* wgsl */ `
const GRID:u32=${grid}u;
const PI:f32=3.14159265;
const tiles=array<f32,5>(2003.0,433.0,97.0,23.3,5.3);
struct Params {viewProj:mat4x4f,sim:vec4f,boat:vec4f,prior:vec4f,extra:vec4f,eye:vec4f};
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var dispTex:texture_2d_array<f32>;
@group(0) @binding(2) var normalTex:texture_2d_array<f32>;
@group(0) @binding(3) var foamNear:texture_2d<f32>;
@group(0) @binding(4) var foamFar:texture_2d<f32>;
@group(0) @binding(5) var linearSampler:sampler;
struct OceanVary { @builtin(position) pos:vec4f,@location(0) world:vec3f,@location(1) distance:f32 };
fn oceanDisp(worldXZ:vec2f)->vec3f{
 var total=vec3f(0.0);
 for(var layer:i32=0;layer<3;layer++){
  let displacement=textureSampleLevel(dispTex,linearSampler,fract(worldXZ/tiles[layer]),layer,0.0).xyz;
  total+=displacement;
 }
 return total;
}
@vertex fn vertexOcean(@builtin(vertex_index) vertexId:u32)->OceanVary {
 let cellId=vertexId/6u;
 let localId=vertexId%6u;
 let col=cellId%(GRID-1u);
 let row=cellId/(GRID-1u);
 let offsets=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
 let uv=(vec2f(f32(col),f32(row))+offsets[localId])/f32(GRID-1u);
 let centered=uv*2.0-1.0;
 let signedCurve=sign(centered)*pow(abs(centered),vec2f(1.8));
 let baseXZ=cfg.boat.xz+signedCurve*2400.0;
 let displacement=oceanDisp(baseXZ);
 let worldXZ=baseXZ+displacement.yz*0.85;
 let pos=vec3f(worldXZ.x,displacement.x,worldXZ.y);
 var output:OceanVary;
 output.world=pos;
 output.distance=length(baseXZ-cfg.boat.xz);
 output.pos=cfg.viewProj*vec4f(pos,1.0);
 return output;
}
fn hash2d(pixel:vec2f)->f32{
 return fract(sin(dot(pixel,vec2f(127.1,311.7)))*43758.5453);
}
fn noise2d(worldCoord:vec2f)->f32{
 let block=floor(worldCoord);
 let fractCoord=fract(worldCoord);
 let eased=fractCoord*fractCoord*(3.0-2.0*fractCoord);
 let a=hash2d(block);
 let b=hash2d(block+vec2f(1.0,0.0));
 let c=hash2d(block+vec2f(0.0,1.0));
 let d=hash2d(block+vec2f(1.0,1.0));
 return mix(mix(a,b,eased.x),mix(c,d,eased.x),eased.y);
}
fn cloudNoise(worldCoord:vec2f)->f32{
 return noise2d(worldCoord)*0.56+noise2d(worldCoord*2.17)*0.29+noise2d(worldCoord*4.33)*0.15;
}
fn sunDirection()->vec3f{
 let altitude=clamp(cfg.extra.y,0.06,1.42);
 return normalize(vec3f(-0.78*cos(altitude),sin(altitude),0.62*cos(altitude)));
}
fn sunIlluminance()->f32{
 return clamp(sin(cfg.extra.y)*1.7+0.18,0.08,1.25);
}
fn skyColor(direction:vec3f)->vec3f{
 let skyDir=normalize(direction);
 let altitude=clamp(skyDir.y,-0.04,1.0);
 let haze=clamp(cfg.extra.z*0.33,0.13,0.85);
 let horizon=vec3f(0.43,0.65,0.81)+vec3f(0.14,0.11,0.04)*haze;
 let upper=vec3f(0.045,0.18,0.37);
 var radiance=mix(horizon,upper,pow(max(0.0,altitude),0.52));
 let sunDir=sunDirection();
 let sunProximity=max(0.0,dot(skyDir,sunDir));
 let warm=vec3f(1.0,0.58,0.30);
 let solarAltitude=clamp(sunDir.y*1.6,0.0,1.0);
 radiance+=warm*pow(sunProximity,24.0)*(0.16+0.4*(1.0-solarAltitude));
 let cloudUV=skyDir.xz/max(0.075,abs(skyDir.y))*0.22+vec2f(cfg.sim.x*0.0009,0.0);
 let cloud=cloudNoise(cloudUV);
 let cloudDensity=smoothstep(0.56,0.70,cloud)*smoothstep(0.05,0.23,skyDir.y);
 let litCloud=vec3f(0.72,0.75,0.76)*(0.28+0.72*solarAltitude);
 radiance=mix(radiance,litCloud,cloudDensity*0.66);
 radiance+=vec3f(1.0,0.82,0.53)*pow(sunProximity,5000.0)*12.0*sunIlluminance();
 return max(radiance,vec3f(0.0));
}
fn toneMap(linear:vec3f)->vec3f{
 let safeColor=max(linear,vec3f(0.0));
 let mapped=(safeColor*(2.51*safeColor+0.03))/(safeColor*(2.43*safeColor+0.59)+0.14);
 return pow(clamp(mapped,vec3f(0.0),vec3f(1.0)),vec3f(1.0/2.2));
}
@fragment fn fragmentOcean(input:OceanVary)->@location(0) vec4f{
 let xz=input.world.xz;
 let toEye=normalize(cfg.eye.xyz-input.world);
 let cameraDist=max(0.01,input.distance);
 var gradient=vec2f(0.0);
 var meanSquare=0.0;
 var jacobian=1.0;
 for(var band:i32=0;band<5;band++){
  let metersPerSample=tiles[band]/cfg.eye.w;
  let footprint=max(0.10,cameraDist*0.0016);
  let mipLevel=clamp(log2(max(1.0,footprint/metersPerSample)),0.0,log2(cfg.eye.w));
  let waveStats=textureSampleLevel(normalTex,linearSampler,fract(xz/tiles[band]),band,mipLevel);
  gradient+=waveStats.xy;
  meanSquare+=waveStats.z;
  jacobian=min(jacobian,waveStats.w);
 }
 // Fade subpixel ripples before they alias into harsh specular glitter.
 let smallScaleFade=1.0-smoothstep(55.0,720.0,cameraDist);
 let rippleX=0.022*sin(xz.x*2.4+xz.y*0.8+cfg.sim.x*2.8);
 let rippleZ=0.021*cos(xz.y*2.1-xz.x*0.6+cfg.sim.x*2.5);
 gradient+=vec2f(rippleX,rippleZ)*smallScaleFade;
 let oceanNormal=normalize(vec3f(-gradient.x,1.0,-gradient.y));
 let nDotV=clamp(dot(oceanNormal,toEye),0.0,1.0);
 let reflected=reflect(-toEye,oceanNormal);
 let roughness=clamp(0.045+sqrt(max(0.0,meanSquare))*0.17+cameraDist*0.000014,0.055,0.55);
 let waterReflection=mix(skyColor(reflected),skyColor(reflect(-toEye,vec3f(0.0,1.0,0.0))),roughness*0.52);
 let fresnel=0.02+(1.0-0.02)*pow(1.0-nDotV,5.0);
 // A simplified IOP model. Absorption a and backscatter b_b determine body color.
 let turbidity=clamp(cfg.extra.z,0.1,3.0);
 let absorption=vec3f(0.42,0.095,0.038)+vec3f(0.025,0.018,0.012)*turbidity;
 let backscatter=vec3f(0.004,0.019,0.040)*turbidity;
 let subsurface=backscatter/(absorption+backscatter)*vec3f(1.4,1.4,1.65);
 let diffuseLight=0.30+0.7*sunIlluminance();
 var radiance=mix(subsurface*diffuseLight,waterReflection,clamp(fresnel+0.065,0.0,1.0));
 let sunDir=sunDirection();
 let halfDirection=normalize(toEye+sunDir);
 let nDotH=max(0.0,dot(oceanNormal,halfDirection));
 let sunGlitter=pow(nDotH,max(12.0,1.7/(roughness*roughness)))* (0.3+roughness*0.5);
 radiance+=vec3f(1.0,0.87,0.69)*sunGlitter*4.8*sunIlluminance();
 // Large cloud-shadow field is anchored to the world, moving with the wind.
 let shadowCloud=cloudNoise(xz*0.0011+vec2f(cfg.sim.x*0.003,0.0));
 radiance*=1.0-0.21*smoothstep(0.52,0.7,shadowCloud);
 let nearUV=(xz-cfg.boat.xz)/420.0+0.5;
 let farUV=(xz-cfg.boat.xz)/3200.0+0.5;
 var closeFoam=vec4f(0.0);
 var distantFoam=vec4f(0.0);
 if(all(nearUV>=vec2f(0.0))&&all(nearUV<=vec2f(1.0))){
  closeFoam=textureSampleLevel(foamNear,linearSampler,nearUV,0.0);
 }
 if(all(farUV>=vec2f(0.0))&&all(farUV<=vec2f(1.0))){
  distantFoam=textureSampleLevel(foamFar,linearSampler,farUV,0.0);
 }
 let foamState=mix(distantFoam,closeFoam,1.0-smoothstep(145.0,205.0,cameraDist));
 let crestMask=(1.0-smoothstep(0.25,0.73,jacobian))*0.22*cfg.extra.x;
 let smallFoamNoise=noise2d(xz*0.73+vec2f(cfg.sim.x*0.065,-cfg.sim.x*0.09));
 let mediumFoamNoise=cloudNoise(xz*0.083);
 let filaments=0.5+0.5*sin(xz.x*0.62+sin(xz.y*0.13)*2.7)*sin(xz.y*0.43);
 let lace=mix(mediumFoamNoise,smallFoamNoise*0.54+filaments*0.46,1.0-smoothstep(90.0,680.0,cameraDist));
 let foamCoverage=clamp((foamState.x*1.28+crestMask)*(0.47+lace*0.85)+foamState.z*0.22,0.0,0.94);
 let foamColor=mix(vec3f(0.48,0.67,0.72),vec3f(0.92,0.96,0.96),clamp(foamState.y*0.55+0.45,0.0,1.0));
 radiance=mix(radiance,foamColor*sunIlluminance()+foamColor*0.18,foamCoverage);
 radiance*=1.0-foamState.w*0.16;
 // Visibility modes: 0 beauty, 1 slope normal, 2 foam channels, 3 roughness / crest.
 let mode=i32(cfg.prior.x+0.5);
 if(mode==1){return vec4f(oceanNormal*0.5+0.5,1.0);}
 if(mode==2){return vec4f(clamp(vec3f(foamCoverage,foamState.y,foamState.w),vec3f(0.0),vec3f(1.0)),1.0);}
 if(mode==3){return vec4f(roughness,1.0-clamp(jacobian,0.0,1.0),foamCoverage,1.0);}
 return vec4f(toneMap(radiance),1.0);
}
struct SkyVary {@builtin(position) pos:vec4f,@location(0) uv:vec2f};
@vertex fn vertexSky(@builtin(vertex_index) vid:u32)->SkyVary {
 let uv=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0))[vid];
 var output:SkyVary;
 output.pos=vec4f(uv,0.99999,1.0);
 output.uv=uv;
 return output;
}
@fragment fn fragmentSky(input:SkyVary)->@location(0) vec4f{
 let forward=normalize(cfg.boat.xyz-cfg.eye.xyz);
 let right=normalize(cross(forward,vec3f(0.0,1.0,0.0)));
 let upper=cross(right,forward);
 let skyDirection=normalize(forward+right*(input.uv.x*cfg.extra.w*0.54)+upper*(input.uv.y*0.54));
 return vec4f(toneMap(skyColor(skyDirection)),1.0);
}
struct BallVary {@builtin(position) pos:vec4f,@location(0) normal:vec3f,@location(1) world:vec3f};
@vertex fn vertexBall(@builtin(vertex_index) vid:u32)->BallVary{
 let cell=vid/6u;
 let idx=vid%6u;
 let segments:u32=40u;
 let rings:u32=24u;
 let cx=cell%segments;
 let cy=cell/segments;
 let offsets=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
 let uv=(vec2f(f32(cx),f32(cy))+offsets[idx])/vec2f(f32(segments),f32(rings));
 let az=uv.x*PI*2.0;
 let polar=uv.y*PI;
 let local=vec3f(sin(polar)*cos(az),cos(polar),sin(polar)*sin(az));
 let roll=cfg.prior.y;
 let pitch=cfg.prior.z;
 let rolled=vec3f(local.x*cos(roll)-local.y*sin(roll),local.x*sin(roll)+local.y*cos(roll),local.z);
 let tilted=vec3f(rolled.x,rolled.y*cos(pitch)-rolled.z*sin(pitch),rolled.y*sin(pitch)+rolled.z*cos(pitch));
 let world=cfg.boat.xyz+tilted*cfg.boat.w;
 var output:BallVary;
 output.normal=tilted;output.world=world;output.pos=cfg.viewProj*vec4f(world,1.0);
 return output;
}
@fragment fn fragmentBall(input:BallVary)->@location(0) vec4f{
 let n=normalize(input.normal);
 let sunDir=sunDirection();
 let toEye=normalize(cfg.eye.xyz-input.world);
 let reflected=skyColor(reflect(-toEye,n));
 let fresnel=0.06+0.94*pow(1.0-clamp(dot(n,toEye),0.0,1.0),5.0);
 let stripe=1.0-smoothstep(0.085,0.12,abs(n.y));
 let base=mix(vec3f(0.82,0.22,0.066),vec3f(0.96,0.69,0.22),stripe);
 let shade=0.22+0.72*max(dot(n,sunDir),0.0)*sunIlluminance();
 var color=base*shade+reflected*fresnel*0.37;
 color+=vec3f(1.0)*pow(max(dot(n,normalize(sunDir+toEye)),0.0),125.0)*0.6;
 return vec4f(toneMap(color),1.0);
}
`;}