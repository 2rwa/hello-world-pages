// Gaussian Fluid Sea: periodic 2-D symplectic shallow water driven by
// advected Gaussian pressure particles. All coordinates are world meters.
const GRID:u32=160u;
const HASH:u32=16u;
const PARTICLES:u32=384u;
const EXTENT:f32=48.0;
const SPACING:f32=EXTENT/f32(GRID);
struct Particle {
  position:vec4f, // x, z, gaussian sigma, pressure amplitude
  velocity:vec4f, // vx, vz, reserved, random phase
};
struct Params {
  step:vec4f,       // elapsed seconds, delta seconds, Gaussian strength, drift
  view:vec4f,       // camera height, yaw, pitch, foam strength
  lighting:vec4f,   // sun elevation, debug mode, swell amplitude, unused
  tap:vec4f,        // x, z, force, impulse enabled
  resolution:vec4f, // viewport x,y and unused
};
@group(0) @binding(0) var<storage,read_write> particles:array<Particle>;
@group(0) @binding(1) var<storage,read_write> hashHeads:array<atomic<i32>>;
@group(0) @binding(2) var<storage,read_write> hashLinks:array<i32>;
@group(0) @binding(3) var<storage,read> stateOld:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> stateNew:array<vec4f>;
@group(0) @binding(5) var<uniform> params:Params;
@group(0) @binding(6) var<storage,read_write> stateFinal:array<vec4f>;

fn wrapGrid(v:i32)->u32 {
  return u32((v+160)%160);
}
fn gridIndex(x:i32,z:i32)->u32 {
  return wrapGrid(x)+wrapGrid(z)*GRID;
}
fn shortestDisplacement(delta:vec2f)->vec2f {
  return delta-EXTENT*round(delta/EXTENT);
}
fn hashIndex(where:vec2f)->u32 {
  let cellCoord=vec2u(floor(fract(where/EXTENT+vec2f(0.5))*f32(HASH)));
  return cellCoord.x+HASH*cellCoord.y;
}
fn fieldLookup(where:vec2f)->vec4f {
  let cellCoord=vec2u(floor(fract(where/EXTENT+vec2f(0.5))*f32(GRID)));
  return stateOld[cellCoord.x+cellCoord.y*GRID];
}

@compute @workgroup_size(64)
fn clearGrid(@builtin(global_invocation_id) gid:vec3u) {
  if (gid.x>=HASH*HASH) { return; }
  atomicStore(&hashHeads[gid.x],-1);
}
@compute @workgroup_size(64)
fn moveGaussians(@builtin(global_invocation_id) gid:vec3u) {
  let idx=gid.x;
  if (idx>=PARTICLES) { return; }
  var drop=particles[idx];
  let sampled=fieldLookup(drop.position.xy);
  let time=params.step.x;
  let dt=params.step.y;
  let drift=params.step.w;
  let spin=vec2f(sin(drop.velocity.w+time*0.41),cos(drop.velocity.w*1.7-time*0.29));
  let desired=vec2f(0.36*drift,0.14*drift)+spin*0.33+sampled.yz*0.45;
  let relax=clamp(dt*2.5,0.0,0.15);
  drop.velocity.xy=mix(drop.velocity.xy,desired,relax);
  drop.position.xy=fract((drop.position.xy+drop.velocity.xy*dt)/EXTENT+vec2f(0.5))*EXTENT-vec2f(EXTENT*0.5);
  particles[idx]=drop;
  let hashSlot=hashIndex(drop.position.xy);
  let former=atomicExchange(&hashHeads[hashSlot],i32(idx));
  hashLinks[idx]=former;
}
@compute @workgroup_size(8,8)
fn heightStep(@builtin(global_invocation_id) gid:vec3u) {
  if (gid.x>=GRID || gid.y>=GRID) {return;}
  let gx=i32(gid.x);
  let gz=i32(gid.y);
  let idx=gridIndex(gx,gz);
  let current=stateOld[idx];
  let right=stateOld[gridIndex(gx+1,gz)];
  let left=stateOld[gridIndex(gx-1,gz)];
  let upper=stateOld[gridIndex(gx,gz+1)];
  let lower=stateOld[gridIndex(gx,gz-1)];
  let divergence=((right.y-left.y)+(upper.z-lower.z))*(0.5/SPACING);
  let dt=params.step.y;
  var height=clamp(current.x-dt*1.75*divergence,-3.0,3.0);
  if (params.tap.w>0.5) {
    let worldCoord=(vec2f(f32(gid.x)+0.5,f32(gid.y)+0.5)/f32(GRID)-vec2f(0.5))*EXTENT;
    let delta=shortestDisplacement(worldCoord-params.tap.xy);
    height=height+params.tap.z*exp(-dot(delta,delta)/(2.0*0.72*0.72));
  }
  stateNew[idx]=vec4f(height,current.y,current.z,current.w);
}
@compute @workgroup_size(8,8)
fn velocityStep(@builtin(global_invocation_id) gid:vec3u) {
  if(gid.x>=GRID || gid.y>=GRID) {return;}
  let gx=i32(gid.x);
  let gz=i32(gid.y);
  let idx=gridIndex(gx,gz);
  let cell=stateNew[idx];
  let hr=stateNew[gridIndex(gx+1,gz)].x;
  let hl=stateNew[gridIndex(gx-1,gz)].x;
  let hu=stateNew[gridIndex(gx,gz+1)].x;
  let hd=stateNew[gridIndex(gx,gz-1)].x;
  let slope=vec2f(hr-hl,hu-hd)*(0.5/SPACING);
  let worldCoord=(vec2f(f32(gid.x)+0.5,f32(gid.y)+0.5)/f32(GRID)-vec2f(0.5))*EXTENT;
  let center=vec2i(floor(fract(worldCoord/EXTENT+vec2f(0.5))*f32(HASH)));
  var pressureSlope=vec2f(0.0);
  var density=0.0;
  for(var oz=-1;oz<=1;oz=oz+1){
    for(var ox=-1;ox<=1;ox=ox+1){
      let bx=(center.x+ox+16)%16;
      let bz=(center.y+oz+16)%16;
      let slot=u32(bx+bz*16);
      var item=atomicLoad(&hashHeads[slot]);
      var scanned=0u;
      loop {
        if(item<0 || scanned>=24u) {break;}
        let drop=particles[u32(item)];
        let relative=shortestDisplacement(worldCoord-drop.position.xy);
        let sigma2=max(0.04,drop.position.z*drop.position.z);
        let kernel=drop.position.w*exp(-0.5*dot(relative,relative)/sigma2);
        density=density+kernel;
        pressureSlope=pressureSlope-relative*kernel/sigma2;
        item=hashLinks[u32(item)];
        scanned=scanned+1u;
      }
    }
  }
  let dt=params.step.y;
  let energy=params.step.z;
  let newVelocity=(cell.yz-dt*9.81*(slope+pressureSlope*(0.32*energy)))*0.992;
  let speed=length(newVelocity);
  let compression=max(0.0,-(stateNew[gridIndex(gx+1,gz)].y-stateNew[gridIndex(gx-1,gz)].y+stateNew[gridIndex(gx,gz+1)].z-stateNew[gridIndex(gx,gz-1)].z)*(0.5/SPACING));
  let breaking=smoothstep(0.48,1.70,speed)*0.35+compression*0.07+smoothstep(0.20,0.90,abs(cell.x))*0.16;
  let foam=max(cell.w*0.980,clamp(breaking,0.0,1.0));
  stateFinal[idx]=vec4f(cell.x,clamp(newVelocity,vec2f(-5.0),vec2f(5.0)),foam);
}