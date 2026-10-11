@fragment fn fragmentMain(input:Raster)->@location(0) vec4<f32>{
 let aspect=cfg.u0.x/max(1.0,cfg.u0.y);let uv=(input.uv*2.0-1.0)*vec2<f32>(aspect,1.0);
 let origin=cfg.u1.xyz;let initialDir=normalize(cfg.u2.xyz*uv.x+cfg.u3.xyz*uv.y+cfg.u4.xyz*1.95);
 var color=backgroundColor(initialDir);
 let hitShell=intersectBall(origin,initialDir,1.0);
 if(hitShell.y<=hitShell.x){return vec4<f32>(color,1.0);}
 let front=origin+initialDir*max(0.0,hitShell.x);
 let outerNormal=normalize(front);let cosine=max(0.0,dot(-initialDir,outerNormal));
 let shellFresnel=pow(1.0-cosine,4.0);let ior=cfg.u7.y;
 let glassDir=refract(initialDir,outerNormal,1.0/ior);
 var rayDir=initialDir;var enter=max(.0,hitShell.x);var exit=hitShell.y;
 if(dot(glassDir,glassDir)>.1){
  let fromGlass=front+glassDir*.002;let innerHit=intersectBall(fromGlass,glassDir,.964);
  if(innerHit.y>innerHit.x&&innerHit.x>0.0){
   let innerPoint=fromGlass+glassDir*innerHit.x;
   let refracted=refract(glassDir,normalize(innerPoint),ior);
   if(dot(refracted,refracted)>.01){rayDir=normalize(mix(initialDir,refracted,cfg.u7.z));}
   let innerCross=intersectBall(innerPoint+rayDir*.001,rayDir,.964);
   if(innerCross.y>0.0){enter=0.0;exit=innerCross.y;}
  }
 }
 var rayStart=front;var traceDir=rayDir;
 if(enter==0.0){
  let fromGlass=front+glassDir*.002;
  let innerHit=intersectBall(fromGlass,glassDir,.964);
  rayStart=fromGlass+glassDir*max(.0,innerHit.x)+traceDir*.001;
 }else{rayStart=origin;}
 var listing:array<u32,100>;
 let total=buildCandidates(rayStart,traceDir,&listing);
 let mode=u32(cfg.u7.x);let steps=u32(cfg.u9.z);let travel=max(.001,exit-enter);
 let delta=travel/max(1.0,f32(steps));
 var previous=0.0;var firstHit=false;var hitPoint=vec3<f32>(0.0);
 var cloud=vec3<f32>(0.0);var accumulated=0.0;
 for(var stepIdx:u32=0u;stepIdx<160u;stepIdx++){
  if(stepIdx>=steps){break;}
  let t=enter+delta*f32(stepIdx);
  let point=rayStart+traceDir*t;
  let density=densityField(point,&listing,total);
  if(mode==1u || mode==2u){
   let alpha=(1.0-exp(-density*cfg.u5.y*delta*3.8))*(1.0-accumulated);
   if(alpha>.002){let tone=fieldColor(point,&listing,total);cloud+=tone.rgb*alpha*(.35+cfg.u5.x*.8);}
   accumulated+=alpha;
  }
  if(mode!=1u && density>=cfg.u1.w && (stepIdx==0u||previous<cfg.u1.w)){
   var lower=t-delta;var upper=t;
   for(var refine:u32=0u;refine<5u;refine++){
    let middle=(lower+upper)*.5;
    if(densityField(rayStart+traceDir*middle,&listing,total)>=cfg.u1.w){upper=middle;}else{lower=middle;}
   }
   hitPoint=rayStart+traceDir*upper;firstHit=true;break;
  }
  previous=density;
  if(accumulated>.98){break;}
 }
 if(firstHit){
  let grad=fieldGradient(hitPoint,&listing,total);
  let outward=normalize(-grad+vec3<f32>(.00001,0.0,0.0));
  let angle=cfg.u9.x*cfg.u9.y;
  let lightDir=normalize(vec3<f32>(-.48+cos(angle)*.55,.7,sin(angle)*.6+.32));
  let diffusion=max(0.0,dot(outward,lightDir));
  let halfDir=normalize(lightDir-traceDir);let sharp=8.0+120.0*(1.0-cfg.u6.y)*(1.0-cfg.u6.y);
  let highlight=pow(max(0.0,dot(halfDir,outward)),sharp)*cfg.u6.z;
  let fresnel=pow(1.0-max(0.0,dot(outward,-traceDir)),3.5);
  let tint=fieldColor(hitPoint,&listing,total);
  let material=cfg.u6.w;
  var surface=tint.rgb*(.15+diffusion*1.35)+highlight*vec3<f32>(1.8,2.0,2.2);
  if(material>.5&&material<1.5){surface=mix(surface,vec3<f32>(.45,.78,1.0)*highlight+tint.rgb*.65, .65)+fresnel*vec3<f32>(.5,.8,1.1);}
  if(material>1.5){surface+=tint.rgb*(.6+fresnel*2.5);}
  surface+=tint.rgb*(cfg.u5.x*.28+tint.w*cfg.u8.w*.8)+fresnel*vec3<f32>(.30,.65,1.0);
  color=mix(color,surface,cfg.u3.w);
 }
 if(mode==1u){color=mix(color,cloud,clamp(accumulated,0.0,1.0));}
 if(mode==2u){color+=cloud*.23;}
 if(mode==3u){
   let point=rayStart+traceDir*travel*.5;
   let debugDensity=densityField(point,&listing,total);
   color+=vec3<f32>(debugDensity*.15,f32(total)*.01,.02);
   for(var i:u32=0u;i<100u;i++){if(i>=u32(cfg.u0.w)){break;}
    let center=bodies[i].center;let fromCenter=center-origin;
    let proj=dot(fromCenter,initialDir);let distance=length(cross(fromCenter,initialDir));
    if(proj>0.0){let radius=.014;let intensity=1.0-smoothstep(radius,radius+.012,distance);color=mix(color,vec3<f32>(1.5,.9,.3),intensity);}
   }
 }
 let ripple=rippleLight(outerNormal);
 let shellColor=mix(vec3<f32>(.18,.52,.7),vec3<f32>(.45,.72,1.0),cfg.u7.w);
 color+=shellColor*(shellFresnel*.95+(.035+max(0.0,ripple)*.6)*cfg.u5.z);
 let rim=pow(1.0-cosine,12.0);color+=rim*shellColor*.4;
 return vec4<f32>(max(color,vec3<f32>(0.0)),1.0);
}
