const PI:f32=3.14159265;
const RES:u32=192u;
const TILES=array<f32,5>(2400.0,610.0,148.0,35.0,8.0);
struct Params {
  viewProj:mat4x4f,
  camera:vec4f,
  wind:vec4f,
  visual:vec4f,
  misc:vec4f,
  screen:vec4f,
};
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var displacementTex:texture_2d_array<f32>;
@group(0) @binding(2) var normalTex:texture_2d_array<f32>;
@group(0) @binding(3) var foamTex:texture_2d<f32>;
@group(0) @binding(4) var linearSampler:sampler;
struct OceanVary {
  @builtin(position) position:vec4f,
  @location(0) world:vec3f,
  @location(1) distance:f32,
};
fn waveDisp(xz:vec2f)->vec3f {
  var sum=vec3f(0.0);
  for(var band:i32=0;band<5;band++){
    let tex=textureSampleLevel(displacementTex,linearSampler,fract(xz/TILES[band]),band,0.0).xyz;
    let visibility=select(1.0,1.0-smoothstep(100.0,1300.0,length(xz)),band>2);
    sum+=tex*visibility;
  }
  return sum;
}
@vertex fn oceanVertex(@builtin(vertex_index) idx:u32)->OceanVary{
  let cells:u32=191u;
  let cell=idx/6u;
  let corner=idx%6u;
  let xy=vec2f(f32(cell%cells),f32(cell/cells));
  let coords=array<vec2f,6>(
    vec2f(0,0),vec2f(1,0),vec2f(0,1),
    vec2f(0,1),vec2f(1,0),vec2f(1,1)
  );
  let uv=(xy+coords[corner])/f32(cells)*2.0-1.0;
  let curved=sign(uv)*pow(abs(uv),vec2f(1.85));
  let base=curved*2300.0;
  let displacement=waveDisp(base);
  let xz=base+displacement.yz*0.84;
  let world=vec3f(xz.x,displacement.x,xz.y);
  var output:OceanVary;
  output.position=params.viewProj*vec4f(world,1.0);
  output.world=world;
  output.distance=length(xz);
  return output;
}
fn scalarHash(v:vec2f)->f32{
  return fract(sin(dot(v,vec2f(127.1,311.7)))*43758.5453);
}
fn noise2d(p:vec2f)->f32{
  let grid=floor(p);
  let fraction=fract(p);
  let t=fraction*fraction*(3.0-2.0*fraction);
  return mix(mix(scalarHash(grid),scalarHash(grid+vec2f(1.0,0.0)),t.x),
             mix(scalarHash(grid+vec2f(0.0,1.0)),scalarHash(grid+vec2f(1.0,1.0)),t.x),t.y);
}
fn fractalNoise(p:vec2f)->f32 {
  return noise2d(p)*0.56+noise2d(p*2.17)*0.29+noise2d(p*4.13)*0.15;
}
fn sunDirection()->vec3f{
  let elevation=params.visual.z;
  return normalize(vec3f(-0.77*cos(elevation),sin(elevation),0.62*cos(elevation)));
}
fn sunIntensity()->f32{
  return clamp(sin(params.visual.z)*1.6+0.16,0.1,1.2);
}
fn skyRadiance(direction:vec3f)->vec3f{
  let directionSafe=normalize(direction);
  let y=clamp(directionSafe.y,0.0,1.0);
  let horizon=vec3f(0.48,0.66,0.77)+vec3f(0.11,0.10,0.04)*params.visual.w*0.27;
  let zenith=vec3f(0.038,0.17,0.35);
  var radiance=mix(horizon,zenith,pow(y,0.54));
  let sunshine=sunDirection();
  let alignment=max(0.0,dot(directionSafe,sunshine));
  radiance+=vec3f(1.0,0.65,0.37)*pow(alignment,27.0)*0.38;
  radiance+=vec3f(1.0,0.87,0.62)*pow(alignment,2800.0)*10.5*sunIntensity();
  let skyUV=directionSafe.xz/max(0.09,abs(directionSafe.y))*0.14+vec2f(params.camera.w*0.00015,0.0);
  let cloud=fractalNoise(skyUV);
  let cloudDensity=smoothstep(0.55,0.72,cloud)*smoothstep(0.07,0.25,directionSafe.y);
  radiance=mix(radiance,vec3f(0.70,0.77,0.77)*sunIntensity(),cloudDensity*0.69);
  return max(radiance,vec3f(0.0));
}
fn filmic(color:vec3f)->vec3f{
  let safe=max(color,vec3f(0.0));
  let mapped=(safe*(2.51*safe+0.03))/(safe*(2.43*safe+0.59)+0.14);
  return pow(clamp(mapped,vec3f(0.0),vec3f(1.0)),vec3f(1.0/2.2));
}
@fragment fn oceanFragment(input:OceanVary)->@location(0) vec4f{
  let xz=input.world.xz;
  let cameraDistance=max(0.2,input.distance);
  let toEye=normalize(params.camera.xyz-input.world);
  let footprint=max(length(dpdx(xz)),length(dpdy(xz)));
  var slope=vec2f(0.0);
  var roughnessSlope:f32=0.0;
  var jac:f32=1.0;
  for(var band:i32=0;band<5;band++){
    let data=textureSampleLevel(normalTex,linearSampler,fract(xz/TILES[band]),band,0.0);
    let meterPerTexel=TILES[band]/f32(RES);
    let aliasFade=1.0-smoothstep(meterPerTexel*0.9,meterPerTexel*3.8,footprint);
    let distanceFade=select(1.0,1.0-smoothstep(160.0,850.0,cameraDistance),band>=3);
    let weight=aliasFade*distanceFade;
    slope+=data.xy*weight;
    roughnessSlope+=max(0.0,data.z)*weight;
    jac=min(jac,mix(1.0,data.w,weight));
  }
  let normal=normalize(vec3f(-slope.x*0.75,1.0,-slope.y*0.75));
  let roughness=clamp(0.058+sqrt(roughnessSlope)*0.21+cameraDistance*0.000017,0.06,0.58);
  let reflected=reflect(-toEye,normal);
  let reflectedSky=mix(skyRadiance(reflected),skyRadiance(reflect(-toEye,vec3f(0,1,0))),roughness*0.50);
  let nDotV=clamp(dot(normal,toEye),0.0,1.0);
  let fresnel=0.02+0.98*pow(1.0-nDotV,5.0);
  let absorption=vec3f(0.37,0.10,0.039)+vec3f(0.03,0.019,0.011)*params.visual.w;
  let scatter=vec3f(0.004,0.023,0.040)*params.visual.w;
  let water=scatter/(scatter+absorption)*vec3f(0.84,0.86,0.78);
  var color=mix(water*(0.26+0.67*sunIntensity()),reflectedSky,clamp(fresnel+0.075,0.0,1.0));
  let sunshine=sunDirection();
  let halfDirection=normalize(toEye+sunshine);
  let highlight=pow(max(dot(normal,halfDirection),0.0),max(24.0,3.0/(roughness*roughness)));
  color+=vec3f(1.0,0.87,0.67)*highlight*3.0*sunIntensity();
  let cloudShadow=fractalNoise(xz*0.0014+vec2f(params.camera.w*0.002,0.0));
  color*=1.0-0.22*smoothstep(0.54,0.75,cloudShadow);
  var foam=vec4f(0.0);
  let nearUV=xz/230.0+0.5;
  if(all(nearUV>=vec2f(0.0))&&all(nearUV<=vec2f(1.0))){
    foam=textureSampleLevel(foamTex,linearSampler,nearUV,0.0);
  }
  let whiteCaps=(1.0-smoothstep(0.32,0.80,jac))*0.28*params.visual.y;
  let filaments=0.5+0.5*sin(xz.x*0.71+sin(xz.y*0.15)*2.5)*sin(xz.y*0.56);
  let detail=fractalNoise(xz*0.65+vec2f(params.camera.w*0.03,0.0));
  let lace=mix(fractalNoise(xz*0.091),detail*0.54+filaments*0.46,1.0-smoothstep(80.0,700.0,cameraDistance));
  let foamCoverage=clamp((foam.x*1.1+whiteCaps)*(0.42+0.84*lace)+foam.z*0.16,0.0,0.94);
  let foamTint=mix(vec3f(0.42,0.64,0.69),vec3f(0.95,0.97,0.96),clamp(foam.y*0.62+0.37,0.0,1.0));
  color=mix(color,foamTint*(0.3+0.77*sunIntensity()),foamCoverage);
  color*=1.0-foam.w*0.13;
  let diagnostics=i32(params.misc.z+0.5);
  if(diagnostics==1){return vec4f(normal*0.5+0.5,1.0);}
  if(diagnostics==2){return vec4f(1.0-clamp(jac,0.0,1.0),foamCoverage,foam.y,1.0);}
  if(diagnostics==3){return vec4f(clamp(roughness,0.0,1.0),foamCoverage,clamp(input.world.y/6.0+0.5,0.0,1.0),1.0);}
  return vec4f(filmic(color),1.0);
}
@vertex fn skyVertex(@builtin(vertex_index) idx:u32)->@builtin(position) vec4f{
  let coords=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  return vec4f(coords[idx],0.9999,1.0);
}
@fragment fn skyFragment(@builtin(position) frag:vec4f)->@location(0) vec4f{
  let horizontal=(frag.x/params.screen.x*2.0-1.0)*params.misc.w*0.60;
  let vertical=(1.0-frag.y/params.screen.y*2.0)*0.60;
  let yaw=params.misc.x;
  let pitch=params.misc.y;
  let forward=vec3f(sin(yaw)*cos(pitch),-sin(pitch),-cos(yaw)*cos(pitch));
  let right=vec3f(cos(yaw),0.0,sin(yaw));
  let up=normalize(cross(right,forward));
  let ray=normalize(forward+right*horizontal+up*vertical);
  return vec4f(filmic(skyRadiance(ray)),1.0);
}
