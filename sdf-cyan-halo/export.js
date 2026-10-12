import {sceneDistance} from './sdf-cpu.js';
// Marching tetrahedra creates a genuine OBJ triangle surface from SDF=0.
const tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1]];
const palette=[[.77,.83,.84],[.18,.24,.29],[.02,.9,1],[.045,.071,.088],[.44,.54,.57]];
const difference=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const mean=(coords)=>coords.reduce((out,p)=>out.map((v,i)=>v+p[i]/coords.length),[0,0,0]);
function crossing(p,q,v,w){
 const alpha=Math.max(0,Math.min(1,v/(v-w)));
 return p.map((n,i)=>n+alpha*(q[i]-n));
}
function fragment(points,values,indices){
 const inside=indices.filter(i=>values[i]<0),outside=indices.filter(i=>values[i]>=0);
 if(inside.length===0||outside.length===0)return [];
 const front=mean(outside.map(i=>points[i]));
 const back=mean(inside.map(i=>points[i]));
 const outward=difference(front,back);
 let faces=[];
 if(inside.length===1||outside.length===1){
  const single=inside.length===1?inside[0]:outside[0];
  const others=inside.length===1?outside:inside;
  faces=[[crossing(points[single],points[others[0]],values[single],values[others[0]]),
          crossing(points[single],points[others[1]],values[single],values[others[1]]),
          crossing(points[single],points[others[2]],values[single],values[others[2]])]];
 }else{
  const [a,b]=inside,[c,d]=outside;
  const ac=crossing(points[a],points[c],values[a],values[c]);
  const ad=crossing(points[a],points[d],values[a],values[d]);
  const bc=crossing(points[b],points[c],values[b],values[c]);
  const bd=crossing(points[b],points[d],values[b],values[d]);
  faces=[[ac,ad,bc],[bc,ad,bd]];
 }
 return faces.map(face=>{
  const n=cross(difference(face[1],face[0]),difference(face[2],face[0]));
  if(dot(n,outward)<0)return [face[0],face[2],face[1]];
  return face;
 });
}
export async function exportOBJ(parts,resolution=56){
 const nx=resolution,ny=Math.round(resolution*1.32),nz=resolution;
 const lower=[-1.65,-1.96,-1.4],upper=[1.65,2.18,1.72];
 const step=lower.map((v,i)=>(upper[i]-v)/([nx,ny,nz][i]-1));
 const count=nx*ny*nz,field=new Float32Array(count);
 const index=(x,y,z)=>x+nx*(y+ny*z);
 for(let z=0;z<nz;z++){
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const p=[lower[0]+x*step[0],lower[1]+y*step[1],lower[2]+z*step[2]];
   field[index(x,y,z)]=sceneDistance(p,parts).distance;
  }
  if(z%10===0)await new Promise(requestAnimationFrame);
 }
 const vertices=['# CYAN HALO procedural SDF zero-isosurface',
  '# Position followed by RGB vertex color (OBJ extension)',
  'o cyan_halo_sdf_metallic_character'];
 const faces=[],normals=[];
 let triCount=0,currentMaterial=-1;
 for(let z=0;z<nz-1;z++){
  for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
   const local=corners.map(([dx,dy,dz])=>[
    lower[0]+(x+dx)*step[0],lower[1]+(y+dy)*step[1],lower[2]+(z+dz)*step[2]]);
   const values=corners.map(([dx,dy,dz])=>field[index(x+dx,y+dy,z+dz)]);
   if(values.every(n=>n>=0)||values.every(n=>n<0))continue;
   for(const tet of tetrahedra){
    for(const tri of fragment(local,values,tet)){
     const center=mean(tri),material=sceneDistance(center,parts).material|0;
     const rgb=palette[material]||palette[0];
     if(material!==currentMaterial){faces.push('g material_'+material);currentMaterial=material;}
     const a=difference(tri[1],tri[0]),b=difference(tri[2],tri[0]);
     const n=cross(a,b),mag=Math.hypot(...n)||1;
     const normal=n.map(k=>k/mag);
     normals.push('vn '+normal.map(v=>v.toFixed(5)).join(' '));
     for(const p of tri){
      vertices.push('v '+p.map(v=>v.toFixed(5)).join(' ')+' '+rgb.join(' '));
     }
     const id=triCount*3+1,ni=triCount+1;
     faces.push('f '+id+'//'+ni+' '+(id+1)+'//'+ni+' '+(id+2)+'//'+ni);
     triCount++;
    }
   }
  }
  if(z%8===0)await new Promise(requestAnimationFrame);
 }
 const text=vertices.join('\n')+'\n'+normals.join('\n')+'\n'+faces.join('\n')+'\n';
 const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));
 const a=document.createElement('a');a.href=url;a.download='cyan-halo-sdf-character.obj';
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
 return {triangles:triCount,vertices:triCount*3,bytes:text.length};
}
