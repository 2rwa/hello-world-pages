import {amoebaWGSL} from './amoeba.wgsl.js';

const U=GPUBufferUsage, S=GPUShaderStage;
export async function attachAmoeba(state,makeLayout,compileShader) {
 const {device,format}=state;
 const amoebaBGL=makeLayout([
  [0,S.FRAGMENT,{buffer:{type:'uniform'}}],
  [1,S.FRAGMENT,{buffer:{type:'uniform'}}],
  [2,S.FRAGMENT,{buffer:{type:'read-only-storage'}}],
  [3,S.FRAGMENT,{texture:{sampleType:'float'}}],
  [4,S.FRAGMENT,{texture:{sampleType:'depth'}}],
  [5,S.FRAGMENT,{sampler:{type:'filtering'}}]
 ]);
 const shader=await compileShader(amoebaWGSL,'Pelagic Amoeba SDF');
 const layout=device.createPipelineLayout({bindGroupLayouts:[amoebaBGL]});
 const pipeline=await device.createRenderPipelineAsync({
  label:'Amoeba glass raymarch and screen-space refraction',
  layout,vertex:{module:shader,entryPoint:'fullScreenVertex'},
  fragment:{module:shader,entryPoint:'fullScreenFragment',targets:[{format}]},
  primitive:{topology:'triangle-list'}
 });
 const options=device.createBuffer({size:48,usage:U.UNIFORM|U.COPY_DST});
 const sphereBuffer=device.createBuffer({size:100*32,usage:U.STORAGE|U.COPY_DST});
 const sphereData=new Float32Array(100*8);
 for(let idx=0;idx<100;idx++){
  let x,y,z,radius;
  if(idx===0){[x,y,z,radius]=[0,0,0,3.25];}
  else if(idx===1){[x,y,z,radius]=[-2.55,0.05,-0.30,2.65];}
  else if(idx===2){[x,y,z,radius]=[2.65,0.16,0.28,2.50];}
  else {
   let phi=idx*2.3999632;
   let offset=Math.sin(idx*1.217)*0.5+0.5;
   x=Math.cos(phi)*4.35+Math.sin(idx*0.82)*1.1;
   y=Math.sin(phi*1.15)*1.25;
   z=Math.sin(phi)*2.5;
   radius=0.72+1.02*offset;
  }
  sphereData.set([x,y,z,radius,idx*2.3999632,0,0,0],idx*8);
 }
 device.queue.writeBuffer(sphereBuffer,0,sphereData);
 const sampler=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
 state.amoeba={pipeline,amoebaBGL,options,sphereBuffer,sampler};
}
