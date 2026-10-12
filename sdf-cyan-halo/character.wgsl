struct Uniforms {
 camera: vec4f,
 lookAt: vec4f,
 view: vec4f,
 env: vec4f,
};
struct Shape {
 a: vec4f,
 b: vec4f,
 c: vec4f,
 d: vec4f,
};
struct Shapes { items: array<Shape,128>, };
@group(0) @binding(0) var<uniform> cfg: Uniforms;
@group(0) @binding(1) var<storage,read> shapes: Shapes;
struct VertexOut { @builtin(position) position: vec4f, };
@vertex fn vertexMain(@builtin(vertex_index) index:u32)->VertexOut {
 var out:VertexOut;
 let pts=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));
 out.position=vec4f(pts[index],0.,1.);
 return out;
}
fn boxLocal(point:vec3f,quat:vec4f)->vec3f {
 let v=-quat.xyz;
 let twice=2.*cross(v,point);
 return point+quat.w*twice+cross(v,twice);
}
fn shapeDistance(position:vec3f,s:Shape)->f32 {
 let point=position-s.a.xyz;
 let kind=i32(s.c.x);
 if(kind==0){return length(point)-s.a.w;}
 if(kind==1){
  let segment=s.b.xyz-s.a.xyz;
  let f=clamp(dot(point,segment)/max(dot(segment,segment),.00000001),0.,1.);
  return length(point-segment*f)-s.a.w;
 }
 if(kind==2){
  let axial=dot(point,s.b.xyz);
  let radial=length(point-axial*s.b.xyz);
  return length(vec2f(radial-s.a.w,axial))-s.b.w;
 }
 let q=abs(boxLocal(point,s.d))-s.b.xyz;
 return length(max(q,vec3f(0.)))+min(max(q.x,max(q.y,q.z)),0.)-s.a.w;
}
fn modelDistance(position:vec3f)->vec2f {
 var best=1e5;
 var material=0.;
 for(var i:i32=0;i<128;i=i+1){
  if(i>=i32(cfg.view.z)){break;}
  let item=shapes.items[i];
  let sd=shapeDistance(position,item);
  if(sd<best){best=sd;material=item.c.y;}
 }
 return vec2f(best,material);
}
fn boundingRay(origin:vec3f,direction:vec3f)->vec2f {
 let delta=origin-vec3f(0.,.12,0.);
 let proj=dot(delta,direction);
 let discr=proj*proj-dot(delta,delta)+7.3;
 if(discr<0.){return vec2f(-1.,-1.);}
 return vec2f(-proj-sqrt(discr),-proj+sqrt(discr));
}
fn normalAt(point:vec3f)->vec3f {
 let e=.0018;
 let u=vec3f(1.,-1.,-1.);
 let v=vec3f(-1.,-1.,1.);
 let w=vec3f(-1.,1.,-1.);
 let t=vec3f(1.,1.,1.);
 return normalize(
 u*modelDistance(point+u*e).x+
 v*modelDistance(point+v*e).x+
 w*modelDistance(point+w*e).x+
 t*modelDistance(point+t*e).x
 );
}
fn ambientOcclusion(point:vec3f,normal:vec3f)->f32 {
 var occ=0.;
 var att=1.;
 for(var j:i32=0;j<3;j=j+1){
  let h=.045+f32(j)*.085;
  occ=occ+(h-modelDistance(point+h*normal).x)*att;
  att=att*.65;
 }
 return clamp(1.-occ*2.1,.45,1.);
}
fn skyColor(direction:vec3f)->vec3f {
 let h=clamp(direction.y*.5+.5,0.,1.);
 let upper=mix(vec3f(.008,.021,.039),vec3f(.040,.076,.105),h);
 let band=pow(max(dot(direction,normalize(vec3f(-.6,.65,-.4))),0.),35.);
 return upper+vec3f(.13,.18,.21)*band;
}
fn palette(mid:i32)->vec3f {
 if(mid==1){return vec3f(.18,.24,.29);}
 if(mid==2){return vec3f(.016,.9,1.);}
 if(mid==3){return vec3f(.045,.071,.088);}
 if(mid==4){return vec3f(.44,.54,.57);}
 return vec3f(.77,.83,.84);
}
fn metalShade(position:vec3f,normal:vec3f,viewDirection:vec3f,mid:i32)->vec3f {
 let base=palette(mid);
 let lightA=normalize(vec3f(-.53,.71,.62));
 let lightB=normalize(vec3f(.69,.30,-.61));
 let hemi=.33+.36*normal.y;
 let direct=max(dot(normal,lightA),0.);
 let bounce=max(dot(normal,lightB),0.);
 let reflected=reflect(-viewDirection,normal);
 let panelA=pow(max(dot(reflected,normalize(vec3f(-.46,.88,.3))),0.),17.);
 let panelB=pow(max(dot(reflected,normalize(vec3f(.84,.26,-.48))),0.),28.);
 let edge=pow(1.-clamp(dot(normal,viewDirection),0.,1.),4.);
 let rough=clamp(cfg.env.y,.06,1.);
 let highlightA=pow(max(dot(normal,normalize(lightA+viewDirection)),0.),120./(1.+12.*rough));
 let highlightB=pow(max(dot(normal,normalize(lightB+viewDirection)),0.),70./(1.+10.*rough));
 let ao=ambientOcclusion(position,normal);
 let env=skyColor(reflected)*(.45+.38*edge);
 var result=base*(.10+hemi*.35+direct*.60+bounce*.22)*ao;
 result=result+env*(.5+.3*edge)+vec3f(1.,.97,.91)*(panelA*.8+highlightA*.9);
 result=result+vec3f(.16,.78,1.)*(panelB*.55+highlightB*.4);
 if(mid==2){
  let pulse=.87+.13*sin(cfg.env.w*2.4);
  result=vec3f(.01,.24,.31)+vec3f(.045,1.45,1.75)*pulse+result*.3;
 }
 return result;
}
fn floorShade(point:vec3f,direction:vec3f)->vec3f {
 let cell=abs(fract(point.xz*.5)-vec2f(.5));
 let line=1.-smoothstep(.47,.50,max(cell.x,cell.y));
 let radial=exp(-length(point.xz)*.34);
 let beam=pow(max(dot(normalize(vec3f(.12,1.,.18)),normalize(-direction)),0.),12.);
 return vec3f(.012,.025,.036)+vec3f(.03,.07,.08)*radial
       +vec3f(.025,.065,.078)*line*radial+vec3f(.01,.028,.04)*beam;
}
@fragment fn fragmentMain(@builtin(position) frag:vec4f)->@location(0) vec4f {
 let screen=vec2f((frag.x*2.-cfg.view.x)/cfg.view.y,
                  (cfg.view.y-2.*frag.y)/cfg.view.y);
 let forward=normalize(cfg.lookAt.xyz-cfg.camera.xyz);
 let right=normalize(cross(forward,vec3f(0.,1.,0.)));
 let up=normalize(cross(right,forward));
 let direction=normalize(forward+right*screen.x*.72+up*screen.y*.72);
 let origin=cfg.camera.xyz;
 let bound=boundingRay(origin,direction);
 var traveled=max(bound.x,0.);
 var hit=false;
 var hitMaterial=0;
 if(bound.y>traveled){
  for(var step:i32=0;step<92;step=step+1){
   let point=origin+direction*traveled;
   let result=modelDistance(point);
   if(result.x<.0015){
    hit=true;hitMaterial=i32(result.y);break;
   }
   traveled=traveled+max(result.x*.90,.001);
   if(traveled>bound.y||traveled>26.){break;}
  }
 }
 var color=skyColor(direction);
 let floorT=(-1.815-origin.y)/direction.y;
 if(direction.y<-.001&&floorT>0.){
  color=floorShade(origin+direction*floorT,direction);
 }
 if(hit&&(traveled<floorT||floorT<=0.)){
  let point=origin+direction*traveled;
  let normal=normalAt(point);
  color=metalShade(point,normal,-direction,hitMaterial);
  if(cfg.env.z>0.5&&cfg.env.z<1.5){color=normal*.5+vec3f(.5);}
  if(cfg.env.z>1.5){color=palette(hitMaterial);}
 } else if(cfg.env.z>.5&&cfg.env.z<1.5) {
  color=color*.3;
 }
 let exposed=color*cfg.env.x;
 let tonemap=exposed/(vec3f(1.)+exposed);
 let gamma=pow(max(tonemap,vec3f(0.)),vec3f(.454545));
 return vec4f(gamma,1.);
}
