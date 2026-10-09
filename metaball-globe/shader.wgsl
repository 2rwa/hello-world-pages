struct Simulation {
  viewport: vec4f,
  camera: vec4f,
  controls: vec4f,
  balls: array<vec4f,16>,
  tints: array<vec4f,16>,
};
@group(0) @binding(0) var<uniform> sim: Simulation;

@vertex fn vs(@builtin(vertex_index) vertexIndex:u32)->@builtin(position) vec4f {
  var corners=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  return vec4f(corners[vertexIndex],0.0,1.0);
}
fn roots(rayOrigin:vec3f, rayDir:vec3f, centerPos:vec3f, sphereRadius:f32)->vec2f {
  let offset=rayOrigin-centerPos;
  let halfB=dot(offset,rayDir);
  let discriminant=halfB*halfB-dot(offset,offset)+sphereRadius*sphereRadius;
  if(discriminant<0.0){return vec2f(-1.0,-1.0);}
  let root=sqrt(discriminant);
  return vec2f(-halfB-root,-halfB+root);
}
fn smoothMinimum(d1:f32,d2:f32,smoothingWidth:f32)->f32 {
  let mixAmount=max(smoothingWidth-abs(d1-d2),0.0)/smoothingWidth;
  return min(d1,d2)-mixAmount*mixAmount*smoothingWidth*0.25;
}
fn metaField(samplePos:vec3f)->vec4f {
  var minDist=10.0;
  var colorSum=vec3f(0.0);
  var weightSum=0.0;
  let smoothWidth=max(sim.controls.x,0.001);
  for(var i=0u;i<16u;i++){
    if(f32(i)>=sim.controls.y){break;}
    let particle=sim.balls[i];
    if(sim.tints[i].w>0.5 || particle.w<0.001){continue;}
    let dist=length(samplePos-particle.xyz)-particle.w;
    minDist=smoothMinimum(minDist,dist,smoothWidth);
    let weight=1.0/pow(0.09+abs(dist),3.0);
    colorSum+=sim.tints[i].xyz*weight;
    weightSum+=weight;
  }
  return vec4f(minDist,colorSum/max(weightSum,0.00001));
}
fn marchMeta(rayOrigin:vec3f,rayDir:vec3f,maxDistance:f32)->f32 {
  var travel=0.0;
  for(var stepIndex=0;stepIndex<104;stepIndex++){
    let dist=metaField(rayOrigin+rayDir*travel).x;
    if(dist<0.006){return travel;}
    travel+=clamp(dist*0.72,0.008,0.16);
    if(travel>maxDistance){break;}
  }
  return -1.0;
}
fn glassHit(rayOrigin:vec3f,rayDir:vec3f,maxDistance:f32)->vec2f {
  var nearest=maxDistance;
  var picked=-1.0;
  for(var i=0u;i<16u;i++){
    if(f32(i)>=sim.controls.y){break;}
    if(sim.tints[i].w<0.5){continue;}
    let result=roots(rayOrigin,rayDir,sim.balls[i].xyz,sim.balls[i].w);
    if(result.x>0.009 && result.x<nearest){nearest=result.x;picked=f32(i);}
  }
  return vec2f(nearest,picked);
}
fn metaNormal(surfacePos:vec3f)->vec3f {
  let eps=0.010;
  return normalize(vec3f(
    metaField(surfacePos+vec3f(eps,0.0,0.0)).x-metaField(surfacePos-vec3f(eps,0.0,0.0)).x,
    metaField(surfacePos+vec3f(0.0,eps,0.0)).x-metaField(surfacePos-vec3f(0.0,eps,0.0)).x,
    metaField(surfacePos+vec3f(0.0,0.0,eps)).x-metaField(surfacePos-vec3f(0.0,0.0,eps)).x));
}
fn lighting(surfacePos:vec3f,surfaceNormal:vec3f,viewDir:vec3f,baseColor:vec3f)->vec3f {
  let keyLight=normalize(vec3f(-0.65,0.94,0.75));
  let rimLight=normalize(vec3f(0.8,0.35,-0.85));
  let diffuseA=max(dot(surfaceNormal,keyLight),0.0);
  let diffuseB=max(dot(surfaceNormal,rimLight),0.0);
  let halfway=normalize(keyLight+viewDir);
  let spec=pow(max(dot(surfaceNormal,halfway),0.0),72.0);
  let specB=pow(max(dot(reflect(-rimLight,surfaceNormal),viewDir),0.0),24.0);
  let fresnel=pow(1.0-max(dot(surfaceNormal,viewDir),0.0),4.0);
  let diffuse=baseColor*(0.22+1.11*diffuseA+0.37*diffuseB);
  return diffuse+vec3f(1.0,0.94,0.88)*spec*1.45+
    vec3f(0.30,0.82,0.94)*specB*0.46+baseColor*fresnel*0.57;
}
fn environment(rayDir:vec3f)->vec3f {
  let horizon=clamp(rayDir.y*0.5+0.5,0.0,1.0);
  var sky=mix(vec3f(0.018,0.043,0.077),vec3f(0.046,0.089,0.14),horizon);
  let studioStripe=pow(max(dot(rayDir,normalize(vec3f(-0.57,0.78,-0.36))),0.0),22.0);
  sky+=vec3f(.19,.34,.4)*studioStripe;
  return sky;
}
fn background(rayOrigin:vec3f,rayDir:vec3f)->vec3f {
  var color=environment(rayDir);
  // Studio platform, fine grid, and luminous rings below the suspended globe.
  if(rayDir.y < -0.001){
    let distanceToPlane=(-2.72-rayOrigin.y)/rayDir.y;
    if(distanceToPlane>0.0){
      let hit=rayOrigin+rayDir*distanceToPlane;
      let radial=length(hit.xz);
      let fade=exp(-radial*0.14);
      let lines=min(abs(fract(hit.x*0.75)-0.5),abs(fract(hit.z*0.75)-0.5));
      let gridline=1.0-smoothstep(0.01,0.022,lines);
      let ring1=exp(-pow((radial-2.84)*14.0,2.0));
      let ring2=exp(-pow((radial-3.45)*8.0,2.0));
      let floorTint=vec3f(0.015,0.036,0.063)+vec3f(0.012,0.029,0.040)*gridline*fade;
      color=mix(color,floorTint,0.88);
      color+=vec3f(0.065,0.55,0.60)*(ring1*0.50+ring2*0.20)*fade;
      color+=vec3f(0.08,0.25,0.34)*exp(-radial*1.05)*0.33;
    }
  }
  return color;
}
fn drawInterior(rayOrigin:vec3f,rayDir:vec3f,maxDistance:f32)->vec3f {
  let opaqueTravel=marchMeta(rayOrigin,rayDir,maxDistance);
  let transparentHit=glassHit(rayOrigin,rayDir,maxDistance);
  if(opaqueTravel>=0.0 && opaqueTravel<transparentHit.x){
    let samplePos=rayOrigin+rayDir*opaqueTravel;
    let field=metaField(samplePos);
    return lighting(samplePos,metaNormal(samplePos),-rayDir,field.yzw);
  }
  if(transparentHit.y>=0.0){
    let beadIndex=u32(transparentHit.y);
    let bead=sim.balls[beadIndex];
    let entryPos=rayOrigin+rayDir*transparentHit.x;
    let frontNormal=normalize(entryPos-bead.xyz);
    let eta=1.0/1.47;
    var insideRay=refract(rayDir,frontNormal,eta);
    if(length(insideRay)<0.01){insideRay=reflect(rayDir,frontNormal);}
    let exitRange=roots(entryPos+insideRay*0.008,insideRay,bead.xyz,bead.w);
    let exitPos=entryPos+insideRay*(max(exitRange.y,0.01)+0.008);
    let rearNormal=normalize(exitPos-bead.xyz);
    var throughRay=refract(insideRay,-rearNormal,1.47);
    if(length(throughRay)<0.01){throughRay=reflect(insideRay,-rearNormal);}
    let afterPos=exitPos+throughRay*0.016;
    let opaqueBehind=marchMeta(afterPos,throughRay,5.1);
    var throughColor=environment(throughRay);
    if(opaqueBehind>=0.0){
      let surfacePos=afterPos+throughRay*opaqueBehind;
      let field=metaField(surfacePos);
      throughColor=lighting(surfacePos,metaNormal(surfacePos),-throughRay,field.yzw);
    }
    let lensThickness=length(exitPos-entryPos);
    let tinted=throughColor*exp(-vec3f(0.16,0.055,0.025)*lensThickness);
    let fresnel=pow(1.0-clamp(dot(frontNormal,-rayDir),0.0,1.0),3.0);
    let upper=pow(max(dot(reflect(-normalize(vec3f(-0.5,0.8,0.7)),frontNormal),-rayDir),0.0),55.0);
    let coolRim=vec3f(.32,.78,1.0)*fresnel*0.95;
    return tinted*(0.85-0.36*fresnel)+coolRim+vec3f(1.0,1.0,.94)*upper*1.25;
  }
  return environment(rayDir)*0.91+vec3f(.012,.020,.027);
}
@fragment fn fs(@builtin(position) fragPos:vec4f)->@location(0) vec4f {
  let res=sim.viewport.xy;
  let screenPos=vec2f((fragPos.x-res.x*0.5)/res.y*2.0,(res.y*0.5-fragPos.y)/res.y*2.0);
  let azimuth=sim.camera.x;
  let elevation=sim.camera.y;
  let eye=vec3f(sin(azimuth)*cos(elevation),sin(elevation),cos(azimuth)*cos(elevation))*7.65*sim.camera.z;
  let forward=normalize(-eye);
  let right=normalize(cross(forward,vec3f(0.0,1.0,0.0)));
  let cameraUp=normalize(cross(right,forward));
  let rayDir=normalize(forward*2.13+right*screenPos.x+cameraUp*screenPos.y);
  var col=background(eye,rayDir);
  let sphere=roots(eye,rayDir,vec3f(0.0),sim.camera.w);
  if(sphere.x>0.0){
    let entryPos=eye+rayDir*sphere.x;
    let outerNormal=normalize(entryPos);
    var innerRay=refract(rayDir,outerNormal,1.0/1.13);
    if(length(innerRay)<0.01){innerRay=reflect(rayDir,outerNormal);}
    let cavity=roots(entryPos+innerRay*.003,innerRay,vec3f(0.0),2.41);
    var interior=environment(innerRay);
    if(cavity.y>0.0 && cavity.x>=0.0){
      let originInside=entryPos+innerRay*(cavity.x+.008);
      let maxTravel=max(.0,cavity.y-cavity.x-.012);
      interior=drawInterior(originInside,innerRay,maxTravel);
    }
    let incidence=clamp(dot(outerNormal,-rayDir),0.0,1.0);
    let edgeFresnel=pow(1.0-incidence,4.0);
    let edgeLight=pow(max(dot(reflect(-normalize(vec3f(-.55,.84,.64)),outerNormal),-rayDir),0.0),65.0);
    let stripe=pow(max(dot(outerNormal,normalize(vec3f(-.76,.30,.56))),0.0),17.0);
    let backGlow=pow(1.0-abs(dot(outerNormal,-rayDir)),5.0);
    col=interior*(0.92-0.40*edgeFresnel)+vec3f(.34,.69,.91)*edgeFresnel*.94;
    col+=vec3f(.98,.98,1.0)*edgeLight*1.75+vec3f(.16,.42,.63)*stripe*.13;
    col+=vec3f(.18,.56,.56)*backGlow*.14;
  }
  col=col/(vec3f(1.0)+col*0.53);
  col=pow(max(col,vec3f(0.0)),vec3f(0.89));
  let vignette=1.0-0.19*smoothstep(0.25,2.1,length(screenPos));
  return vec4f(col*vignette,1.0);
}
