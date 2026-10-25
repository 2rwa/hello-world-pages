struct Camera {
  eye: vec4f,
  rightDirection: vec4f,
  upDirection: vec4f,
  forwardDirection: vec4f,
  viewport: vec4f, // width, height, focal, world sigma
  appearance: vec4f, // opacity, palette, tank radius, time
};
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> particles: array<vec4f>;
struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec3f,
};
@vertex fn particleVertex(@builtin(vertex_index) vi:u32,@builtin(instance_index) particleId:u32)->Varyings {
  let particlePos=particles[particleId].xyz;
  let relativePos=particlePos-camera.eye.xyz;
  let depthValue=dot(relativePos,camera.forwardDirection.xyz);
  let safeDepth=max(depthValue,0.1);
  let focal=camera.viewport.z;
  let screenCenter=vec2f(camera.viewport.x*0.5+focal*dot(relativePos,camera.rightDirection.xyz)/safeDepth,
                          camera.viewport.y*0.5-focal*dot(relativePos,camera.upDirection.xyz)/safeDepth);
  let corners=array<vec2f,6>(vec2f(-1.0,-1.0),vec2f(1.0,-1.0),vec2f(-1.0,1.0),
                              vec2f(-1.0,1.0),vec2f(1.0,-1.0),vec2f(1.0,1.0));
  let corner=corners[vi];
  let radiusPx=min(110.0,focal*camera.viewport.w*3.0/safeDepth);
  let screenPos=screenCenter+radiusPx*corner;
  let ndc=vec2f(2.0*screenPos.x/camera.viewport.x-1.0,1.0-2.0*screenPos.y/camera.viewport.y);
  var out:Varyings;
  out.position=vec4f(ndc,0.35,1.0);
  out.uv=corner;
  let heightShade=clamp(0.55+particlePos.y*0.18,0.15,1.0);
  if (camera.appearance.y<0.5) {
    out.tint=mix(vec3f(0.018,0.37,0.70),vec3f(0.25,0.94,1.0),heightShade);
  } else if(camera.appearance.y<1.5) {
    out.tint=mix(vec3f(0.32,0.06,0.66),vec3f(1.0,0.33,0.67),heightShade);
  } else {
    out.tint=mix(vec3f(0.04,0.33,0.22),vec3f(0.78,1.0,0.23),heightShade);
  }
  return out;
}
@fragment fn particleFragment(input:Varyings)->@location(0) vec4f {
  let squaredRadius=dot(input.uv,input.uv);
  let gaussian=exp(-4.5*squaredRadius);
  let brightCore=exp(-36.0*squaredRadius);
  let alpha=clamp(gaussian*camera.appearance.x*0.22,0.0,0.60);
  if(alpha<0.001){discard;}
  return vec4f(input.tint*(0.83+0.6*brightCore)*alpha,alpha);
}
struct ScreenOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};
@vertex fn backgroundVertex(@builtin(vertex_index) vi:u32)->ScreenOutput {
  let corners=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  var out:ScreenOutput;
  let coord=corners[vi];
  out.position=vec4f(coord,0.95,1.0);
  out.uv=coord*vec2f(0.5,-0.5)+0.5;
  return out;
}
@fragment fn backgroundFragment(input:ScreenOutput)->@location(0) vec4f {
  let point=(input.uv-vec2f(0.5))*vec2f(camera.viewport.x/camera.viewport.y,1.0)*2.0;
  let centerDistance=length(point);
  var sky=mix(vec3f(0.002,0.010,0.025),vec3f(0.017,0.045,0.083),clamp(1.3-centerDistance,0.0,1.0));
  sky+=vec3f(0.008,0.018,0.03)*sin(point.x*10.0+point.y*4.0+camera.appearance.w*0.1);
  let cameraDistance=length(camera.eye.xyz);
  let tankRadius=camera.appearance.z;
  let ringRadius=(camera.viewport.z*tankRadius/sqrt(max(0.2,cameraDistance*cameraDistance-tankRadius*tankRadius)))*2.0/camera.viewport.y;
  let ringDistance=abs(centerDistance-ringRadius);
  let brightRing=exp(-ringDistance*ringDistance*14000.0);
  let halo=exp(-ringDistance*ringDistance*240.0);
  sky+=vec3f(0.08,0.31,0.50)*brightRing*0.65+vec3f(0.012,0.12,0.18)*halo;
  return vec4f(sky,1.0);
}
