export const foamWGSL=/* wgsl */ `
struct Params {viewProj:mat4x4f,sim:vec4f,boat:vec4f,prior:vec4f,extra:vec4f,eye:vec4f};
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var previousFoam:texture_2d<f32>;
@group(0) @binding(2) var nextFoam:texture_storage_2d<rgba16float,write>;
@group(0) @binding(3) var<uniform> clip:vec4f;
@group(0) @binding(4) var normals:texture_2d_array<f32>;
@group(0) @binding(5) var texSampler:sampler;
const PI:f32=3.14159265;
@compute @workgroup_size(8,8,1)
fn advance(@builtin(global_invocation_id) id:vec3u){
 let dims=textureDimensions(nextFoam);
 if(id.x>=dims.x||id.y>=dims.y){return;}
 let uv=(vec2f(id.xy)+0.5)/vec2f(dims);
 let meters=clip.x;
 let currentCenter=cfg.boat.xz;
 let worldPos=(uv-vec2f(0.5))*meters+currentCenter;
 let oldUV=(worldPos-vec2f(clip.y,clip.z))/meters+0.5;
 let samplingUV=clamp(oldUV,vec2f(0.00001),vec2f(0.99999));
 var prev=textureSampleLevel(previousFoam,texSampler,samplingUV,0.0);
 if(any(oldUV<vec2f(0.0))||any(oldUV>vec2f(1.0))){prev=vec4f(0.0);}
 let dt=min(0.08,max(0.0,clip.w));
 prev=prev*exp(-vec4f(0.3,0.9,0.6,0.17)*dt);
 let direction=vec2f(cos(cfg.sim.w),sin(cfg.sim.w));
 let longitudinal=dot(worldPos-currentCenter,direction);
 let lateral=dot(worldPos-currentCenter,vec2f(-direction.y,direction.x));
 let behind=-longitudinal;
 let wakeLength=max(12.0,cfg.prior.w*2.5+16.0);
 let envelope=smoothstep(-2.0,2.0,behind)*(1.0-smoothstep(wakeLength*0.65,wakeLength,behind));
 let vArm=abs(abs(lateral)-behind*tan(19.47*PI/180.0));
 let kelvin=exp(-pow(vArm/max(1.2,behind*0.05),2.0))*envelope;
 let middle=exp(-pow(lateral/max(1.3,behind*0.1),2.0))*envelope;
 let vessel=max(0.0,1.0-length(worldPos-currentCenter)/(cfg.boat.w+2.0));
 let velocityFactor=clamp(cfg.prior.w/11.0,0.0,1.8);
 let white=(0.4*kelvin+0.85*middle+vessel)*velocityFactor*cfg.extra.x*dt*1.4;
 let n0=textureSampleLevel(normals,texSampler,fract(worldPos/2003.0),0,0.0);
 let n1=textureSampleLevel(normals,texSampler,fract(worldPos/433.0),1,0.0);
 let fold=min(n0.w,n1.w);
 let breaking=(1.0-smoothstep(0.25,0.63,fold))*cfg.extra.x*dt*0.25;
 prev.x=clamp(prev.x+white+breaking,0.0,1.5);
 prev.y=clamp(prev.y+(white+breaking)*1.4,0.0,1.5);
 prev.z=clamp(prev.z+middle*dt*velocityFactor*0.3,0.0,1.5);
 prev.w=clamp(prev.w+middle*dt*velocityFactor*0.4,0.0,1.5);
 textureStore(nextFoam,vec2i(id.xy),prev);
}
`;