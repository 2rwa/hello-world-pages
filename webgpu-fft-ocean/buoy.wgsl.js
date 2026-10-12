export const buoyWGSL=/* wgsl */ `
struct Params {viewProj:mat4x4f,sim:vec4f,boat:vec4f,prior:vec4f,extra:vec4f,eye:vec4f};
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var dispTex:texture_2d_array<f32>;
@group(0) @binding(2) var<storage,read_write> heights:array<f32>;
const tiles=array<f32,5>(2003.0,433.0,97.0,23.3,5.3);
@compute @workgroup_size(32)
fn probe(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=27u){return;}
 let px=(f32(id.x%9u)-4.0)/4.0;
 let pz=(f32(id.x/9u)-1.0);
 let angle=cfg.sim.w;
 let direction=vec2f(cos(angle),sin(angle));
 let sideways=vec2f(-direction.y,direction.x);
 let worldXZ=cfg.boat.xz+sideways*px*cfg.boat.w+direction*pz*cfg.boat.w;
 var h=0.0;
 for(var layer:i32=0;layer<5;layer++){
  let uv=fract(worldXZ/tiles[layer]);
  let n=textureDimensions(dispTex);
  let coord=vec2i(floor(uv*vec2f(n)));
  h+=textureLoad(dispTex,coord,layer,0).x;
 }
 heights[id.x]=h;
}
`;