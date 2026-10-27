// Deep-water Gaussian wave packet synthesis. Each wave is a carrier whose
// frequency vector is sampled from a Gaussian spectral lobe and whose group
// envelope moves at cg = 1/2 sqrt(g/|k|). This is NOT a shallow-water solver.
const PI:f32=3.141592653589793;
const G:f32=9.81;
const RES:u32=192u;
const WAVES:u32=18u;
const TILES=array<f32,5>(2400.0,610.0,148.0,35.0,8.0);
struct Params {
  viewProj:mat4x4f,
  camera:vec4f, // eye xyz, elapsed t
  wind:vec4f, // direction xz, amplitude, speed
  visual:vec4f, // choppiness, foam, solar altitude, turbidity
  misc:vec4f,
  screen:vec4f, // yaw,pitch,diagnostic,viewport aspect
};
struct WavePacket {
  center:vec4f, // cx,cz,sigma,A
  carrier:vec4f, // kx,kz,initial phase,angular speed
  group:vec4f, // group velocity x,z,band,unused
};
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var<storage,read> packets:array<WavePacket>;
@group(0) @binding(2) var displacements:texture_storage_2d_array<rgba16float,write>;
@group(0) @binding(3) var slopes:texture_storage_2d_array<rgba16float,write>;
@compute @workgroup_size(8,8)
fn synthesize(@builtin(global_invocation_id) id:vec3u){
  if(id.x>=RES||id.y>=RES||id.z>=5u){return;}
  let band=id.z;
  let extent=TILES[band];
  let xz=(vec2f(id.xy)+0.5)/f32(RES)*extent;
  var height:f32=0.0;
  var horizontal=vec2f(0.0);
  var gradient=vec2f(0.0);
  var jacobianColumnsX=vec2f(1.0,0.0);
  var jacobianColumnsZ=vec2f(0.0,1.0);
  for(var i:u32=0u;i<WAVES;i=i+1u){
    let packet=packets[band*WAVES+i];
    let k=packet.carrier.xy;
    let magnitude=max(0.00005,length(k));
    let direction=k/magnitude;
    let sigma=max(0.5,packet.center.z);
    let position=packet.center.xy+packet.group.xy*params.camera.w;
    let delta=(xz-position)-extent*round((xz-position)/extent);
    let falloff=exp(-0.5*dot(delta,delta)/(sigma*sigma));
    let envDerivative=-delta*falloff/(sigma*sigma);
    let phase=dot(k,xz)-packet.carrier.w*params.camera.w+packet.carrier.z;
    let cosine=cos(phase);
    let sine=sin(phase);
    let amplitude=packet.center.w*params.wind.z;
    height+=amplitude*falloff*cosine;
    gradient+=amplitude*(envDerivative*cosine-falloff*k*sine);
    let choppy=params.visual.x*amplitude;
    horizontal+=direction*choppy*falloff*sine;
    let deformation=choppy*(envDerivative*sine+falloff*k*cosine);
    jacobianColumnsX+=direction*deformation.x;
    jacobianColumnsZ+=direction*deformation.y;
  }
  let jac=jacobianColumnsX.x*jacobianColumnsZ.y-jacobianColumnsX.y*jacobianColumnsZ.x;
  textureStore(displacements,id.xy,i32(band),vec4f(height,horizontal,0.0));
  textureStore(slopes,id.xy,i32(band),vec4f(gradient,dot(gradient,gradient),clamp(jac,-2.0,4.0)));
}
