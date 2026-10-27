const COUNT=1536;
export async function createParticleEngine({device,compile,format,uniformBuffer,fieldBuffers,foamBuffers}){
  const U=GPUBufferUsage,S=GPUShaderStage;
  const settingsBuffer=device.createBuffer({size:16,usage:U.UNIFORM|U.COPY_DST});
  const particles=device.createBuffer({size:COUNT*64,usage:U.STORAGE|U.COPY_DST|U.COPY_SRC});
  const resources=async(path)=>fetch("./"+path).then(response=>{
    if(!response.ok)throw Error(path+" HTTP "+response.status);
    return response.text();
  }).then(shader=>compile(shader,path));
  const [updateModule,drawModule]=await Promise.all([resources("particles.wgsl"),resources("particle-render.wgsl")]);
  const simulationLayout=device.createBindGroupLayout({entries:[
    {binding:0,visibility:S.COMPUTE,buffer:{type:"storage"}},
    {binding:1,visibility:S.COMPUTE,buffer:{type:"read-only-storage"}},
    {binding:2,visibility:S.COMPUTE,buffer:{type:"read-only-storage"}},
    {binding:3,visibility:S.COMPUTE,buffer:{type:"uniform"}},
    {binding:4,visibility:S.COMPUTE,buffer:{type:"uniform"}}
  ]});
  const drawLayout=device.createBindGroupLayout({entries:[
    {binding:0,visibility:S.VERTEX,buffer:{type:"read-only-storage"}},
    {binding:1,visibility:S.VERTEX,buffer:{type:"uniform"}},
    {binding:2,visibility:S.VERTEX,buffer:{type:"uniform"}}
  ]});
  const computePipeline=await device.createComputePipelineAsync({
    label:"3D bubble buoyancy + ballistic spray",
    layout:device.createPipelineLayout({bindGroupLayouts:[simulationLayout]}),
    compute:{module:updateModule,entryPoint:"updateParticles"}
  });
  const renderPipeline=await device.createRenderPipelineAsync({
    label:"3D sphere impostors + spray glints",
    layout:device.createPipelineLayout({bindGroupLayouts:[drawLayout]}),
    vertex:{module:drawModule,entryPoint:"particleVertex"},
    fragment:{module:drawModule,entryPoint:"particleFragment",targets:[{
      format,blend:{
        color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},
        alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}
      }
    }]},
    primitive:{topology:"triangle-list",cullMode:"none"}
  });
  const computeBindGroups=[0,1].map(phase=>device.createBindGroup({
    layout:simulationLayout,entries:[
      {binding:0,resource:{buffer:particles}},
      {binding:1,resource:{buffer:foamBuffers[1-phase]}},
      {binding:2,resource:{buffer:fieldBuffers[phase===0?2:0]}},
      {binding:3,resource:{buffer:uniformBuffer}},
      {binding:4,resource:{buffer:settingsBuffer}}
    ]
  }));
  const drawBindGroup=device.createBindGroup({layout:drawLayout,entries:[
    {binding:0,resource:{buffer:particles}},
    {binding:1,resource:{buffer:uniformBuffer}},
    {binding:2,resource:{buffer:settingsBuffer}}
  ]});
  return {
    buffer:particles,
    count:COUNT,
    settingsBuffer,
    reset(){
      device.queue.writeBuffer(particles,0,new Uint8Array(COUNT*64));
    },
    updateSettings(values){device.queue.writeBuffer(settingsBuffer,0,new Float32Array(values));},
    encode(encoder,phase){
      const pass=encoder.beginComputePass({label:"independent-3D-particles"});
      pass.setPipeline(computePipeline);
      pass.setBindGroup(0,computeBindGroups[phase]);
      pass.dispatchWorkgroups(Math.ceil(COUNT/64));
      pass.end();
    },
    draw(pass){
      pass.setPipeline(renderPipeline);
      pass.setBindGroup(0,drawBindGroup);
      pass.draw(6*COUNT);
    }
  };
}
