/* Anime Head Studio — original procedural 3D meshes, no dependencies */
(function(){'use strict';
const TAU=Math.PI*2;
const palettes={
 lilac:{base:'#6256a1',dark:'#413469',shine:'#a69add'},
 rose:{base:'#bd698e',dark:'#7b4569',shine:'#f2afcb'},
 cocoa:{base:'#79534e',dark:'#422f3d',shine:'#bc8d83'},
 ink:{base:'#35374f',dark:'#22253d',shine:'#79829f'}
};
const eyeColors={aqua:'#38b6af',violet:'#9270da',amber:'#d69b49',blue:'#5f9de0'};
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)}
const norm=v=>{let l=Math.hypot(...v)||1;return v.map(a=>a/l)};
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const lerp=(a,b,t)=>a+(b-a)*t;
function model(opts,time,quality=1){
const out=[];const pal=palettes[opts.hair]||palettes.lilac;
const skin=rgb('#ffddc9'),skinShade=rgb('#edb9ab'),blush=rgb('#ef9fa7');
const hair=rgb(pal.base),hairDark=rgb(pal.dark),hairShine=rgb(pal.shine);
const ivory=rgb('#fffdf9'),ink=rgb('#29253e'),iris=rgb(eyeColors[opts.iris]||eyeColors.aqua);
const d=[.0,.0,1.0];
function vertex(p,n,c){out.push(...p,...n,...c)}
function tri(a,b,c,color){const n=norm(cross(sub(b,a),sub(c,a)));vertex(a,n,color);vertex(b,n,color);vertex(c,n,color)}
function sphere(cx,cy,cz,rx,ry,rz,color,sides=22,rings=15,alter){
 sides=Math.max(10,Math.round(sides*quality));rings=Math.max(7,Math.round(rings*quality));
 const at=(u,v)=>{let x=Math.sin(v)*Math.cos(u),y=Math.cos(v),z=Math.sin(v)*Math.sin(u);
 let p=[cx+x*rx,cy+y*ry,cz+z*rz];return alter?alter(p,[x,y,z]):p};
 const nrm=p=>norm([(p[0]-cx)/(rx*rx),(p[1]-cy)/(ry*ry),(p[2]-cz)/(rz*rz)]);
 for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){
 let u=i*TAU/sides,uu=(i+1)*TAU/sides,v=j*Math.PI/rings,vv=(j+1)*Math.PI/rings;
 let a=at(u,v),b=at(u,vv),c=at(uu,vv),e=at(uu,v);
 for(let p of [a,b,c,a,c,e])vertex(p,nrm(p),color);
 }
}
function tube(points,r,color,sides=7){ // smooth rounded stroke or hair tip
 if(quality<.8&&points.length>5)points=points.filter((_,i)=>i%2===0||i===points.length-1);
 sides=Math.max(5,Math.round(sides*quality));
 const rings=[];
 for(let i=0;i<points.length;i++){
 const t=norm(sub(points[Math.min(i+1,points.length-1)],points[Math.max(0,i-1)]));
 const u=norm(cross(t,Math.abs(t[2])>.9?[0,1,0]:[0,0,1]));const v=cross(t,u);
 rings.push({t,u,v});
 }
 for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){
 const at=(k,angle)=>{const {u,v}=rings[k],p=points[k],ra=typeof r==='function'?r(k/(points.length-1)):r;
 return [0,1,2].map(a=>p[a]+ra*(u[a]*Math.cos(angle)+v[a]*Math.sin(angle)))};
 let a=at(i,TAU*j/sides),b=at(i+1,TAU*j/sides),c=at(i+1,TAU*(j+1)/sides),e=at(i,TAU*(j+1)/sides);
 for(let p of [a,b,c,a,c,e])vertex(p,norm(sub(p,points[i])),color);
 }
}
function bezier(points,segments=14){const [a,b,c,f]=points,o=[];for(let i=0;i<=segments;i++){
 let t=i/segments,s=1-t;o.push([0,1,2].map(k=>s*s*s*a[k]+3*s*s*t*b[k]+3*s*t*t*c[k]+t*t*t*f[k]));}return o;}
function hairLock(points,rootWidth,color,rootDepth=.11){
 let pts=bezier(points,13);
 tube(pts,t=>Math.max(.013,rootWidth*Math.pow(1-t,.83)),color,9);
}
function lidCurve(cx,cy,cz,s,upper,color,offset=0){
 let pts=[];for(let i=0;i<=10;i++){
 let t=i/10,x=lerp(-.22,.22,t),y=(upper?.108:-.10)*Math.sin(Math.PI*t)+offset;
 pts.push([cx+x,cy+y,cz+.03+Math.sin(t*Math.PI)*.008]);
 }tube(pts,.014,color,5);
}
// Stand, neck and shoulders: a small portrait bust rather than a floating sphere.
sphere(0,-1.57,-.26,.86,.33,.42,rgb('#e8d5fa'),26,11);
sphere(0,-1.60,.10,.58,.20,.30,rgb('#ffffff'),24,9);
sphere(0,-1.14,-.12,.28,.50,.29,skin,19,12);
sphere(0,-1.37,.16,.24,.31,.12,rgb('#faf4ff'),16,9);
// Back hair volume, sculpted as an ellipsoid behind the face.
sphere(0,.11,-.255,1.065,1.50,.83,hairDark,30,19);
// Side panels at both sides and back-of-neck tufts.
for(const s of [-1,1]){
 sphere(s*.92,-.28,-.11,.28,.89,.53,hair,18,16);
 hairLock([[s*.84,.56,-.05],[s*1.25,.05,.04],[s*1.09,-.56,.20],[s*.77,-1.05,.31]],.24,hair);
 hairLock([[s*1.00,.26,-.35],[s*1.30,-.32,-.27],[s*1.12,-.77,.03],[s*.93,-1.12,.14]],.17,hairDark);
}
// Ears; face is a custom jaw-shaped surface.
for(const s of [-1,1]){
 sphere(s*.98,-.08,.035,.19,.35,.18,skin,14,11);
 sphere(s*1.08,-.06,.17,.085,.19,.035,skinShade,12,9);
}
// Anime face: narrower jaw, tapering toward the chin.
const faceWarp=(p,xyz)=>{let f=Math.max(0,(-.03-p[1])/1.04);p[0]*=(1-.28*f);p[2]+=.06*f;return p};
sphere(0,.20,.095,.91,1.29,.84,skin,38,25,faceWarp);
// Gentle under-eye shadow and round cheeks.
for(const s of [-1,1]){
 sphere(s*.632,-.24,.731,.170,.085,.032,blush,15,9);
 sphere(s*.58,-.245,.756,.082,.027,.012,rgb('#ffc3ba'),12,7);
}
// Eye sockets, enormous anime irises, pupils, highlights and upper eyelashes.
let blink=1;
if(opts.motion){const period=4.25,phase=time%period;blink=Math.min(1,Math.max(.055,Math.abs(phase-3.70)/.095));}
if(opts.expression==='happy')blink=Math.min(blink,.76);
for(const s of [-1,1]){
 const cx=s*.34,cy=.28,cz=.843;
 let ey=Math.max(.020,.247*blink);
 sphere(cx,cy,cz,.219,ey,.097,ivory,24,15);
 const irisY=ey*.78;
 sphere(cx-s*.018,cy-.027,cz+.092,.125,Math.max(.019,irisY),.046,ink,22,13);
 sphere(cx-s*.018,cy-.022,cz+.115,.103,Math.max(.016,irisY*.84),.034,iris,22,13);
 sphere(cx-s*.025,cy+.005,cz+.147,.053,Math.max(.013,irisY*.62),.023,rgb('#233047'),18,10);
 if(blink>.22){
 sphere(cx-.042,cy+.081*blink,cz+.173,.043,.047*blink,.013,ivory,12,9);
 sphere(cx+.052,cy-.058*blink,cz+.161,.018,.019,.011,ivory,10,7);
 }
 lidCurve(cx,cy+ey*.63,cz+.093,s,true,hairDark,.034);
 // black/brown upper eyeliner wings
 tube([[cx+s*.15,cy+ey*.60,cz+.114],[cx+s*.235,cy+ey*.82,cz+.081],[cx+s*.292,cy+ey*.85+.036,cz+.044]],.024,ink,6);
 // fine eyebrow
 tube(bezier([[cx-s*.16,.70,.755],[cx-s*.06,.742,.81],[cx+s*.10,.738,.79],[cx+s*.19,.711,.71]],8),.018,hairDark,6);
}
// Nose bridge and tiny nose / dot.
sphere(0,-.185,.946,.061,.075,.043,skinShade,12,8);
sphere(0,-.190,.977,.048,.025,.021,rgb('#d59f98'),12,8);
// Mouth variants: soft smile, rounded surprise, slightly curved neutral.
if(opts.expression==='surprised'){
 sphere(0,-.50,.825,.098,.146,.035,ink,16,12);
 sphere(0,-.54,.855,.061,.050,.012,rgb('#e78f9d'),12,8);
}else{
 const smile=opts.expression==='happy'?.11:.038;
 tube(bezier([[-.145,-.47,.825],[-.045,-.50-smile,.858],[.052,-.50-smile,.858],[.145,-.47,.825]],13),.017,rgb('#b96776'),7);
 if(opts.expression==='happy')sphere(0,-.534,.862,.078,.020,.01,rgb('#f09ba4'),12,6);
}
// Crown hair cap: a partial UV ellipsoid over the forehead.
const nCap=Math.max(18,Math.round(36*quality)),nRows=Math.max(7,Math.round(12*quality)),phiMax=1.13;
const capPt=(u,p)=>[1.055*Math.sin(p)*Math.cos(u),.22+1.37*Math.cos(p),-.055+.96*Math.sin(p)*Math.sin(u)];
const capNorm=p=>norm([p[0]/1.11,(p[1]-.22)/1.37,(p[2]+.055)/.96]);
for(let j=0;j<nRows;j++)for(let i=0;i<nCap;i++){
 let a=capPt(i*TAU/nCap,j*phiMax/nRows),b=capPt(i*TAU/nCap,(j+1)*phiMax/nRows),c=capPt((i+1)*TAU/nCap,(j+1)*phiMax/nRows),e=capPt((i+1)*TAU/nCap,j*phiMax/nRows);
 for(let p of [a,b,c,a,c,e])vertex(p,capNorm(p),hair);
}
// Bangs built from curved tapered 3D locks. Each lock has a true cross-section.
const bangs=[
 [[-.87,1.07,.30],[-.98,.77,.67],[-1.00,.23,.70],[-.77,-.19,.63],.195,0],
 [[-.72,1.34,.31],[-.64,1.09,.89],[-.51,.79,1.05],[-.35,.59,.97],.228,1],
 [[-.40,1.51,.29],[-.28,1.18,.84],[-.22,.77,1.09],[-.065,.55,1.04],.222,0],
 [[.00,1.54,.35],[.17,1.24,.90],[.17,.82,1.12],[.255,.58,1.035],.211,1],
 [[.42,1.44,.30],[.64,1.14,.84],[.73,.81,.97],[.59,.49,.86],.226,0],
 [[.78,1.20,.12],[.96,.85,.51],[.98,.39,.65],[.90,-.01,.50],.17,1]
];
for(let i=0;i<bangs.length;i++){const b=bangs[i];hairLock(b.slice(0,4),b[4],b[5]?hair:hairDark)}
// A few light-catching strands to emphasize direction.
for(const s of [-1,1]){
 tube(bezier([[s*.55,1.43,.66],[s*.63,1.26,.86],[s*.64,1.02,.98],[s*.56,.82,1.04]],12),.016,hairShine,6);
 tube(bezier([[s*.91,.56,.50],[s*1.04,.22,.58],[s*1.02,-.29,.52],[s*.87,-.53,.45]],12),.019,hairShine,6);
}
// A small floating hair curl (ahoge)
tube(bezier([[.16,1.54,-.03],[.42,1.94,-.02],[.18,2.06,.12],[-.025,1.83,.10]],20),t=>.05*(1-t)+.008,hair,8);
return {vertices:new Float32Array(out),triangles:out.length/27,blink};
}
window.AnimeGeom={model,palettes,eyeColors,rgb};
})();
