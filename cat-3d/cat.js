(()=>{'use strict';
const canvas=document.getElementById('scene'),gl=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'high-performance'});
if(!gl){document.getElementById('error').style.display='grid';return}
const vs=`#version 300 es
in vec3 pos,nrm,col;uniform mat4 view,proj;out vec3 vColor,vNormal,vWorld;void main(){vWorld=pos;vNormal=nrm;vColor=col;gl_Position=proj*view*vec4(pos,1.);}`;
const fs=`#version 300 es
precision highp float;in vec3 vColor,vNormal,vWorld;out vec4 outColor;
void main(){vec3 n=normalize(vNormal);vec3 l=normalize(vec3(-.6,1.8,2.5));float d=max(dot(n,l),0.);float soft=.56+.44*d;float rim=pow(1.-max(dot(n,normalize(vec3(.15,.4,1.))),0.),2.)*.11;float shine=pow(max(dot(reflect(-l,n),normalize(vec3(.0,.6,2.))),0.),20.)*.095;vec3 c=vColor*soft+vec3(1.,.92,.82)*(rim+shine);outColor=vec4(pow(c,vec3(.98)),1.);}`;
function shader(t,s){let x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x}
let program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const loc={view:gl.getUniformLocation(program,'view'),proj:gl.getUniformLocation(program,'proj')},buffer=gl.createBuffer(),stride=9*4;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
for(const [name,n] of [['pos',0],['nrm',3],['col',6]]){let a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,stride,n*4)}
gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(0,0,0,0);
const palettes={ginger:['#d99560','#b66d46','#f5dfc4','#dc9ba0'],gray:['#909ba5','#677680','#f3ede4','#d99aaa'],black:['#343941','#232931','#ded6cf','#bc8292'],cream:['#f0e5d1','#d2bda8','#fff9ee','#dea4ac']};
let coat='ginger',animate=true,clock=0,prev=0,waveUntil=0,angle=.55,elevation=.19,distance=5.8,drag=null,dirty=true;
const V=[],push=(p,n,c)=>V.push(...p,...n,...c),hex=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255),norm=v=>{let d=Math.hypot(...v)||1;return v.map(x=>x/d)},sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function tri(a,b,c,color){let n=norm(cross(sub(b,a),sub(c,a)));for(let p of [a,b,c])push(p,n,color)}
function ball(x,y,z,rx,ry,rz,color,S=18,R=12){const point=(u,v)=>[x+rx*Math.sin(v)*Math.cos(u),y+ry*Math.cos(v),z+rz*Math.sin(v)*Math.sin(u)],normal=(p)=>norm([(p[0]-x)/(rx*rx),(p[1]-y)/(ry*ry),(p[2]-z)/(rz*rz)]);
for(let j=0;j<R;j++)for(let i=0;i<S;i++){let u=i*2*Math.PI/S,w=(i+1)*2*Math.PI/S,v=j*Math.PI/R,q=(j+1)*Math.PI/R;let a=point(u,v),b=point(u,q),c=point(w,q),d=point(w,v);for(let p of [a,b,c,a,c,d])push(p,normal(p),color)}}
function tube(pts,r,color,sides=9){
const frames=[];let prevU=null;
for(let i=0;i<pts.length;i++){let t=norm(sub(pts[Math.min(i+1,pts.length-1)],pts[Math.max(i-1,0)]));
let u=prevU?norm(sub(prevU,t.map(x=>x*prevU.reduce((sum,v,j)=>sum+v*t[j],0)))):norm(cross(t,Math.abs(t[2])>.92?[0,1,0]:[0,0,1]));
if(Math.hypot(...u)<.01)u=norm(cross(t,[1,0,0]));let v=cross(t,u);frames.push({u,v});prevU=u}
const pt=(i,j)=>{let a=j*2*Math.PI/sides,{u,v}=frames[i],p=pts[i];return [p[0]+r*(u[0]*Math.cos(a)+v[0]*Math.sin(a)),p[1]+r*(u[1]*Math.cos(a)+v[1]*Math.sin(a)),p[2]+r*(u[2]*Math.cos(a)+v[2]*Math.sin(a))]};
for(let i=0;i<pts.length-1;i++)for(let j=0;j<sides;j++){let a=pt(i,j),b=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);
for(let [p,k] of [[a,i],[b,i+1],[c,i+1],[a,i],[c,i+1],[d,i]])push(p,norm(sub(p,pts[k])),color)}
}
function disk(y,rx,rz,color,s=48){for(let i=0;i<s;i++){let a=i*2*Math.PI/s,b=(i+1)*2*Math.PI/s;for(let p of [[0,y,0],[rx*Math.cos(b),y,rz*Math.sin(b)],[rx*Math.cos(a),y,rz*Math.sin(a)]])push(p,[0,1,0],color)}}
function curve(p,s=6){let out=[];for(let i=0;i<p.length-1;i++)for(let j=0;j<s;j++){let t=j/s,t2=t*t,t3=t2*t,a=p[Math.max(0,i-1)],b=p[i],c=p[i+1],d=p[Math.min(p.length-1,i+2)];out.push([0,1,2].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)))}out.push(p.at(-1));return out}
function ear(sign,fur,pink){let x=sign*.46,y=2.20,z=.57;let a=[x-.24,y,z],b=[x+.24,y,z],c=[x+sign*.13,y+.57,z-.055],back=[x,y+.13,z-.21];for(let e of [[a,b,c],[b,a,back],[a,c,back],[c,b,back]])tri(...e,fur);
tri([x-.15,y+.09,z+.018],[x+.15,y+.09,z+.018],[x+sign*.115,y+.43,z-.029],pink)}
function build(){V.length=0;let [furS,stripeS,creamS,pinkS]=palettes[coat],fur=hex(furS),stripe=hex(stripeS),cream=hex(creamS),pink=hex(pinkS),eye=coat==='black'?hex('#f7bf70'):hex('#7b956e');let breathe=1+Math.sin(clock*2.15)*.012,blink=1-.96*Math.max(0,1-Math.abs((clock%4.7)-.19)/.16),sw=Math.sin(clock*1.9)*.18;
// Ground and grounding shadow
disk(.075,2.15,1.76,hex('#f5e4d5'));disk(.080,1.03,1.12,hex('#e6cdbb'));
// Tail behind the body
let tail=curve([[.48,1.10,-1.03],[.74,1.34,-1.32],[1.00+sw,1.89,-1.40],[.95+sw,2.47,-1.35],[.65+sw,2.64,-1.29]],7);tube(tail,.125,fur,12);tube(tail.slice(-7),.126,stripe,12);
// Back legs and plump body
for(let s of [-1,1]){ball(s*.56,.62,-.72,.33,.43,.43,fur);ball(s*.58,.26,-.75,.34,.16,.39,fur)}
ball(0,1.08,-.20,.72,.75*breathe,.98,fur,24,16);
// Back stripes, subtly curved across coat
for(let j=0;j<3&&coat!=='cream';j++){let z=.07-j*.33; tube(curve([[-.59,1.33,z],[-.38,1.67,z-.06],[0,1.82,z-.12],[.38,1.67,z-.06],[.59,1.33,z]],4),.028,stripe,6)}
ball(0,1.06,.62,.43,.58,.21,cream,22,12);
// Front legs, paw-wave animation
for(let s of [-1,1]){let waving=s===1 && clock<waveUntil,fy=waving?1.31+Math.sin(clock*12)*.035:.58,fz=waving?1.14:.71,fx=s*(waving?.72:.44);
ball(fx,fy,fz,.22,waving?.30:.43,.25,fur);ball(fx,fy-(waving?.18:.32),fz+.22,.27,.16,.30,fur);
for(let k of [-1,1])tube([[fx+k*.085,fy-(waving?.12:.20),fz+.48],[fx+k*.085,fy-(waving?.16:.25),fz+.44]],.011,stripe,5)}
// Head small motion follows idle breathing
let nod=Math.sin(clock*1.45)*.012,hy=1.83+nod;
ball(0,hy,.55,.66,.60,.58,fur,26,18);
for(let s of [-1,1])ear(s,fur,pink);
// Face stripes / cheeks
for(let s of [-1,1]){for(let j=0;j<2&&coat!=='cream';j++)tube([[s*.55,hy+.06-j*.13,.79],[s*.47,hy+.04-j*.13,.95],[s*.40,hy+.03-j*.13,1.01]],.022,stripe,7);
ball(s*.25,hy+.065,1.056,.18,.23,.10,hex('#fffaf1'),18,12);
ball(s*.255,hy+.055,1.136,.112,.156*blink,.046,eye,18,12);
ball(s*.255,hy+.055,1.178,.046,.128*blink,.026,hex('#29312e'),14,10);
ball(s*.29,hy+.117,1.196,.027,.029,.012,hex('#ffffff'),10,8);
ball(s*.16,hy-.215,1.084,.20,.153,.15,cream,18,12);
// Whiskers extend out from muzzle
for(let j=-1;j<=1;j++){let y=hy-.17+j*.055;tube(curve([[s*.27,y,1.177],[s*.53,y+j*.035,1.21],[s*.89,y+j*.11,1.11]],4),.010,hex(coat==='black'?'#ded8d3':'#76695c'),6)}
}
// Triangular nose and mouth
tri([-.09,hy-.19,1.225],[.09,hy-.19,1.225],[0,hy-.29,1.253],pink);
tube([[0,hy-.29,1.252],[0,hy-.37,1.225]],.012,hex('#75564e'),8);
for(let s of [-1,1])tube(curve([[0,hy-.37,1.225],[s*.092,hy-.41,1.2],[s*.17,hy-.365,1.166]],4),.011,hex('#765d56'),7);
// Forehead markings
for(let s of [-1,0,1])if(coat!=='cream')tube([[s*.14,hy+.53,1.00],[s*.13,hy+.40,1.077],[s*.11,hy+.30,1.102]],.019,stripe,6);
return V.length/9}
const lookAt=(eye,target)=>{let z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((a,b,i)=>a+b*eye[i],0),-y.reduce((a,b,i)=>a+b*eye[i],0),-z.reduce((a,b,i)=>a+b*eye[i],0),1])},perspective=(fov,aspect,near,far)=>{let f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0])};
function resize(){let d=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*d),h=Math.round(canvas.clientHeight*d);if(w!==canvas.width||h!==canvas.height){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);dirty=true}}
function frame(ms){let now=ms*.001,dt=Math.min(.05,now-prev);prev=now;if(animate)clock+=dt;resize();let count=build();gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(V),gl.DYNAMIC_DRAW);
let eye=[Math.sin(angle)*Math.cos(elevation)*distance,1.15+Math.sin(elevation)*distance,Math.cos(angle)*Math.cos(elevation)*distance],aspect=canvas.width/canvas.height;
let target=[0,aspect<.72?1.48:1.20,0];gl.uniformMatrix4fv(loc.view,false,lookAt(eye,target));gl.uniformMatrix4fv(loc.proj,false,perspective(Math.PI/4,aspect,.1,50));gl.drawArrays(gl.TRIANGLES,0,count);requestAnimationFrame(frame)}
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;angle+=(e.clientX-drag.x)*.008;elevation=Math.max(-.24,Math.min(.74,elevation+(drag.y-e.clientY)*.006));drag.x=e.clientX;drag.y=e.clientY});canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(3.5,Math.min(9,distance*Math.exp(e.deltaY*.001)))},{passive:false});canvas.addEventListener('dblclick',()=>{angle=.55;elevation=.19;distance=5.8});
for(let b of document.querySelectorAll('[data-coat]'))b.addEventListener('click',()=>{coat=b.dataset.coat;document.querySelectorAll('[data-coat]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});
document.getElementById('wave').addEventListener('click',()=>{waveUntil=clock+1.6});document.getElementById('pause').addEventListener('click',e=>{animate=!animate;e.currentTarget.textContent=animate?'Ⅱ 停止':'▶ 再生'});document.getElementById('reset').addEventListener('click',()=>{angle=.55;elevation=.19;distance=5.8});requestAnimationFrame(frame);
})();
