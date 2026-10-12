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
 for(var layer:i32=0;layer<5;layer++){
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
fn skyColor(direction:vec3f)->vec3f{
 let heightFactor=clamp(direction.y*0.5+0.5,0.0,1.0);
 let horizon=vec3f(0.76,0.86,0.92);
 let zenith=vec3f(0.07,0.27,0.48);
 var color=mix(horizon,zenith,pow(heightFactor,0.68));
 let sun=normalize(vec3f(-0.35,0.49,0.8));
 let sunDot=max(0.0,dot(direction,sun));
 color+=vec3f(1.0,0.69,0.40)*pow(sunDot,650.0)*11.0;
 color+=vec3f(0.8,0.67,0.50)*pow(sunDot,18.0)*0.2;
 return color;
}
@fragment fn fragmentOcean(input:OceanVary)->@location(0) vec4f{
 let worldXZ=input.world.xz;
 let viewDir=normalize(cfg.eye.xyz-input.world);
 var slopes=vec2f(0.0);
 var meanSq=0.0;
 var jac=1.0;
 for(var layer:i32=0;layer<5;layer++){
  let texelMeters=tiles[layer]/cfg.eye.w;
  let lod=clamp(log2(max(1.0,input.distance*0.0015/max(0.001,texelMeters))),0.0,log2(cfg.eye.w));
  let normalPack=textureSampleLevel(normalTex,linearSampler,fract(worldXZ/tiles[layer]),layer,lod);
  slopes+=normalPack.xy;
  meanSq+=normalPack.z;
  jac=min(jac,normalPack.w);
 }
 let waterNormal=normalize(vec3f(-slopes.x,1.0,-slopes.y));
 let reflected=reflect(-viewDir,waterNormal);
 let reflectedSky=skyColor(reflected);
 let ndv=clamp(dot(waterNormal,viewDir),0.0,1.0);
 let fresnel=0.02+0.98*pow(1.0-ndv,5.0);
 // Approximate IOP-based water body color: b_b/(a+b_b), not an RGB color picker.
 let absorption=vec3f(0.30,0.085,0.04);
 let backscatter=vec3f(0.005,0.025,0.047);
 let waterBody=(backscatter/(absorption+backscatter))*vec3f(1.2,1.35,1.55);
 let sunDirection=normalize(vec3f(-0.35,0.49,0.8));
 let halfVec=normalize(viewDir+sunDirection);
 let roughness=clamp(0.03+meanSq*0.13,0.035,0.7);
 let shininess=mix(1800.0,22.0,roughness);
 let sunSpec=pow(max(dot(waterNormal,halfVec),0.0),shininess)*(0.04+0.3*roughness);
 var color=mix(waterBody,reflectedSky,fresnel*0.96+0.06);
 color+=vec3f(1.0,0.88,0.69)*sunSpec*9.0;
 // Mapped atmospheric cloud shadows, on water but not ball.
 let cloudField=sin(worldXZ.x*0.0016+sin(worldXZ.y*0.002))*sin(worldXZ.y*0.0012);
 color*=1.0-0.18*smoothstep(0.35,0.8,cloudField);
 let nearUV=(worldXZ-cfg.boat.xz)/420.0+0.5;
 let farUV=(worldXZ-cfg.boat.xz)/3200.0+0.5;
 var n=vec4f(0.0);
 if(all(nearUV>=vec2f(0.0))&&all(nearUV<=vec2f(1.0))){
  n=textureSampleLevel(foamNear,linearSampler,nearUV,0.0);
 }
 var f=vec4f(0.0);
 if(all(farUV>=vec2f(0.0))&&all(farUV<=vec2f(1.0))){
  f=textureSampleLevel(foamFar,linearSampler,farUV,0.0);
 }
 let nearBlend=1.0-smoothstep(145.0,210.0,input.distance);
 let foamState=mix(f,n,nearBlend);
 let whitecaps=(1.0-smoothstep(0.55,0.92,jac))*0.22*cfg.extra.x;
 let foamCoverage=clamp(foamState.x+foamState.z*0.35+whitecaps,0.0,0.95);
 color=mix(color,vec3f(0.80,0.90,0.94),foamCoverage);
 color*=1.0-foamState.w*0.16;
 // ACES-inspired shoulder, gamma for unorm canvas.
 color=(color*(2.51*color+0.03))/(color*(2.43*color+0.59)+0.14);
 return vec4f(pow(clamp(color,vec3f(0.0),vec3f(1.0)),vec3f(1.0/2.2)),1.0);
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
 let vv=normalize(vec3f(input.uv.x*0.9,input.uv.y*0.66+0.15,1.0));
 let sky=skyColor(vv);
 let out=sky/(1.0+sky);
 return vec4f(pow(out,vec3f(1.0/2.2)),1.0);
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
 let normal=vec3f(sin(polar)*cos(az),cos(polar),sin(polar)*sin(az));
 let world=vec3f(cfg.boat.x,cfg.boat.y,cfg.boat.z)+normal*cfg.boat.w;
 var output:BallVary;
 output.normal=normal;output.world=world;output.pos=cfg.viewProj*vec4f(world,1.0);
 return output;
}
@fragment fn fragmentBall(input:BallVary)->@location(0) vec4f{
 let n=normalize(input.normal);
 let light=normalize(vec3f(-0.35,0.49,0.8));
 let v=normalize(cfg.eye.xyz-input.world);
 let reflection=skyColor(reflect(-v,n));
 let fresnel=0.08+0.92*pow(1.0-max(dot(n,v),0.0),5.0);
 let diffuse=max(dot(n,light),0.0);
 var color=vec3f(0.86,0.26,0.085)*(0.18+diffuse*0.7)+reflection*fresnel*0.5;
 color+=vec3f(1.0)*pow(max(dot(n,normalize(light+v)),0.0),90.0)*0.6;
 return vec4f(pow(color/(1.0+color),vec3f(1.0/2.2)),1.0);
}
`;}