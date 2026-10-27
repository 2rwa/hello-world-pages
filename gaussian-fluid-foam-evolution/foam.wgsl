// Gaussian Fluid Sea: 4-channel, world-fixed advected foam history.
// R=coverage, G=fresh white foam, B=subsurface microbubbles, A=surface slick.
const GRID:u32=160u;
const EXTENT:f32=48.0;
const SPACING:f32=EXTENT/f32(GRID);
struct Params {
  step:vec4f,
  view:vec4f,
  lighting:vec4f,
  tap:vec4f,
  resolution:vec4f,
};
@group(0) @binding(0) var<storage,read> fluidFinal:array<vec4f>;
@group(0) @binding(1) var<storage,read> deformHistory:array<vec4f>;
@group(0) @binding(2) var<storage,read> foamHistory:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> foamFinal:array<vec4f>;
@group(0) @binding(4) var<uniform> params:Params;

fn cyclicIndex(v:i32)->u32 {
  return u32((v+160)%160);
}
fn gridIndex(x:i32,z:i32)->u32 {
  return cyclicIndex(x)+GRID*cyclicIndex(z);
}
fn sampleFoam(worldPosition:vec2f)->vec4f {
  let p=fract(worldPosition/EXTENT+vec2f(0.5))*f32(GRID)-vec2f(0.5);
  let basePos=vec2i(floor(p));
  let f=fract(p);
  let a=mix(foamHistory[gridIndex(basePos.x,basePos.y)],
            foamHistory[gridIndex(basePos.x+1,basePos.y)],f.x);
  let b=mix(foamHistory[gridIndex(basePos.x,basePos.y+1)],
            foamHistory[gridIndex(basePos.x+1,basePos.y+1)],f.x);
  return mix(a,b,f.y);
}
fn breakingJacobian(gx:i32,gz:i32)->f32 {
  let gradientX=(deformHistory[gridIndex(gx+1,gz)].xy-deformHistory[gridIndex(gx-1,gz)].xy)*(0.5/SPACING);
  let gradientZ=(deformHistory[gridIndex(gx,gz+1)].xy-deformHistory[gridIndex(gx,gz-1)].xy)*(0.5/SPACING);
  return (1.0+gradientX.x)*(1.0+gradientZ.y)-gradientZ.x*gradientX.y;
}
fn foamRandom(worldPosition:vec2f)->f32 {
  return fract(sin(dot(floor(worldPosition*1.1),vec2f(217.12,91.7)))*41842.2);
}
@compute @workgroup_size(8,8)
fn updateFoam(@builtin(global_invocation_id) gid:vec3u){
  if(gid.x>=GRID || gid.y>=GRID) {return;}
  let gx=i32(gid.x);
  let gz=i32(gid.y);
  let idx=gridIndex(gx,gz);
  let dt=clamp(params.step.y,0.0,0.04);
  let velocity=fluidFinal[idx].yz;
  let worldPosition=(vec2f(f32(gid.x)+0.5,f32(gid.y)+0.5)/f32(GRID)-vec2f(0.5))*EXTENT;
  let previous=sampleFoam(worldPosition-velocity*dt);
  let lifeScale=max(0.22,params.resolution.w);
  // Foam ages: fresh whiteness fades quickly, slick lingers.
  var foam=previous*exp(-vec4f(0.22,0.70,0.40,0.11)*dt/lifeScale);
  let jacobian=breakingJacobian(gx,gz);
  let compression=1.0-smoothstep(0.56,0.94,jacobian);
  let noise=foamRandom(worldPosition);
  let breakup=(0.57+0.43*noise);
  let intensity=clamp(params.resolution.z,0.0,3.0);
  let source=compression*breakup*intensity;
  let rapidVelocity=clamp(length(velocity)*0.18,0.0,0.6);
  // Source from Jacobian folding; the rate coefficients are empirical.
  foam.x=clamp(foam.x+source*dt*1.90,0.0,1.5); // whitecap area
  foam.y=clamp(foam.y+source*dt*2.75,0.0,1.5); // freshly aerated cream
  foam.z=clamp(foam.z+source*dt*(0.66+rapidVelocity),0.0,1.2); // suspended bubbles
  foam.w=clamp(foam.w+source*dt*0.39,0.0,1.0); // slowly fading slick
  foamFinal[idx]=foam;
}
