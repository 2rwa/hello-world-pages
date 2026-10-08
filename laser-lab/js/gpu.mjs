import {W,H,clamp} from './flight.mjs';
import {drawLaserCanvas} from './scene.mjs';
const shaderSource=[
'struct Input{ @location(0) xy:vec2f, @location(1) color:vec4f };',
'struct Output{ @builtin(position) clip:vec4f, @location(0) color:vec4f };',
'@vertex fn vs_main(inp:Input)->Output{',
'var out:Output;out.clip=vec4f(inp.xy.x/270.0-1.0,1.0-inp.xy.y/480.0,0.0,1.0);',
'out.color=inp.color;return out;}',
'@fragment fn fs_main(inp:Output)->@location(0) vec4f{return inp.color;}'
].join('\n');
export class LaserRenderer{
constructor(canvas){this.canvas=canvas;this.gpu=false;this.ctx=null;this.error='';this.device=null;this.buffer=null;this.capacity=0;
this.layers=[{m:7,r:.09,g:.55,b:1,a:.055},{m:4,r:.1,g:.8,b:1,a:.14},{m:1.7,r:.55,g:.97,b:1,a:.32},{m:.58,r:1,g:1,b:1,a:.83}];}
async init(){
try{
if(!navigator.gpu)throw Error('WebGPU unavailable');
const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No adapter');
this.device=await adapter.requestDevice();
this.context=this.canvas.getContext('webgpu');
this.format=navigator.gpu.getPreferredCanvasFormat();
this.context.configure({device:this.device,format:this.format,alphaMode:'premultiplied'});
const mod=this.device.createShaderModule({code:shaderSource});
const issues=await mod.getCompilationInfo(),errors=issues.messages.filter(m=>m.type==='error');
if(errors.length)throw Error(errors.map(x=>x.message).join('\n'));
this.pipeline=this.device.createRenderPipeline({layout:'auto',
vertex:{module:mod,entryPoint:'vs_main',buffers:[{arrayStride:24,stepMode:'vertex',
attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x4'}]}]},
fragment:{module:mod,entryPoint:'fs_main',
targets:[{format:this.format,blend:{color:{srcFactor:'one',dstFactor:'one',operation:'add'},
alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},
primitive:{topology:'triangle-list'}});
this.gpu=true;this.device.lost.then(info=>{this.gpu=false;this.error='device lost: '+info.message;this.makeFallback();});
}catch(e){this.gpu=false;this.error=String(e);this.makeFallback();}
return this.gpu;
}
makeFallback(){if(this.ctx)return;this.ctx=this.canvas.getContext('2d');if(this.ctx)return;
const fallback=document.createElement('canvas');fallback.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
this.canvas.insertAdjacentElement('afterend',fallback);this.fallback=fallback;this.ctx=fallback.getContext('2d');this.resize(this.canvas.width,this.canvas.height);}
resize(width,height){
this.canvas.width=width;this.canvas.height=height;if(this.fallback){this.fallback.width=width;this.fallback.height=height;}
if(this.ctx)this.ctx.setTransform(width/W,0,0,height/H,0,0);
}
draw(s,opt){
if(!this.gpu){if(!this.ctx)return;this.ctx.setTransform(this.canvas.width/W,0,0,this.canvas.height/H,0,0);drawLaserCanvas(this.ctx,s,opt);return;}
const raw=[];
const add=(x,y,r,g,b,a)=>{raw.push(x,y,r*a,g*a,b*a,a);};
for(const l of s.lasers){const pts=l.trail;if(pts.length<2)continue;
for(const lay of this.layers){for(let i=1;i<pts.length;i++){
const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<.001)continue;
const nx=-dy/d,ny=dx/d,qa=clamp(1-(s.time-a.time)/opt.life,0,1),qb=clamp(1-(s.time-b.time)/opt.life,0,1);
const wa=opt.width*lay.m*(.65+.35*qa)*.5,wb=opt.width*lay.m*(.65+.35*qb)*.5;
const aa=lay.a*qa*qa,ab=lay.a*qb*qb;
const v0=[a.x+nx*wa,a.y+ny*wa,aa],v1=[a.x-nx*wa,a.y-ny*wa,aa],v2=[b.x+nx*wb,b.y+ny*wb,ab],v3=[b.x-nx*wb,b.y-ny*wb,ab];
for(const v of [v0,v1,v2,v2,v1,v3])add(v[0],v[1],lay.r,lay.g,lay.b,v[2]);
}}}
for(const l of s.lasers){if(l.hit||l.t<l.delay)continue;for(let ring=0;ring<2;ring++){
const radius=ring?8:24,opacity=ring?.65:.13;
for(let j=0;j<12;j++){const a=j*Math.PI/6,b=(j+1)*Math.PI/6;
add(l.x,l.y,1,1,1,opacity);
add(l.x+Math.cos(a)*radius,l.y+Math.sin(a)*radius,.2,.8,1,0);
add(l.x+Math.cos(b)*radius,l.y+Math.sin(b)*radius,.2,.8,1,0);
}}}
const vertices=new Float32Array(raw);
try{
const bytes=Math.max(24,vertices.byteLength);
if(bytes>this.capacity){this.buffer?.destroy();this.capacity=Math.ceil(bytes/65536)*65536;
this.buffer=this.device.createBuffer({size:this.capacity,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
if(vertices.length)this.device.queue.writeBuffer(this.buffer,0,vertices);
const encoder=this.device.createCommandEncoder();
const pass=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),
clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
pass.setPipeline(this.pipeline);if(vertices.length){pass.setVertexBuffer(0,this.buffer);pass.draw(vertices.length/6);}pass.end();
this.device.queue.submit([encoder.finish()]);
}catch(e){this.error=String(e);this.gpu=false;this.makeFallback();}
}
}