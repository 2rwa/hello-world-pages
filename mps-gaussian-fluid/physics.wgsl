// Gaussian-weighted particle density constraints: an MPS-inspired, PBF-like prototype.
// This is not a full semi-implicit MPS Poisson solver.
struct Params {
  data: vec4f,     // dt, count, rigidity, damping
  gravity: vec4f,
  kernel: vec4f,   // sigma, rest number density, cutoff, tank radius
  impulse: vec4f,  // xyz kick and radial shake
};
@group(0) @binding(0) var<uniform> config: Params;
@group(0) @binding(1) var<storage, read> posIn: array<vec4f>;
@group(0) @binding(2) var<storage, read> velIn: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> posOut: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> velOut: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> lambdaValues: array<f32>;
fn gaussianWeight(r2: f32) -> f32 {
  if (r2 >= config.kernel.z * config.kernel.z) { return 0.0; }
  return exp(-0.5 * r2 / (config.kernel.x * config.kernel.x));
}
fn tankBound(positionValue: vec3f) -> vec3f {
  let limit = config.kernel.w - 0.065;
  let distanceValue = length(positionValue);
  if (distanceValue > limit) { return positionValue * (limit/distanceValue); }
  return positionValue;
}
@compute @workgroup_size(64)
fn predict(@builtin(global_invocation_id) gid: vec3u) {
  let particleId=gid.x;
  if (particleId>=u32(config.data.y)) { return; }
  let oldPosition=posIn[particleId].xyz;
  let particleSeed=f32(particleId);
  let randomDir=normalize(vec3f(sin(particleSeed*21.31+0.7),cos(particleSeed*10.83+1.3),sin(particleSeed*5.97+2.1)));
  var newVelocity=velIn[particleId].xyz+config.gravity.xyz*config.data.x;
  newVelocity+=config.impulse.xyz;
  newVelocity+=(randomDir*0.72+normalize(oldPosition+vec3f(0.001)))*config.impulse.w;
  newVelocity*=1.0-config.data.w;
  var newPosition=oldPosition+newVelocity*config.data.x;
  let distanceValue=length(newPosition);
  let limit=config.kernel.w-0.065;
  if (distanceValue>limit) {
    let wallNormal=newPosition/distanceValue;
    newPosition=wallNormal*limit;
    newVelocity-=max(dot(newVelocity,wallNormal),0.0)*1.35*wallNormal;
  }
  posOut[particleId]=vec4f(newPosition,1.0);
  velOut[particleId]=vec4f(newVelocity,0.0);
}
@compute @workgroup_size(64)
fn density(@builtin(global_invocation_id) gid: vec3u) {
  let particleId=gid.x;
  let total=u32(config.data.y);
  if (particleId>=total) { return; }
  let centerPos=posIn[particleId].xyz;
  let invSigmaSq=1.0/(config.kernel.x*config.kernel.x);
  let invRest=1.0/config.kernel.y;
  var numberDensity=1.0;
  var gradientSum=vec3f(0.0);
  var gradientNorm=0.0;
  for (var otherId=0u;otherId<total;otherId++) {
    if (otherId==particleId) { continue; }
    let diff=centerPos-posIn[otherId].xyz;
    let r2=dot(diff,diff);
    if (r2>=config.kernel.z*config.kernel.z) { continue; }
    let weightValue=gaussianWeight(r2);
    numberDensity+=weightValue;
    let gradValue=-diff*(invSigmaSq*weightValue*invRest);
    gradientSum+=gradValue;
    gradientNorm+=dot(gradValue,gradValue);
  }
  let constraintValue=max(numberDensity*invRest-1.0,0.0);
  lambdaValues[particleId]=-config.data.z*constraintValue/(gradientNorm+dot(gradientSum,gradientSum)+0.08);
}
@compute @workgroup_size(64)
fn project(@builtin(global_invocation_id) gid: vec3u) {
  let particleId=gid.x;
  let total=u32(config.data.y);
  if (particleId>=total) { return; }
  let centerPos=posIn[particleId].xyz;
  let lambdaI=lambdaValues[particleId];
  let invSigmaSq=1.0/(config.kernel.x*config.kernel.x);
  var correction=vec3f(0.0);
  for (var otherId=0u;otherId<total;otherId++) {
    if (otherId==particleId) { continue; }
    let diff=centerPos-posIn[otherId].xyz;
    let r2=dot(diff,diff);
    if (r2>=config.kernel.z*config.kernel.z) { continue; }
    let gradient=-diff*(invSigmaSq*gaussianWeight(r2));
    correction+=(lambdaI+lambdaValues[otherId])*gradient/config.kernel.y;
  }
  let correctionMagnitude=length(correction);
  if (correctionMagnitude>0.12) { correction*=0.12/correctionMagnitude; }
  posOut[particleId]=vec4f(tankBound(centerPos+correction),1.0);
}
@compute @workgroup_size(64)
fn finalize(@builtin(global_invocation_id) gid: vec3u) {
  let particleId=gid.x;
  if (particleId>=u32(config.data.y)) { return; }
  let solvedPos=posOut[particleId].xyz;
  var solvedVelocity=(solvedPos-posIn[particleId].xyz)/config.data.x;
  let velocityLength=length(solvedVelocity);
  if (velocityLength>10.0) { solvedVelocity*=10.0/velocityLength; }
  let tankNormal=normalize(solvedPos+vec3f(0.00001));
  if (length(solvedPos)>=config.kernel.w-0.067) {
    solvedVelocity-=max(dot(solvedVelocity,tankNormal),0.0)*1.35*tankNormal;
  }
  velOut[particleId]=vec4f(solvedVelocity,0.0);
}
