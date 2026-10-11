@group(0) @binding(0) var photo:texture_2d<f32>;
struct Out{@builtin(position) pos:vec4<f32>};
@vertex fn vertexMain(@builtin(vertex_index) idx:u32)->Out{
 var corners=array<vec2<f32>,3>(vec2<f32>(-1.0,-3.0),vec2<f32>(-1.0,1.0),vec2<f32>(3.0,1.0));
 var out:Out;out.pos=vec4<f32>(corners[idx],0.0,1.0);return out;
}
@fragment fn fragmentMain(@builtin(position) pixel:vec4<f32>)->@location(0) vec4<f32>{
 return textureLoad(photo,vec2<i32>(pixel.xy),0);
}
