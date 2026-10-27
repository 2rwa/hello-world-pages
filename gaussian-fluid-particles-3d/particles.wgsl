// Independently simulated 3D water droplets and buoyant air bubbles.
// 0..767 underwater bubbles, 768..1535 ballistic spray droplets.
const COUNT:u32=1536u;
const HALF:u32=768u;
const WORLD:f32=48.0;
struct Particle3D{
  positionAge:vec4f,  // world X/Y/Z, age in seconds
  velocityLife:vec4f, // velocity X/Y/Z, lifespan seconds
  sizeSeed:vec4f,     // radius meters, kind(0=bubble,1=spray), seed, spawn strength
  aux:vec4f,          // spare
};
struct Params{
  step:vec4f,
  view:vec4f,
  lighting:vec4f,
  tap:vec4f,
  resolution:vec4f,
};
@group(0) @binding(0) var<storage,read_write> droplets:array<Particle3D>;
@group(0) @binding(1) var<storage,read> foamState:array<vec4f>;
@group(0) @binding(2) var<storage,read> waterState:array<vec4f>;
@group(0) @binding(3) var<uniform> params:Params;
@group(0) @binding(4) var<uniform> particleSettings:vec4f; // bubble amount, spray amount, size, buoyancy
fn hash32(value:u32)->u32{
  var bits=value;
  bits=(bits^(bits>>16u))*0x7feb352du;
  bits=(bits^(bits>>15u))*0x846ca68bu;
  return bits^(bits>>16u);
}
fn randomSeed(value:u32)->f32{
  return f32(hash32(value))/4294967295.0;
}
fn randomFor(index:u32,salt:u32)->f32{
  return randomSeed(index*1664525u+salt*1013904223u);
}
fn wrapCoord(value:i32)->u32{
  return u32((value+160)%160);
}
fn fluidAt(worldXZ:vec2f)->vec4f{
  let coord=vec2u(floor(fract(worldXZ/WORLD+vec2f(0.5))*160.0));
  return waterState[coord.x+coord.y*160u];
}
fn foamAt(worldXZ:vec2f)->vec4f{
  let coord=vec2u(floor(fract(worldXZ/WORLD+vec2f(0.5))*160.0));
  return foamState[coord.x+coord.y*160u];
}
fn swellAt(worldXZ:vec2f)->f32{
  let time=params.step.x;
  let amplitude=params.lighting.z;
  let waveA=sin(worldXZ.x*0.19+worldXZ.y*0.27-time*0.80);
  let waveB=sin(worldXZ.x*0.44-worldXZ.y*0.15+time*1.15);
  let waveC=sin(worldXZ.x*1.17+worldXZ.y*0.68-time*2.45);
  let longWave=sin(worldXZ.y*0.061+worldXZ.x*0.046-time*0.37);
  return amplitude*(waveA*0.25+waveB*0.10+waveC*0.035+longWave*0.42);
}
fn surfaceAt(worldXZ:vec2f)->f32{
  return fluidAt(worldXZ).x*0.75+swellAt(worldXZ);
}
fn initialParticle(index:u32,roundNumber:u32)->Particle3D{
  let salt=roundNumber*37u+index;
  let phase=randomFor(salt,10u);
  let side=(randomFor(salt,13u)-0.5)*2.0;
  let distance=3.5+randomFor(salt,21u)*23.0;
  let yaw=params.view.y;
  let direction=vec2f(-sin(yaw),-cos(yaw));
  let lateral=vec2f(cos(yaw),-sin(yaw));
  var xz=direction*distance+lateral*side*(3.0+distance*0.55);
  // Prefer compression + fresh foam when choosing a spawn site.
  var evidence=-1.0;
  for(var attempt=0u;attempt<6u;attempt++){
    let nextDistance=3.0+randomFor(salt,100u+attempt*7u)*24.0;
    let nextSide=(randomFor(salt,101u+attempt*7u)-0.5)*2.0;
    let candidate=direction*nextDistance+lateral*nextSide*(3.0+nextDistance*0.55);
    let score=foamAt(candidate).y+foamAt(candidate).x*0.55;
    if(score>evidence){evidence=score;xz=candidate;}
  }
  let localWater=surfaceAt(xz);
  let fluid=fluidAt(xz);
  let bubble=select(false,true,index<HALF);
  let lifetime=select(1.10+randomFor(salt,4u)*1.40,
                      1.9+randomFor(salt,4u)*3.5,bubble);
  let radius=select(0.045+pow(randomFor(salt,15u),2.0)*0.085,
                    0.075+pow(randomFor(salt,15u),2.0)*0.185,bubble);
  let visibleEvidence=clamp(evidence*0.7+0.38,0.12,1.0);
  let spawnRate=select(particleSettings.y,particleSettings.x,bubble);
  // Deterministic thinning; inactive particles remain offscreen.
  let enabled=randomFor(index,700u)<min(1.0,spawnRate*0.68)*visibleEvidence;
  var initialAge=-phase*lifetime;
  var initialHeight=localWater+0.10;
  var initialVelocity=vec3f(fluid.y*0.24,2.0,fluid.z*0.24);
  if(bubble){
    initialHeight=localWater-(0.14+randomFor(salt,49u)*1.65);
    initialVelocity=vec3f(fluid.y*0.18,0.22+randomFor(salt,50u)*0.42,fluid.z*0.18);
  }else{
    let launchSpeed=(2.3+randomFor(salt,60u)*3.4)*particleSettings.w;
    initialVelocity=vec3f((randomFor(salt,61u)-0.5)*2.4+fluid.y*0.2,
                          launchSpeed,
                          (randomFor(salt,62u)-0.5)*2.4+fluid.z*0.2);
  }
  if(!enabled){initialAge=-lifetime*2.0;}
  var emitted:Particle3D;
  emitted.positionAge=vec4f(xz.x,initialHeight,xz.y,initialAge);
  emitted.velocityLife=vec4f(initialVelocity,lifetime);
  emitted.sizeSeed=vec4f(radius*particleSettings.z,select(1.0,0.0,bubble),
                         randomFor(salt,75u),visibleEvidence);
  emitted.aux=vec4f(0.0);
  return emitted;
}
@compute @workgroup_size(64)
fn updateParticles(@builtin(global_invocation_id) gid:vec3u){
  let idx=gid.x;
  if(idx>=COUNT){return;}
  let dt=clamp(params.step.y,0.0,0.04);
  let firstFrame=droplets[idx].velocityLife.w<=0.0;
  var item=droplets[idx];
  if(firstFrame){item=initialParticle(idx,0u);}
  var age=item.positionAge.w+dt;
  let currentKind=item.sizeSeed.y;
  let activeAmount=select(particleSettings.x,particleSettings.y,currentKind>0.5);
  if(age>item.velocityLife.w || (!firstFrame && age<-item.velocityLife.w*1.6)){
    let epoch=u32(floor(params.step.x*0.37))+u32(params.step.x*0.19)+2u;
    item=initialParticle(idx,epoch);
    age=item.positionAge.w+dt;
  }
  if(age>=0.0 && activeAmount>0.005){
    var position=item.positionAge.xyz;
    var velocity=item.velocityLife.xyz;
    let waterHeight=surfaceAt(position.xz);
    let localFluid=fluidAt(position.xz);
    if(currentKind<0.5){
      // Bubble buoyancy increases with radius; ambient flow supplies drift.
      let lift=(0.75+item.sizeSeed.x*2.6)*particleSettings.w;
      velocity.y=velocity.y+(lift-velocity.y*0.45)*dt;
      velocity.x=mix(velocity.x,localFluid.y*0.34,clamp(dt*1.3,0.0,1.0));
      velocity.z=mix(velocity.z,localFluid.z*0.34,clamp(dt*1.3,0.0,1.0));
      let orbital=vec2f(sin(params.step.x*3.0+item.sizeSeed.z*6.0),
                        cos(params.step.x*2.5+item.sizeSeed.z*5.0))*0.12;
      position.xz=position.xz+(velocity.xz+orbital)*dt;
      position.y=position.y+velocity.y*dt;
      if(position.y>=waterHeight-0.045){age=item.velocityLife.w+0.01;}
    }else{
      velocity.y=velocity.y-9.81*dt;
      let wind=vec3f(0.20*params.step.w,0.0,0.09*params.step.w);
      velocity=mix(velocity,wind,clamp(dt*0.55,0.0,0.8));
      position=position+velocity*dt;
      if(position.y<=waterHeight-0.025){age=item.velocityLife.w+0.01;}
    }
    item.positionAge=vec4f(position,age);
    item.velocityLife=vec4f(velocity,item.velocityLife.w);
  }else{
    item.positionAge.w=age;
  }
  droplets[idx]=item;
}
