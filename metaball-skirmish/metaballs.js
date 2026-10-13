const VERT = `#version 300 es
precision highp float;
out vec2 v_uv;
void main(){
 vec2 p=vec2(float(gl_VertexID==1)*4.0-1.0,float(gl_VertexID==2)*4.0-1.0);
 v_uv=(p+1.0)*0.5;gl_Position=vec4(p,0.0,1.0);
}`;
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 frag;
uniform vec4 u_blobs[72];uniform int u_count;uniform float u_time;
vec3 palette(float t){
 if(t<0.5)return vec3(.09,.94,.87);
 if(t<1.5)return vec3(.64,.37,1.0);
 if(t<2.5)return vec3(1.0,.42,.26);
 return vec3(1.0,.24,.51);
}
void main(){
 vec2 p=vec2(v_uv.x*960.0,(1.0-v_uv.y)*600.0);
 float field=0.0;vec3 weighted=vec3(0.0);float weight=0.0;
 float highlight=0.0;
 for(int i=0;i<72;i++){
  if(i>=u_count)break;
  vec4 b=u_blobs[i];
  vec2 d=(p-b.xy)/b.z;
  float q=dot(d,d);
  float v=max(0.0,1.0-q*.38);
  v=v*v;
  field+=v;
  weighted+=v*palette(b.w);
  weight+=v;
  highlight+=v*max(0.0,1.0-length(d-vec2(-.33,-.4))*.65);
 }
 float edge=smoothstep(.22,.32,field);
 float halo=smoothstep(.02,.12,field)*(1.0-edge)*.30;
 if(edge+halo<.002)discard;
 vec3 base=weighted/max(.001,weight);
 float ripple=.5+.5*sin(p.y*.048+p.x*.019-u_time*4.0);
 float volume=smoothstep(.32,1.4,field);
 vec3 body=base*(.55+.38*volume+.13*ripple);
 body+=base*.28*(1.0-smoothstep(.28,.62,field));
 body+=vec3(.72,.94,1.0)*min(1.0,highlight/max(weight,.01))*.22;
 float rim=(1.0-smoothstep(.3,.5,field))*.42;
 body+=vec3(.8,.98,1.)*rim;
 frag=vec4(mix(base*.7,body,edge),max(edge,halo));
}`;
function shader(gl,type,src){const o=gl.createShader(type);gl.shaderSource(o,src);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o}
export class Metaballs{
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,premultipliedAlpha:false,preserveDrawingBuffer:true});
  if(!this.gl){this.available=false;return}
  const gl=this.gl,prog=gl.createProgram();
  gl.attachShader(prog,shader(gl,gl.VERTEX_SHADER,VERT));gl.attachShader(prog,shader(gl,gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);this.prog=prog;this.count=gl.getUniformLocation(prog,'u_count');this.blobs=gl.getUniformLocation(prog,'u_blobs[0]');this.time=gl.getUniformLocation(prog,'u_time');
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
  this.data=new Float32Array(72*4);this.available=true;this.lastCount=0;
 }
 draw(game){
  if(!this.available)return;
  const gl=this.gl;let count=0;
  for(const e of game.enemies){
   for(let i=0;i<e.lobes&&count<72;i++){
    const phase=e.age*(1.6+i*.19)+e.seed+i*2.39996;
    const d=i===0?0:e.rad*(e.type===3?.65:.53);
    const x=e.x+Math.cos(phase)*d;
    const y=e.y+Math.sin(phase*1.19)*d*.68;
    const r=e.rad*(i===0?.94:e.small?.65:e.type===3?.69:.63)*(1+.12*Math.sin(phase*1.5));
    this.data.set([x,y,r,e.type],count*4);count++;
   }
  }
  this.lastCount=count;
  gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(this.prog);gl.uniform1i(this.count,count);gl.uniform4fv(this.blobs,this.data);gl.uniform1f(this.time,game.time);
  gl.bindVertexArray(this.vao);gl.drawArrays(gl.TRIANGLES,0,3);
 }
}
export function drawFallback(ctx,game){
 for(const e of game.enemies){
  ctx.save();ctx.globalCompositeOperation='screen';
  const hue=e.type===1?'#9d7bff':e.type===2?'#ff9e55':e.type===3?'#ff4781':'#4de8d6';
  for(let i=0;i<e.lobes;i++){
   const phase=e.age*1.6+e.seed+i*2.4;
   const d=i===0?0:e.rad*.52;
   const x=e.x+Math.cos(phase)*d,y=e.y+Math.sin(phase)*d*.7;
   const rad=e.rad*(i===0?.95:.7);
   const g=ctx.createRadialGradient(x-rad*.2,y-rad*.2,rad*.15,x,y,rad*1.2);
   g.addColorStop(0,'#e8ffff');g.addColorStop(.35,hue);g.addColorStop(.75,hue+'bb');g.addColorStop(1,'#00000000');
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,rad*1.2,0,Math.PI*2);ctx.fill();
  }ctx.restore();
 }
}