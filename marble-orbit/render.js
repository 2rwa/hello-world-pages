/* WebGL2 shader compilation and fullscreen raymarch renderer. No libraries. */
window.makeMarbleRenderer=function(canvas){
  const gl=canvas.getContext("webgl2",{alpha:false,antialias:false,depth:false,powerPreference:"high-performance"});
  if(!gl)throw new Error("WebGL2 が利用できません。対応ブラウザで開いてください。");
  function shader(type,src){
    const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  const program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,window.MARBLE_VERTEX));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,window.MARBLE_FRAGMENT));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  const loc={};
  for(const n of ["uRes","uTime","uFlash","uEye","uRight","uUp","uForward","uCount","uGoal"])
    loc[n]=gl.getUniformLocation(program,n);
  loc.uBalls=gl.getUniformLocation(program,"uBalls[0]");
  loc.uColors=gl.getUniformLocation(program,"uColors[0]");
  const packedBalls=new Float32Array(64),packedColors=new Float32Array(48);
  let mode="auto",rw=0,rh=0;
  function setQuality(q){mode=q;rw=0;}
  function resize(){
    const mobile=Math.min(innerWidth,innerHeight)<680;
    const ratio=mode==="high"?Math.min(devicePixelRatio||1,1.6):
      mode==="low"?.52:mobile?.73:Math.min(devicePixelRatio||1,1.05);
    const w=Math.max(1,Math.floor(canvas.clientWidth*ratio));
    const h=Math.max(1,Math.floor(canvas.clientHeight*ratio));
    if(w!==rw||h!==rh){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);rw=w;rh=h;}
  }
  function draw(balls,target,cam,elapsed,flash){
    resize();packedBalls.fill(0);packedColors.fill(0);
    for(let i=0;i<balls.length&&i<16;i++){
      const b=balls[i],j=i*4,k=i*3;
      packedBalls[j]=b.p[0];packedBalls[j+1]=b.p[1];packedBalls[j+2]=b.p[2];packedBalls[j+3]=b.r;
      packedColors[k]=b.c[0];packedColors[k+1]=b.c[1];packedColors[k+2]=b.c[2];
    }
    gl.uniform2f(loc.uRes,rw,rh);
    gl.uniform1f(loc.uTime,elapsed);gl.uniform1f(loc.uFlash,flash);
    gl.uniform3fv(loc.uEye,cam.eye);gl.uniform3fv(loc.uRight,cam.right);
    gl.uniform3fv(loc.uUp,cam.up);gl.uniform3fv(loc.uForward,cam.forward);
    gl.uniform4fv(loc.uBalls,packedBalls);gl.uniform3fv(loc.uColors,packedColors);
    gl.uniform1i(loc.uCount,balls.length);
    gl.uniform4f(loc.uGoal,target[0],target[1],target[2],.112);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  canvas.addEventListener("webglcontextlost",e=>e.preventDefault());
  canvas.addEventListener("webglcontextrestored",()=>location.reload());
  return {draw,setQuality};
};