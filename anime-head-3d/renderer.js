/* Native WebGL2 renderer + Canvas2D software 3D fallback. No third-party libraries. */
(()=>{'use strict';
const $=x=>document.getElementById(x);
const canvas=$('scene'),badge=$('render-mode'),counter=$('tri-count');
const G=window.AnimeGeom;
const state={hair:'lilac',iris:'aqua',expression:'neutral',motion:true,yaw:.30,pitch:.09,zoom:innerWidth<=820?7.65:5.65,elapsed:0,frames:0};
let gl=null,ctx=null,prog=null,buffer=null,attr={},loc={},last=0,cache=null,frameN=0;const pointers=new Map();let pinchDistance=0;
const maxDpr=1.75;
try{gl=canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,preserveDrawingBuffer:true,powerPreference:'low-power'});}catch{}
if(gl){
 try{
 const vs=`#version 300 es
 in vec3 aPos,aNormal,aColor;
 uniform mat4 uView,uProj;
 out vec3 vColor,vNormal;
 void main(){vColor=aColor;vNormal=aNormal;gl_Position=uProj*uView*vec4(aPos,1.);}`;
 const fs=`#version 300 es
 precision highp float;
 in vec3 vColor,vNormal;
 out vec4 fragColor;
 void main(){vec3 n=normalize(vNormal);vec3 l=normalize(vec3(-0.34,0.80,1.05));
 float diff=max(dot(n,l),0.0);
 float tone=diff>0.67?1.0:diff>0.24?0.84:0.70;
 float rim=pow(1.0-max(dot(n,vec3(0.,0.,1.)),0.0),3.0)*.09;
 vec3 c=vColor*tone+vec3(.95,.82,1.0)*rim;
 fragColor=vec4(min(c,1.0),1.0);}`;
 function sh(type,src){const o=gl.createShader(type);gl.shaderSource(o,src);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(o));return o}
 prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,vs));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);
 if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));
 gl.useProgram(prog);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 for(let [name,i] of [['aPos',0],['aNormal',3],['aColor',6]]){let a=gl.getAttribLocation(prog,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,36,i*4)}
 loc.view=gl.getUniformLocation(prog,'uView');loc.proj=gl.getUniformLocation(prog,'uProj');
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
 gl.clearColor(0,0,0,0);
 }catch(e){console.warn('WebGL2 initialization failed: using Canvas2D fallback',e);gl=null}
}
if(!gl){ctx=canvas.getContext('2d',{alpha:true});if(!ctx){$('error').hidden=false;throw Error('No canvas rendering API available')}}
badge.textContent=gl?'WEBGL2 · GPU':'CANVAS 2D · CPU';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const norm=a=>{let d=Math.hypot(...a)||1;return a.map(v=>v/d)};
function cameraBasis(){
 const target=[innerWidth>820?.25:0,.18,0];
 const orbit=[Math.sin(state.yaw)*Math.cos(state.pitch)*state.zoom,Math.sin(state.pitch)*state.zoom+.18,Math.cos(state.yaw)*Math.cos(state.pitch)*state.zoom];
 const z=norm(sub(orbit,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);
 return {eye:orbit,x,y,z};
}
function lookAt(cam){let {eye,x,y,z}=cam;return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1])}
function persp(fov,aspect,n,f){let t=1/Math.tan(fov/2);return new Float32Array([t/aspect,0,0,0,0,t,0,0,0,0,(n+f)/(n-f),-1,0,0,2*n*f/(n-f),0])}
function resize(){const d=gl?Math.min(devicePixelRatio||1,maxDpr):1;const w=Math.max(1,Math.round(canvas.clientWidth*d)),h=Math.max(1,Math.round(canvas.clientHeight*d));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;if(gl)gl.viewport(0,0,w,h)}}
function webglDraw(vertices,count){let cam=cameraBasis(),aspect=canvas.width/canvas.height;
 gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);
 gl.uniformMatrix4fv(loc.view,false,lookAt(cam));gl.uniformMatrix4fv(loc.proj,false,persp(.79,aspect,.1,35));
 gl.drawArrays(gl.TRIANGLES,0,count*3);
}
// Depth-sort and draw actual 3D triangles with a CPU raster pipeline when WebGL2 is unavailable.
// Every point is camera-transformed and perspective-projected; no flat static illustration.
function cpuDraw(V){
 const W=canvas.width,H=canvas.height;
 ctx.clearRect(0,0,W,H);
 const cam=cameraBasis(),focal=H*.5/Math.tan(.79*.5),polys=[];
 for(let i=0;i<V.length;i+=27){
 let projected=[],depth=0,x=0,y=0,z=0,shade=0;
 for(let j=0;j<3;j++){
 const off=i+j*9,p=[V[off],V[off+1],V[off+2]],v=sub(p,cam.eye);
 const d=-dot(v,cam.z);if(d<.15){projected.length=0;break}
 let px=dot(v,cam.x)*focal/d+W*.5,py=-dot(v,cam.y)*focal/d+H*.5;
 projected.push([px,py]);depth+=d;
 x+=V[off+6];y+=V[off+7];z+=V[off+8];
 const n=[V[off+3],V[off+4],V[off+5]];
 const lit=Math.max(0,dot(n,[-.32,.65,.71]));shade+=lit>.64?1:lit>.23?.84:.70;
 }
 if(projected.length!==3)continue;
 const a=projected[0],b=projected[1],c=projected[2];
 const area=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
 if(Math.abs(area)<.14)continue;
 const tone=shade/3;
 const col=[x,y,z].map(v=>Math.min(255,Math.max(0,Math.round(v*tone/3*255))));
 polys.push({p:projected,depth:depth/3,color:`rgb(${col[0]},${col[1]},${col[2]})`});
 }
 polys.sort((a,b)=>b.depth-a.depth);
 for(let f of polys){let p=f.p;ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);ctx.lineTo(p[1][0],p[1][1]);ctx.lineTo(p[2][0],p[2][1]);ctx.closePath();ctx.fillStyle=f.color;ctx.fill();ctx.strokeStyle=f.color;ctx.lineWidth=.65;ctx.stroke()}
}
function frame(ms){
 requestAnimationFrame(frame);
 if(!gl&&ms-last<48)return;
 const dt=last?Math.min(.045,(ms-last)/1000):0;last=ms;
 if(state.motion)state.elapsed+=dt;
 resize();const m=G.model(state,state.elapsed,gl?1:.55);cache=m;
 if(gl)webglDraw(m.vertices,m.triangles);else cpuDraw(m.vertices);
 if(!(frameN++%12)){counter.textContent=m.triangles.toLocaleString('ja-JP')+' triangles';}
 state.frames++;
}
const choose=(selector,key)=>{document.querySelectorAll(selector).forEach(b=>b.addEventListener('click',()=>{
 state[key]=b.dataset[key];document.querySelectorAll(selector).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('expression-label').textContent=state.expression==='happy'?'にっこり':state.expression==='surprised'?'びっくり':'ふつう';
}))};
choose('[data-hair]','hair');choose('[data-iris]','iris');choose('[data-expression]','expression');
$('motion').addEventListener('click',e=>{state.motion=!state.motion;e.currentTarget.textContent=state.motion?'Ⅱ アニメ停止':'▶ アニメ再生';e.currentTarget.setAttribute('aria-pressed',String(state.motion))});
$('reset').addEventListener('click',()=>{state.yaw=.30;state.pitch=.09;state.zoom=innerWidth<=820?7.65:5.65});
canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);pinchDistance=0});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;let old=pointers.get(e.pointerId),dx=e.clientX-old[0],dy=e.clientY-old[1];
 pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===1){state.yaw+=dx*.009;state.pitch=Math.max(-.65,Math.min(.9,state.pitch+dy*.007));}
 else if(pointers.size===2){const [a,b]=[...pointers.values()],dist=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinchDistance>0)state.zoom=Math.max(3.55,Math.min(10.5,state.zoom*pinchDistance/dist));pinchDistance=dist;}});
for(let ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,e=>{pointers.delete(e.pointerId);pinchDistance=0});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(3.55,Math.min(10.5,state.zoom*Math.exp(e.deltaY*.001)))},{passive:false});
canvas.addEventListener('dblclick',()=>{state.yaw=.30;state.pitch=.09;state.zoom=innerWidth<=820?7.65:5.65});
window.__headDebug={state,getRenderer:()=>gl?'webgl2':'canvas2d',getTriangles:()=>cache?.triangles||0,getFrames:()=>state.frames};
requestAnimationFrame(frame);
})();
