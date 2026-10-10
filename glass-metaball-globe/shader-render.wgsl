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
  let glassTravel=marchGlass(rayOrigin,rayDir,maxDistance);
  if(opaqueTravel>=0.0 && (glassTravel<0.0 || opaqueTravel<glassTravel)){
    let hitPos=rayOrigin+rayDir*opaqueTravel;
    let surface=metaField(hitPos);
    return lighting(hitPos,metaNormal(hitPos),-rayDir,surface.yzw);
  }
  if(glassTravel>=0.0){
    let glassEntry=rayOrigin+rayDir*glassTravel;
    let faceNormal=glassNormal(glassEntry);
    let entryCos=clamp(dot(faceNormal,-rayDir),0.0,1.0);
    var innerDir=refract(rayDir,faceNormal,1.0/1.48);
    if(length(innerDir)<.05){innerDir=reflect(rayDir,faceNormal);}
    let insideOrigin=glassEntry+innerDir*.015;
    let exitTravel=glassExit(insideOrigin,innerDir,5.1);
    var backColor=environment(innerDir);
    var thickness=.17;
    if(exitTravel>0.0){
      let glassBack=insideOrigin+innerDir*exitTravel;
      let backNormal=glassNormal(glassBack);
      var outwardDir=refract(innerDir,-backNormal,1.48);
      if(length(outwardDir)<.05){outwardDir=reflect(innerDir,-backNormal);}
      let afterOrigin=glassBack+outwardDir*.027;
      let behindTravel=marchMeta(afterOrigin,outwardDir,4.9);
      backColor=environment(outwardDir);
      if(behindTravel>=0.0){
        let opaquePos=afterOrigin+outwardDir*behindTravel;
        let pigment=metaField(opaquePos);
        backColor=lighting(opaquePos,metaNormal(opaquePos),-outwardDir,pigment.yzw);
      }
      thickness=exitTravel+.015;
    }
    let attenuation=exp(-vec3f(.16,.09,.035)*thickness);
    let fresnel=pow(1.0-entryCos,4.0);
    let keyDir=normalize(vec3f(-.62,.86,.72));
    let highlight=pow(max(dot(reflect(-keyDir,faceNormal),-rayDir),0.0),92.0);
    let secondary=pow(max(dot(reflect(-normalize(vec3f(.78,.18,-.64)),faceNormal),-rayDir),0.0),38.0);
    let shimmer=pow(max(dot(faceNormal,normalize(vec3f(.14,.9,.22))),0.0),4.0);
    let lens=backColor*attenuation*(.91-.42*fresnel);
    let refractiveRim=vec3f(.25,.77,1.0)*fresnel*1.55;
    return lens+refractiveRim+vec3f(1.0,.98,.9)*highlight*1.62+
      vec3f(.25,.66,.91)*secondary*.56+vec3f(.03,.085,.10)*shimmer;
  }
  return environment(rayDir)*.91+vec3f(.012,.020,.027);
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
