@group(0) @binding(0) var displayed:texture_2d<f32>;
@vertex fn presentVertex(@builtin(vertex_index) id:u32)->@builtin(position) vec4<f32>{
 var corners=array<vec2<f32>,3>(vec2<f32>(-1.0,-3.0),vec2<f32>(-1.0,1.0),vec2<f32>(3.0,1.0));return vec4<f32>(corners[id],0.0,1.0);
}
@fragment fn presentFragment(@builtin(position) pixel:vec4<f32>)->@location(0) vec4<f32>{return textureLoad(displayed,vec2<i32>(pixel.xy),0);}
