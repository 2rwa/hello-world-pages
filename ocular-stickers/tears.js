// Tear radius is measured relative to eyeball radius; slider scales thickness,
// not the whole eye. Camera framing is computed once per sticker / slider setting.
export const EYE_RADIUS=1.15, CAMERA_Y=.12, FOCAL=270*1.72/2;
export const tearPresets=[1.53,1.45,1.57,1.46,1.54,1.62,1.48,1.55,1.44,1.43,1.73,1.77,1.50,1.32,1.35,1.63];
export function withTears(m,i,percent=100){
 const amount=Math.max(.75,Math.min(1.25,percent/100));
 const oldBase=i<8?1.18:1.20;
 // Keep each expression's existing timing, but use its own larger base.
 const base=tearPresets[i];
 const wobble=i<8?m.tear-(oldBase+[.06,.02,.08,.05,.09,.12,.02,.13][i]):
   m.tear-([1.19,1.20,1.30,1.32,1.20,1.19,1.19,1.18][i-8]);
 const tear=1+(base-1+wobble)*amount;
 const sway=1.35+.35*(tear-1);
 const lag=[m.lag[0]*sway+.06*Math.sin(m.phase),m.lag[1]*sway,m.lag[2]*sway];
 // Keep the moving lobe close enough to merge; larger outer drops visibly
 // stretch the smooth union while the main sphere surrounds the entire eye.
 const lobeRadius=EYE_RADIUS*tear*(.92+.025*Math.sin(m.phase-.6));
 return {...m,tear,lag,lobeRadius};
}
// Exact projected bounds for a sphere along either screen axis. The smooth
// union extends by at most blendWidth/4, accounted for by a .05 padding.
function axisBounds(center,rad,distance){
 const den=distance*distance-rad*rad;
 const delta=rad*Math.sqrt(distance*distance+center*center-rad*rad);
 return [(center*distance-delta)/den,(center*distance+delta)/den];
}
export function projectedBounds(m,distance){
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 const spheres=[[m.p,EYE_RADIUS*m.tear+.05],[m.p.map((v,j)=>v+m.lag[j]),m.lobeRadius+.05]];
 for(const [p,r] of spheres){
  const z=distance-p[2],x=axisBounds(p[0],r,z),y=axisBounds(p[1]-CAMERA_Y,r,z);
  minX=Math.min(minX,135+FOCAL*x[0]);maxX=Math.max(maxX,135+FOCAL*x[1]);
  minY=Math.min(minY,135-FOCAL*y[1]);maxY=Math.max(maxY,135-FOCAL*y[0]);
 }
 return [minX,minY,maxX,maxY];
}
export function frameDistance(motions){
 // Reserve the caption at y=37; avoid camera zooming during animation.
 for(let d=4.7;d<=10;d+=.025){
  if(motions.every(m=>{const [x0,y0,x1,y1]=projectedBounds(m,d);return x0>=12&&x1<=258&&y0>=62&&y1<=258;}))return d;
 }
 throw Error('Unable to frame tear geometry');
}
