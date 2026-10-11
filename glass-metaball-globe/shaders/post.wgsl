struct PostUniform {frame:vec4<f32>,look:vec4<f32>,}; // width height bloom bloom radius, exposure trail vignette unused
@group(0) @binding(0) var<uniform> cfg:PostUniform;
@group(0) @binding(1) var hdr:texture_2d<f32>;
@group(0) @binding(2) var oldFrame:texture_2d<f32>;
struct Out{@builtin(position) position:vec4<f32>,@location(0) uv:vec2<f32>,};
@vertex fn vertexMain(@builtin(vertex_index) idx:u32)->Out{
 var corners=array<vec2<f32>,3>(vec2<f32>(-1.0,-3.0),vec2<f32>(-1.0,1.0),vec2<f32>(3.0,1.0));
 let pos=corners[idx];var o:Out;o.position=vec4<f32>(pos,0.0,1.0);o.uv=pos*.5+vec2<f32>(.5);return o;
}
fn sampleFog(pos:vec2<i32>)->vec3<f32>{
 return textureLoad(hdr,clamp(pos,vec2<i32>(0),vec2<i32>(cfg.frame.xy)-vec2<i32>(1)),0).rgb;
}
fn bloomFog(pos:vec2<i32>)->vec3<f32>{
 let v=sampleFog(pos);return max(v-vec3<f32>(.09),vec3<f32>(0.0));
}
@fragment fn fragmentMain(input:Out)->@location(0) vec4<f32>{
 let pix=vec2<i32>(input.position.xy);let radius=i32(cfg.frame.w);
 var glow=bloomFog(pix)*.15;
 glow+=(bloomFog(pix+vec2<i32>(radius,0))+bloomFog(pix-vec2<i32>(radius,0)))*.15;
 glow+=(bloomFog(pix+vec2<i32>(0,radius))+bloomFog(pix-vec2<i32>(0,radius)))*.15;
 glow+=(bloomFog(pix+vec2<i32>(radius,radius))+bloomFog(pix-vec2<i32>(radius,radius)))*.1;
 glow+=(bloomFog(pix+vec2<i32>(radius,-radius))+bloomFog(pix+vec2<i32>(-radius,radius)))*.1;
 let scene=(sampleFog(pix)+glow*cfg.frame.z)*cfg.look.x;
 var tone=scene/(scene+vec3<f32>(.9));
 tone=pow(max(tone,vec3<f32>(0.0)),vec3<f32>(.9));
 let coord=input.uv*2.0-1.0;
 tone*=clamp(1.0-dot(coord,coord)*cfg.look.z*.27,.16,1.0);
 let historical=textureLoad(oldFrame,pix,0).rgb;
 tone=mix(tone,historical,cfg.look.y);
 return vec4<f32>(tone,1.0);
}
