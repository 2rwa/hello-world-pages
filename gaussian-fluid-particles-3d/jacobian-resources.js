export function allocateDeformation(device,size){
  return Array.from({length:2},()=>device.createBuffer({
    size:size*size*16,
    usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC
  }));
}
export function bindJacobianResources(device,simLayout,renderLayout,resources){
  const {particleBuffer,headBuffer,linkBuffer,uniformBuffer,fieldBuffers,deformationBuffers,foamBuffers}=resources;
  const simGroups=[0,1].map(idx=>device.createBindGroup({
    label:"gaussian fluid jacobian compute "+idx,
    layout:simLayout,
    entries:[
      {binding:0,resource:{buffer:particleBuffer}},
      {binding:1,resource:{buffer:headBuffer}},
      {binding:2,resource:{buffer:linkBuffer}},
      {binding:3,resource:{buffer:fieldBuffers[idx===0?0:2]}},
      {binding:4,resource:{buffer:fieldBuffers[1]}},
      {binding:5,resource:{buffer:uniformBuffer}},
      {binding:6,resource:{buffer:fieldBuffers[idx===0?2:0]}},
      {binding:7,resource:{buffer:deformationBuffers[idx]}},
      {binding:8,resource:{buffer:deformationBuffers[1-idx]}}
    ]
  }));
  const renderGroups=[0,1].map(idx=>device.createBindGroup({
    label:"ocean + jacobian read "+idx,
    layout:renderLayout,
    entries:[
      {binding:0,resource:{buffer:fieldBuffers[idx===0?2:0]}},
      {binding:1,resource:{buffer:uniformBuffer}},
      {binding:2,resource:{buffer:deformationBuffers[1-idx]}},
      {binding:3,resource:{buffer:foamBuffers[1-idx]}}
    ]
  }));
  return {simGroups,renderGroups};
}
