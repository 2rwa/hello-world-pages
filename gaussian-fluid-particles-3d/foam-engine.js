// Independent RGBA foam pass driven by the current Gaussian/Jacobian fluid.
export async function createFoamEngine({device,compile,uniformBuffer,fieldBuffers,deformationBuffers,size}){
  const U=GPUBufferUsage,S=GPUShaderStage;
  const foamBuffers=Array.from({length:2},()=>device.createBuffer({
    size:size*size*16,usage:U.STORAGE|U.COPY_SRC|U.COPY_DST
  }));
  const foamModule=await fetch("./foam.wgsl").then(response=>{
    if(!response.ok)throw Error("foam.wgsl HTTP "+response.status);
    return response.text();
  }).then(code=>compile(code,"foam.wgsl"));
  const layout=device.createBindGroupLayout({entries:[
    {binding:0,visibility:S.COMPUTE,buffer:{type:"read-only-storage"}},
    {binding:1,visibility:S.COMPUTE,buffer:{type:"read-only-storage"}},
    {binding:2,visibility:S.COMPUTE,buffer:{type:"read-only-storage"}},
    {binding:3,visibility:S.COMPUTE,buffer:{type:"storage"}},
    {binding:4,visibility:S.COMPUTE,buffer:{type:"uniform"}}
  ]});
  const pipeline=await device.createComputePipelineAsync({
    label:"RGBA foam: compression + history",layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),
    compute:{module:foamModule,entryPoint:"updateFoam"}
  });
  const bindGroups=[0,1].map(idx=>device.createBindGroup({layout,entries:[
    {binding:0,resource:{buffer:fieldBuffers[idx===0?2:0]}},
    {binding:1,resource:{buffer:deformationBuffers[idx]}},
    {binding:2,resource:{buffer:foamBuffers[idx]}},
    {binding:3,resource:{buffer:foamBuffers[1-idx]}},
    {binding:4,resource:{buffer:uniformBuffer}}
  ]}));
  return {
    foamBuffers,
    reset(){
      const zero=new Float32Array(size*size*4);
      foamBuffers.forEach(buffer=>device.queue.writeBuffer(buffer,0,zero));
    },
    encode(encoder,phase){
      const pass=encoder.beginComputePass({label:"four-channel-foam"});
      pass.setPipeline(pipeline);
      pass.setBindGroup(0,bindGroups[phase]);
      pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));
      pass.end();
    }
  };
}
