struct Ctrl { a:vec4<f32>, b:vec4<f32>, c:vec4<f32>, d:vec4<f32> };
@group(0) @binding(0) var<uniform> ctrl:Ctrl;
// a=time, width, height, camera distance; b=yaw, pitch, blend, motion
// c=arm count, glow, march steps, material mode
fn sdSphere(p:vec3<f32>,r:f32)->f32{return length(p)-r;}
fn sdCapsule(p:vec3<f32>,a:vec3<f32>,b:vec3<f32>,r:f32)->f32{
 let segment=b-a;
 let fraction=clamp(dot(p-a,segment)/max(dot(segment,segment),.00001),0.,1.);
 return length(p-a-segment*fraction)-r;
}
fn sdTorus(p:vec3<f32>,rad:vec2<f32>)->f32{
 return length(vec2<f32>(length(p.xz)-rad.x,p.y))-rad.y;
}
fn sdRoundBox(p:vec3<f32>,extent:vec3<f32>,rad:f32)->f32{
 let q=abs(p)-extent;return length(max(q,vec3<f32>(0.)))+min(max(q.x,max(q.y,q.z)),0.)-rad;
}
fn smoothUnion(a:f32,b:f32,k:f32)->f32{
 let h=clamp(.5+.5*(b-a)/max(k,.01),0.,1.);
 return mix(b,a,h)-k*h*(1.-h);
}
fn nearest(oldHit:vec2<f32>,dist:f32,matId:f32)->vec2<f32>{
 return select(oldHit,vec2<f32>(dist,matId),dist<oldHit.x);
}
fn rotate2(p:vec2<f32>,angle:f32)->vec2<f32>{
 let sn=sin(angle);let cs=cos(angle);
 return vec2<f32>(p.x*cs-p.y*sn,p.x*sn+p.y*cs);
}
fn localPosition(worldPos:vec3<f32>)->vec3<f32>{
 var p=worldPos;
 p.y-=sin(ctrl.a.x*1.13)*.055*ctrl.b.w;
 p.xz=rotate2(p.xz,.08*sin(ctrl.a.x*.61)*ctrl.b.w);
 return p;
}
fn tipPosition(i:i32,n:i32)->vec3<f32>{
 let angle=6.2831853*f32(i)/f32(n)+.18;
 let w=ctrl.b.w*sin(ctrl.a.x*1.47+f32(i)*1.83);
 return vec3<f32>(1.66*cos(angle+.17*w),1.66*sin(angle+.17*w),.07+.24*sin(ctrl.a.x*1.1+f32(i))*ctrl.b.w);
}
fn bodyDistance(p:vec3<f32>)->f32{
 let k=ctrl.b.z;
 var d=sdSphere(p,.64);
 d=smoothUnion(d,sdSphere(p-vec3<f32>(-.27,.18,-.12),.46),k);
 d=smoothUnion(d,sdSphere(p-vec3<f32>(.31,-.13,-.19),.43),k);
 d=smoothUnion(d,sdSphere(p-vec3<f32>(0.,.07,.31),.39),k);
 let count=i32(clamp(round(ctrl.c.x),3.,7.));
 for(var i:i32=0;i<7;i++){
  if(i>=count){break;}
  let angle=6.2831853*f32(i)/f32(count)+.18;
  let wave=ctrl.b.w*sin(ctrl.a.x*1.47+f32(i)*1.83);
  let rootPos=vec3<f32>(.43*cos(angle),.43*sin(angle),-.07);
  let midPos=vec3<f32>(1.02*cos(angle+.1*wave),1.02*sin(angle+.1*wave),.05+.18*wave);
  let tipPos=tipPosition(i,count);
  d=smoothUnion(d,sdCapsule(p,rootPos,midPos,.205),k*.78);
  d=smoothUnion(d,sdCapsule(p,midPos,tipPos,.138),k*.68);
  d=smoothUnion(d,sdSphere(p-tipPos,.247),k*.6);
 }
 return d;
}
fn modelMap(worldPos:vec3<f32>)->vec2<f32>{
 let p=localPosition(worldPos);
 if(length(p)>2.75){return vec2<f32>(length(p)-2.60,1.);}
 var hit=vec2<f32>(bodyDistance(p),1.);
 let front=p-vec3<f32>(0.,0.,.69);
 hit=nearest(hit,sdTorus(vec3<f32>(front.x,front.z,front.y),vec2<f32>(.41,.055)),2.);
 hit=nearest(hit,sdSphere(p-vec3<f32>(0.,0.,.79),.115),3.);
 for(var j:i32=0;j<3;j++){
  let angle=6.2831853*f32(j)/3.+.45;
  let pos=vec3<f32>(.45*cos(angle),.45*sin(angle),.52);
  hit=nearest(hit,sdRoundBox(p-pos,vec3<f32>(.17,.075,.055),.043),4.);
 }
 let count=i32(clamp(round(ctrl.c.x),3.,7.));
 for(var i:i32=0;i<7;i++){
  if(i>=count){break;}
  let tip=tipPosition(i,count);
  let q=p-tip-vec3<f32>(0.,0.,.25);
  hit=nearest(hit,sdTorus(vec3<f32>(q.x,q.z,q.y),vec2<f32>(.185,.044)),2.);
  hit=nearest(hit,sdSphere(p-tip-vec3<f32>(0.,0.,.26),.096),3.);
 }
 return hit;
}
fn surfaceNormal(p:vec3<f32>)->vec3<f32>{
 let e=.0018;
 let v0=vec3<f32>(1.,-1.,-1.)*e;let v1=vec3<f32>(-1.,-1.,1.)*e;
 let v2=vec3<f32>(-1.,1.,-1.)*e;let v3=vec3<f32>(1.,1.,1.)*e;
 return normalize(v0*modelMap(p+v0).x+v1*modelMap(p+v1).x+v2*modelMap(p+v2).x+v3*modelMap(p+v3).x);
}
fn noise2(p:vec2<f32>)->f32{return fract(sin(dot(p,vec2<f32>(127.1,311.7)))*43758.5453);}
fn backdrop(rd:vec3<f32>)->vec3<f32>{
 let gradient=clamp(rd.y*.5+.5,0.,1.);
 let sky=mix(vec3<f32>(.007,.018,.042),vec3<f32>(.023,.058,.092),gradient);
 let loc=vec2<f32>(atan2(rd.x,rd.z)*147.,rd.y*179.);
 let spot=select(0.,1.,noise2(floor(loc))>.993);
 return sky+vec3<f32>(.38,.66,.75)*spot*(1.-smoothstep(.02,.085,length(fract(loc)-vec2<f32>(.5))));
}
fn glowingCore(pos:vec3<f32>,rd:vec3<f32>)->vec3<f32>{
 let center=vec3<f32>(0.,sin(ctrl.a.x*1.13)*.055*ctrl.b.w,0.);
 let rel=pos+rd*.015-center;
 let projection=dot(rel,rd);
 let discriminant=projection*projection-dot(rel,rel)+.31*.31;
 let alignment=length(cross(rel,rd));
 var source=exp(-alignment*alignment*7.)*.23*vec3<f32>(.05,.74,1.1);
 if(discriminant>0.){
  let hitT=-projection-sqrt(discriminant);
  if(hitT>0.&&hitT<3.){
   let corePos=rel+rd*hitT;
   let bands=.5+.5*sin(corePos.y*29.+sin(corePos.x*22.)*1.8+ctrl.a.x*3.);
   source+=vec3<f32>(.18,1.7,2.65)*(.58+.42*bands);
   source+=vec3<f32>(.76,1.4,2.3)*pow(1.-abs(dot(normalize(corePos),rd)),3.);
  }
 }
 return source*ctrl.c.y;
}
fn shade(pos:vec3<f32>,rd:vec3<f32>,material:f32,travel:f32)->vec3<f32>{
 let n=surfaceNormal(pos);
 if(ctrl.c.w>1.5){return n*.5+vec3<f32>(.5);}
 let light=normalize(vec3<f32>(-.48,.83,.76));
 let diffuse=max(dot(n,light),0.);
 let specular=pow(max(dot(reflect(rd,n),light),0.),44.);
 let edge=pow(1.-clamp(dot(n,-rd),0.,1.),4.);
 var color=vec3<f32>(.08,.3,.46)*(.3+.8*diffuse);
 if(material<1.5){
  if(ctrl.c.w<.5){
   let refr=refract(rd,n,1./1.24);
   let innerDir=select(rd,refr,length(refr)>.01);
   color=mix(backdrop(normalize(innerDir)),vec3<f32>(.035,.34,.46)*(.4+.6*diffuse),.30+edge*.58);
   color+=glowingCore(pos,innerDir)*(.68+.25*(1.-edge));
   color+=edge*vec3<f32>(.20,.78,1.16);
  }else{
   color=vec3<f32>(.055,.30,.48)*(.42+diffuse*.76)+edge*vec3<f32>(.18,.81,1.05);
  }
 }else if(material<2.5){
  color=vec3<f32>(.73,.87,.96)*(.28+.74*diffuse);
 }else if(material<3.5){
  color=vec3<f32>(.10,.84,1.28)*(1.2+ctrl.c.y*1.2);
 }else{
  color=vec3<f32>(.09,.16,.24)*(.27+.74*diffuse);
 }
 color+=vec3<f32>(.62,.85,1.)*specular*.85;
 return mix(color,backdrop(rd),clamp(travel*.006,0.,.14));
}
@vertex fn vertexMain(@builtin(vertex_index) index:u32)->@builtin(position) vec4<f32>{
 let corners=array<vec2<f32>,3>(vec2<f32>(-1.,-1.),vec2<f32>(3.,-1.),vec2<f32>(-1.,3.));
 return vec4<f32>(corners[index],0.,1.);
}
@fragment fn fragmentMain(@builtin(position) frag:vec4<f32>)->@location(0) vec4<f32>{
 let dims=ctrl.a.yz;
 let uv=vec2<f32>((frag.x/dims.x*2.-1.)*dims.x/dims.y,1.-frag.y/dims.y*2.);
 let yaw=ctrl.b.x;let pitch=ctrl.b.y;
 let camera=vec3<f32>(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch))*ctrl.a.w;
 let forward=normalize(-camera);let right=normalize(cross(forward,vec3<f32>(0.,1.,0.)));
 let upward=cross(right,forward);
 let rd=normalize(forward*1.96+right*uv.x+upward*uv.y);
 var distanceAlong=0.;var material=1.;var found=false;
 for(var i:i32=0;i<112;i++){
  if(i>=i32(ctrl.c.z)){break;}
  let nearest=modelMap(camera+rd*distanceAlong);
  if(nearest.x<.0018){found=true;material=nearest.y;break;}
  distanceAlong+=max(.0035,nearest.x*.73);
  if(distanceAlong>16.){break;}
 }
 var color=backdrop(rd);
 if(found){color=shade(camera+rd*distanceAlong,rd,material,distanceAlong);}
 color*=1.-.24*smoothstep(.5,2.25,length(uv));
 color=color/(color+vec3<f32>(1.));
 return vec4<f32>(pow(color,vec3<f32>(.86)),1.);
}