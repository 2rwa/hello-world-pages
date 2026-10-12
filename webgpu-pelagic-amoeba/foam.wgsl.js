export const foamWGSL=/* wgsl */ `
struct Params {viewProj:mat4x4f,sim:vec4f,boat:vec4f,prior:vec4f,extra:vec4f,eye:vec4f};
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var previousFoam:texture_2d<f32>;
@group(0) @binding(2) var nextFoam:texture_storage_2d<rgba16float,write>;
@group(0) @binding(3) var<uniform> clip:vec4f;
@group(0) @binding(4) var normals:texture_2d_array<f32>;
@group(0) @binding(5) var texSampler:sampler;
@group(0) @binding(6) var<uniform> wakeSettings:vec4f;
const PI:f32=3.14159265;
fn hashFoam(p:vec2f)->f32{
 return fract(sin(dot(p,vec2f(217.12,91.7)))*41842.2);
}
@compute @workgroup_size(8,8,1)
fn advance(@builtin(global_invocation_id) id:vec3u){
 let dims=textureDimensions(nextFoam);
 if(id.x>=dims.x||id.y>=dims.y){return;}
 let uv=(vec2f(id.xy)+0.5)/vec2f(dims);
 let meters=clip.x;
 let dt=min(0.08,max(0.0,clip.w));
 let currentCenter=cfg.boat.xz;
 let worldPos=(uv-vec2f(0.5))*meters+currentCenter;
 let direction=vec2f(cos(cfg.sim.w),sin(cfg.sim.w));
 let across=vec2f(-direction.y,direction.x);
 let wind=vec2f(0.65,0.33)*cfg.sim.z*0.005;
 let eddy=vec2f(sin(worldPos.y*0.009+cfg.sim.x*0.03),
                 cos(worldPos.x*0.011-cfg.sim.x*0.027))*0.09;
 let oldPos=worldPos-(wind+eddy)*dt;
 let oldUV=(oldPos-vec2f(clip.y,clip.z))/meters+0.5;
 let uvValid=all(oldUV>=vec2f(0.0))&&all(oldUV<=vec2f(1.0));
 // Reproject history into the world, not into boat-centered texture coordinates.
 var prev=textureSampleLevel(previousFoam,texSampler,
                            clamp(oldUV,vec2f(0.00001),vec2f(0.99999)),0.0);
 if(!uvValid){prev=vec4f(0.0);}
 // RGBA: foam coverage, fresh cream, suspended bubbles, damped reflective slick.
 prev*=exp(-vec4f(0.22,0.64,0.42,0.11)*dt);
 let relative=worldPos-currentCenter;
 let backward=-dot(relative,direction);
 let side=dot(relative,across);
 let speedFactor=clamp(cfg.prior.w/12.0,0.0,2.0);
 let wakeLength=clamp(cfg.prior.w*9.0+30.0,20.0,280.0);
 let aft=smoothstep(-1.5,2.5,backward)
         *(1.0-smoothstep(wakeLength*0.75,wakeLength,backward));
 let width=max(1.5,1.1+backward*0.065);
 let centralLane=exp(-pow(side/width,2.0))*aft;
 let kelvinArm=abs(abs(side)-max(0.0,backward)*tan(19.47*PI/180.0));
 let armWidth=max(1.1,backward*0.026);
 let arms=exp(-pow(kelvinArm/armWidth,2.0))*aft;
 let phase=backward*0.39-cfg.sim.x*0.95;
 let wavelet=pow(0.5+0.5*cos(phase+abs(side)*0.065),2.0);
 let armsCrest=arms*(0.20+0.8*wavelet);
 let bowDistance=length(relative-direction*cfg.boat.w*0.75);
 let bowFoam=exp(-pow(bowDistance/(cfg.boat.w*0.75+0.9),2.0));
 let lacing=clamp(wakeSettings.x,0.0,3.0);
 let laceThreads=pow(0.5+0.5*sin(backward*1.25+sin(side*1.7)*2.3),3.0);
 let laceChop=mix(1.0,0.23+1.25*laceThreads,clamp(lacing*0.33,0.0,1.0));
 let wakeIntensity=(centralLane*0.46+armsCrest*0.88*laceChop+bowFoam*0.34)
   *speedFactor*cfg.extra.x;
 // Crest evidence is based on the horizontal displacement Jacobian of 3 bands.
 let n0=textureSampleLevel(normals,texSampler,fract(worldPos/2003.0),0,0.0);
 let n1=textureSampleLevel(normals,texSampler,fract(worldPos/433.0),1,0.0);
 let n2=textureSampleLevel(normals,texSampler,fract(worldPos/97.0),2,0.0);
 let fold=min(min(n0.w,n1.w),n2.w);
 let crest=(1.0-smoothstep(0.31,0.68,fold))*0.34*cfg.extra.x;
 let localNoise=hashFoam(floor(worldPos*0.65));
 let brokenEdge=0.35+localNoise*0.4+laceChop*0.25;
 let source=clamp(wakeIntensity*brokenEdge+crest,0.0,2.5);
 prev.x=clamp(prev.x+source*dt*0.84,0.0,1.5);
 prev.y=clamp(prev.y+source*dt*1.6,0.0,1.5);
 prev.z=clamp(prev.z+(centralLane*0.53+bowFoam*0.6)*dt*speedFactor,0.0,1.0);
 prev.w=clamp(prev.w+centralLane*dt*speedFactor*0.28,0.0,1.0);
 textureStore(nextFoam,vec2i(id.xy),prev);
}
`;