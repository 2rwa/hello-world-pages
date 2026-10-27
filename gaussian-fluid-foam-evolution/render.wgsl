// Full-screen ray/heightfield intersection and ocean shading.
// All samples read from the completed GPU shallow-water simulation.
const GRID:u32=160u;
const EXTENT:f32=48.0;
struct Params {
  step:vec4f,
  view:vec4f,
  lighting:vec4f,
  tap:vec4f,
  resolution:vec4f,
};
@group(0) @binding(0) var<storage,read> field:array<vec4f>;
@group(0) @binding(1) var<uniform> params:Params;
@group(0) @binding(2) var<storage,read> deformation:array<vec4f>;
@group(0) @binding(3) var<storage,read> foamGrid:array<vec4f>;
fn wrapIndex(v:i32)->u32{
  return u32((v+160)%160);
}
fn atPoint(gridPos:vec2i)->vec4f{
  return field[wrapIndex(gridPos.x)+wrapIndex(gridPos.y)*GRID];
}
fn readField(worldPosition:vec2f)->vec4f{
  let texCoord=fract(worldPosition/EXTENT+vec2f(0.5))*160.0-vec2f(0.5);
  let baseCoord=vec2i(floor(texCoord));
  let fracCoord=fract(texCoord);
  let a=mix(atPoint(baseCoord),atPoint(baseCoord+vec2i(1,0)),fracCoord.x);
  let b=mix(atPoint(baseCoord+vec2i(0,1)),atPoint(baseCoord+vec2i(1,1)),fracCoord.x);
  return mix(a,b,fracCoord.y);
}
fn swells(worldPosition:vec2f)->f32{
  let time=params.step.x;
  let amplitude=params.lighting.z;
  let waveA=sin(worldPosition.x*0.19+worldPosition.y*0.27-time*0.80);
  let waveB=sin(worldPosition.x*0.44-worldPosition.y*0.15+time*1.15);
  let waveC=sin(worldPosition.x*1.17+worldPosition.y*0.68-time*2.45);
  let longWave=sin(worldPosition.y*0.061+worldPosition.x*0.046-time*0.37);
  return amplitude*(waveA*0.25+waveB*0.10+waveC*0.035+longWave*0.42);
}
fn surfaceHeight(worldPosition:vec2f)->f32{
  return readField(worldPosition).x*0.75+swells(worldPosition);
}
fn atmosphere(direction:vec3f,sunDirection:vec3f)->vec3f{
  let climb=clamp(direction.y*0.75+0.20,0.0,1.0);
  let base=mix(vec3f(0.67,0.78,0.79),vec3f(0.048,0.23,0.38),pow(climb,0.65));
  let haze=pow(1.0-clamp(abs(direction.y)*3.2,0.0,1.0),2.0);
  let horizonTint=vec3f(0.87,0.56,0.37)*haze*(1.0-params.lighting.x)*0.45;
  let angular=max(dot(direction,sunDirection),0.0);
  let glow=pow(angular,25.0)*vec3f(1.0,0.66,0.38)*0.32;
  let disk=pow(angular,1100.0)*vec3f(4.0,2.85,1.6);
  return base+horizonTint+glow+disk;
}
fn tonemap(color:vec3f)->vec3f{
  let film=color/(color+vec3f(1.0));
  return pow(clamp(film,vec3f(0.0),vec3f(1.0)),vec3f(0.79));
}

fn foamAt(gridPos:vec2i)->vec4f {
  return foamGrid[wrapIndex(gridPos.x)+wrapIndex(gridPos.y)*GRID];
}
fn sampleFoam(worldPosition:vec2f)->vec4f {
  let texCoord=fract(worldPosition/EXTENT+vec2f(0.5))*160.0-vec2f(0.5);
  let baseCoord=vec2i(floor(texCoord));
  let fraction=fract(texCoord);
  let lower=mix(foamAt(baseCoord),foamAt(baseCoord+vec2i(1,0)),fraction.x);
  let upper=mix(foamAt(baseCoord+vec2i(0,1)),foamAt(baseCoord+vec2i(1,1)),fraction.x);
  return mix(lower,upper,fraction.y);
}
fn foamHash(p:vec2f)->f32 {
  return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);
}
fn foamNoise(worldPosition:vec2f)->f32 {
  let cell=floor(worldPosition);
  let fraction=fract(worldPosition);
  let f=fraction*fraction*(vec2f(3.0)-2.0*fraction);
  let v0=mix(foamHash(cell),foamHash(cell+vec2f(1.0,0.0)),f.x);
  let v1=mix(foamHash(cell+vec2f(0.0,1.0)),foamHash(cell+vec2f(1.0,1.0)),f.x);
  return mix(v0,v1,f.y);
}
fn debugFoamChannels(uv:vec2f)->vec4f{
  let inQuadrant=uv*2.0-sign(uv);
  let worldPosition=inQuadrant*22.5;
  let foam=sampleFoam(worldPosition);
  var channel=foam.x;
  var tint=vec3f(0.68,0.90,0.92);
  if(uv.x>=0.0 && uv.y>=0.0) {
    channel=foam.y;tint=vec3f(1.0,0.97,0.87);
  } else if(uv.x<0.0 && uv.y<0.0) {
    channel=foam.z;tint=vec3f(0.34,0.72,1.0);
  } else if(uv.x>=0.0 && uv.y<0.0) {
    channel=foam.w;tint=vec3f(0.63,0.67,0.81);
  }
  let gridLines=1.0-smoothstep(0.4,0.49,max(abs(fract(worldPosition.x/3.0)-0.5),abs(fract(worldPosition.y/3.0)-0.5)));
  let alpha=clamp(channel*(0.86+0.14*gridLines),0.0,1.4);
  let border=1.0-smoothstep(0.0,0.012,min(abs(uv.x),abs(uv.y)));
  return vec4f(tonemap(vec3f(0.009,0.025,0.04)+tint*alpha+vec3f(border*0.2)),1.0);
}

fn debugField(uv:vec2f)->vec4f{
  let worldPosition=uv*22.5;
  let data=readField(worldPosition);
  let foam=sampleFoam(worldPosition);
  let signedHeight=clamp(data.x*0.75+0.5,0.0,1.0);
  let energy=clamp(length(data.yz)*0.35,0.0,1.0);
  var col=mix(vec3f(0.005,0.09,0.18),vec3f(0.15,0.72,0.75),signedHeight);
  col=col+vec3f(0.22,0.05,0.00)*energy+vec3f(foam.x*0.28+foam.y*0.12);
  let minorGrid=abs(fract(worldPosition/3.0)-vec2f(0.5));
  let guide=1.0-smoothstep(0.477,0.495,max(minorGrid.x,minorGrid.y));
  col=mix(col,col*0.75,guide*0.10);
  let fade=1.0-smoothstep(0.94,1.0,max(abs(uv.x),abs(uv.y)));
  return vec4f(tonemap(col)*fade,1.0);
}

fn jacobianAt(worldPosition:vec2f)->f32{
  let coord=vec2i(floor(fract(worldPosition/EXTENT+vec2f(0.5))*f32(GRID)));
  let ddx=(deformation[wrapIndex(coord.x+1)+wrapIndex(coord.y)*GRID].xy
            -deformation[wrapIndex(coord.x-1)+wrapIndex(coord.y)*GRID].xy)*(0.5*160.0/EXTENT);
  let ddz=(deformation[wrapIndex(coord.x)+wrapIndex(coord.y+1)*GRID].xy
            -deformation[wrapIndex(coord.x)+wrapIndex(coord.y-1)*GRID].xy)*(0.5*160.0/EXTENT);
  return (1.0+ddx.x)*(1.0+ddz.y)-ddz.x*ddx.y;
}
fn debugJacobian(uv:vec2f)->vec4f{
  let worldPosition=uv*22.5;
  let jacobian=jacobianAt(worldPosition);
  let compressed=1.0-smoothstep(0.56,0.94,jacobian);
  let stretched=smoothstep(1.0,1.36,jacobian);
  let base=vec3f(0.018,0.18,0.23);
  let coral=vec3f(1.0,0.30,0.19);
  let cyan=vec3f(0.09,0.47,0.80);
  let colored=mix(mix(base,cyan,stretched*0.85),coral,compressed);
  let foam=readField(worldPosition).w;
  let fade=1.0-smoothstep(0.94,1.0,max(abs(uv.x),abs(uv.y)));
  return vec4f(tonemap(colored+foam*vec3f(0.14))*fade,1.0);
}

@vertex fn fullscreen(@builtin(vertex_index) index:u32)->@builtin(position) vec4f{
  var triangle=array<vec2f,3>(
    vec2f(-1.0,-1.0),
    vec2f( 3.0,-1.0),
    vec2f(-1.0, 3.0)
  );
  return vec4f(triangle[index],0.0,1.0);
}
@fragment fn render(@builtin(position) pixel:vec4f)->@location(0) vec4f{
  let screen=params.resolution.xy;
  let uv=vec2f(pixel.x/screen.x*2.0-1.0,1.0-pixel.y/screen.y*2.0);
  if(params.lighting.y>2.5){return debugFoamChannels(uv);}
  if(params.lighting.y>1.5){return debugJacobian(uv);}
  if(params.lighting.y>0.5){return debugField(uv);}
  let aspect=screen.x/screen.y;
  let yaw=params.view.y;
  let pitch=params.view.z;
  let dirLocal=normalize(vec3f(uv.x*aspect*0.82,uv.y*0.78-0.16+pitch,-1.0));
  let rayDirection=vec3f(
    dirLocal.x*cos(yaw)+dirLocal.z*sin(yaw),
    dirLocal.y,
    dirLocal.z*cos(yaw)-dirLocal.x*sin(yaw)
  );
  let sunDirection=normalize(vec3f(-0.44,params.lighting.x,-0.75));
  let sky=atmosphere(rayDirection,sunDirection);
  if(rayDirection.y>=-0.009) {
    return vec4f(tonemap(sky),1.0);
  }
  let origin=vec3f(0.0,params.view.x,0.0);
  var distanceToWater=-origin.y/rayDirection.y;
  if(distanceToWater>210.0 || distanceToWater<0.0){
    return vec4f(tonemap(sky),1.0);
  }
  // Fixed point iteration for non-SDF heightfield, not sphere tracing.
  for(var iter=0;iter<4;iter=iter+1){
    let worldPosition=origin.xz+rayDirection.xz*distanceToWater;
    let height=surfaceHeight(worldPosition);
    distanceToWater=(height-origin.y)/rayDirection.y;
    distanceToWater=clamp(distanceToWater,0.0,230.0);
  }
  if(distanceToWater>=220.0){ return vec4f(tonemap(sky),1.0); }
  let hit=origin+rayDirection*distanceToWater;
  let sampleDistance=0.32;
  let grad=vec2f(
    surfaceHeight(hit.xz+vec2f(sampleDistance,0.0))-surfaceHeight(hit.xz-vec2f(sampleDistance,0.0)),
    surfaceHeight(hit.xz+vec2f(0.0,sampleDistance))-surfaceHeight(hit.xz-vec2f(0.0,sampleDistance))
  )/(2.0*sampleDistance);
  let normal=normalize(vec3f(-grad.x,1.0,-grad.y));
  let viewDirection=-rayDirection;
  let incidence=clamp(dot(normal,viewDirection),0.0,1.0);
  let fresnel=0.02+0.98*pow(1.0-incidence,5.0);
  let reflection=reflect(rayDirection,normal);
  let reflectedSky=atmosphere(reflection,sunDirection);
  let depthTint=mix(vec3f(0.002,0.11,0.15),vec3f(0.015,0.26,0.28),clamp(dot(normal,viewDirection),0.0,1.0));
  let horizonBlend=clamp(distanceToWater/140.0,0.0,1.0);
  let diffused=depthTint*(0.8+0.35*clamp(normal.y,0.0,1.0));
  var color=mix(diffused,reflectedSky,clamp(fresnel+0.22+0.12*horizonBlend,0.0,1.0));
  let directSun=pow(max(dot(reflection,sunDirection),0.0),180.0)*vec3f(2.0,1.45,0.76);
  color=color+directSun*0.8;
  // RGB/opacity are derived from FOUR independently aging foam channels.
  let foam=sampleFoam(hit.xz);
  let foamPatchNoise=foamNoise(hit.xz*0.85+vec2f(4.2,-3.1));
  let detail=foamNoise(hit.xz*3.1);
  let filaments=0.5+0.5*sin(hit.x*2.7+sin(hit.z*1.2)*2.7)
                                *sin(hit.z*2.2);
  let lace=mix(foamPatchNoise,filaments*0.70+detail*0.30,0.53);
  let organicEdge=smoothstep(0.20,0.83,lace);
  let coverage=clamp(foam.x*1.16*(0.29+0.71*organicEdge)+foam.z*0.14,0.0,0.96);
  let freshness=clamp(foam.y/(foam.x+0.055),0.0,1.0);
  let cream=mix(vec3f(0.42,0.66,0.71),vec3f(0.95,0.98,0.96),freshness);
  let crest=smoothstep(0.10,0.75,surfaceHeight(hit.xz));
  let foamOpacity=clamp(coverage*params.view.w*(0.62+0.33*crest),0.0,0.96);
  let subsurfaceBubbles=clamp(foam.z*params.view.w*0.30,0.0,0.35);
  color=mix(color,vec3f(0.29,0.61,0.72),subsurfaceBubbles);
  color=mix(color,cream*(0.43+0.55*params.lighting.x)+cream*0.23,foamOpacity);
  // A slick suppresses glitter and lowers local reflection contrast.
  color*=1.0-clamp(foam.w*params.view.w*0.14,0.0,0.24);
  let distant=clamp((distanceToWater-95.0)/115.0,0.0,1.0);
  color=mix(color,sky,distant*0.18);
  // A little dithering to reduce 8-bit banding at the horizon.
  let noise=fract(sin(dot(pixel.xy,vec2f(12.9898,78.233)))*43758.5453);
  return vec4f(tonemap(color)+vec3f((noise-0.5)/255.0),1.0);
}