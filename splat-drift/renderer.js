// WebGL2 Gaussian splat renderer: elliptical screen-facing 3D billboards.
// Each instance is x,y,z,sigmaX,sigmaY,rotation,r,g,b,opacity.
export class GaussianRenderer {
 constructor(canvas){
  this.canvas=canvas;
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:false,powerPreference:'high-performance'});
  if(!gl)throw Error('このブラウザでは WebGL2 を利用できません。');
  this.gl=gl;
  const vs='#version 300 es\n'+
  'precision highp float;\n'+
  'layout(location=0) in vec2 aCorner;\n'+
  'layout(location=1) in vec3 aCenter;\n'+
  'layout(location=2) in vec2 aSigma;\n'+
  'layout(location=3) in float aAngle;\n'+
  'layout(location=4) in vec4 aColor;\n'+
  'uniform vec2 uCamera; uniform float uAspect;\n'+
  'out vec2 vLocal; out vec4 vColor;\n'+
  'void main(){float z=max(aCenter.z,0.5);float c=cos(aAngle),s=sin(aAngle);\n'+
  'vec2 q=aCorner*aSigma*2.85;vec2 rotated=vec2(c*q.x-s*q.y,s*q.x+c*q.y);\n'+
  'vec2 xy=(aCenter.xy-uCamera+rotated)*(2.15/z);\n'+
  'gl_Position=vec4(xy/vec2(uAspect,1.0),0.0,1.0);\n'+
  'vLocal=aCorner*2.85;\n'+
  'float fog=smoothstep(1.0,5.0,aCenter.z)*(1.0-smoothstep(145.0,190.0,aCenter.z));\n'+
  'vColor=vec4(aColor.rgb,aColor.a*fog);}\n';
  const fs='#version 300 es\n'+
  'precision mediump float;in vec2 vLocal;in vec4 vColor;out vec4 frag;\n'+
  'void main(){float gaussian=exp(-0.5*dot(vLocal,vLocal));\n'+
  'float strength=gaussian*vColor.a;if(strength<0.005)discard;\n'+
  'frag=vec4(vColor.rgb*strength,1.0);}\n';
  const shader=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
  const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  this.program=program;this.cameraLoc=gl.getUniformLocation(program,'uCamera');this.aspectLoc=gl.getUniformLocation(program,'uAspect');
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  this.instances=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);
  const attrs=[[1,3,0],[2,2,12],[3,1,20],[4,4,24]];
  for(const [loc,size,offset] of attrs){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,40,offset);gl.vertexAttribDivisor(loc,1)}
  gl.bindVertexArray(null);this.vao=vao;this.lastCount=0;
  gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
 }
 resize(width){const w=Math.max(320,Math.round(width));const h=Math.round(w*9/16);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h)}return [w,h]}
 draw(floatData,cameraX,cameraY){
  const gl=this.gl;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  if(!floatData.length){this.lastCount=0;return}
  gl.useProgram(this.program);gl.uniform2f(this.cameraLoc,cameraX,cameraY);gl.uniform1f(this.aspectLoc,this.canvas.width/this.canvas.height);
  gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);gl.bufferData(gl.ARRAY_BUFFER,floatData,gl.DYNAMIC_DRAW);
  const count=floatData.length/10;gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,count);
  gl.bindVertexArray(null);this.lastCount=count;
 }
}
