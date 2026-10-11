struct PostParams{ frame:vec4<f32>,look:vec4<f32>,extras:vec4<f32>,};
@group(0) @binding(0) var<uniform> params:PostParams;
@group(0) @binding(1) var hdr:texture_2d<f32>;
@group(0) @binding(2) var oldFrame:texture_2d<f32>;
struct ScreenVertex{@builtin(position) screen:vec4<f32>,@location(0) uv:vec2<f32>,};
@vertex fn postVertex(@builtin(vertex_index) vertexId:u32)->ScreenVertex{
 var points=array<vec2<f32>,3>(vec2<f32>(-1.0,-3.0),vec2<f32>(-1.0,1.0),vec2<f32>(3.0,1.0));var v:ScreenVertex;v.screen=vec4<f32>(points[vertexId],0.0,1.0);v.uv=points[vertexId]*.5+vec2<f32>(.5);return v;
}
fn hdrColor(pixel:vec2<i32>)->vec3<f32>{let limit=vec2<i32>(params.frame.xy)-vec2<i32>(1);return textureLoad(hdr,clamp(pixel,vec2<i32>(0),limit),0).rgb;}
fn extracted(pixel:vec2<i32>)->vec3<f32>{let col=hdrColor(pixel);let peak=max(col.r,max(col.g,col.b));return col*max(0.0,peak-params.look.y)/max(.01,peak);}
@fragment fn postFragment(v:ScreenVertex)->@location(0) vec4<f32>{
 let pix=vec2<i32>(v.screen.xy);let source=hdrColor(pix);
 let radius=max(1,i32(params.look.x));
 var bloom=extracted(pix)*.25;
 bloom+=extracted(pix+vec2<i32>(radius,0))*.1;
 bloom+=extracted(pix+vec2<i32>(-radius,0))*.1;
 bloom+=extracted(pix+vec2<i32>(0,radius))*.1;
 bloom+=extracted(pix+vec2<i32>(0,-radius))*.1;
 bloom+=extracted(pix+vec2<i32>(radius,radius))*.07;
 bloom+=extracted(pix+vec2<i32>(radius,-radius))*.07;
 bloom+=extracted(pix+vec2<i32>(-radius,radius))*.07;
 bloom+=extracted(pix+vec2<i32>(-radius,-radius))*.07;
 bloom+=extracted(pix+vec2<i32>(radius*3,0))*.045;
 bloom+=extracted(pix+vec2<i32>(-radius*3,0))*.045;
 bloom+=extracted(pix+vec2<i32>(0,radius*3))*.045;
 bloom+=extracted(pix+vec2<i32>(0,-radius*3))*.045;
 var col=(source+bloom*params.frame.z)*params.look.z;
 col=col/(col+vec3<f32>(.85));
 col=pow(max(col,vec3<f32>(0.0)),vec3<f32>(.90));
 let uv=v.uv*2.0-1.0;let vignette=1.0-dot(uv,uv)*params.extras.x*.26;
 col*=clamp(vignette,.12,1.0);
 let prev=textureLoad(oldFrame,pix,0).rgb;
 col=mix(col,prev,params.look.w);
 return vec4<f32>(col,1.0);
}
