// Self-contained circle packing and equal-mass marble collisions.
// The view is a 2D projection of a horizontal board; z is the sphere radius.
export const MAX_BALLS = 50;
export function choosePacking(count, halfW, halfH) {
  const width = Math.max(0.5, 2 * halfW - 0.54);
  const height = Math.max(0.5, 2 * halfH - 0.54);
  let best = {radius:0,cols:1,rows:count};
  for(let cols=1;cols<=count;cols++){
    const rows=Math.ceil(count/cols);
    const radius=Math.min(0.65,0.43*Math.min(width/cols,height/rows));
    if(radius>best.radius+0.00001){
      best={radius,cols,rows};
    }
  }
  const positions=[];
  for(let i=0;i<count;i++){
    const row=Math.floor(i/best.cols),col=i%best.cols;
    // Centre every row, including the final incomplete one.
    const rowCount=Math.min(best.cols,count-row*best.cols);
    const pitch=2.18*best.radius;
    positions.push([(col-(rowCount-1)/2)*pitch,((best.rows-1)/2-row)*pitch]);
  }
  return {...best,positions};
}
export function integrateMarbles(balls,count,radius,halfW,halfH,dt,gravityX,gravityY,friction) {
  const time=Math.min(0.033,Math.max(0,dt));
  const minX=-Math.max(0.015,halfW-radius-0.15),maxX=-minX;
  const minY=-halfH+radius+0.15,maxY=-minY;
  const confine=b=>{
    if(b.x<minX){b.x=minX;b.vx=Math.abs(b.vx)*0.67;}
    if(b.x>maxX){b.x=maxX;b.vx=-Math.abs(b.vx)*0.67;}
    if(b.y<minY){b.y=minY;b.vy=Math.abs(b.vy)*0.67;}
    if(b.y>maxY){b.y=maxY;b.vy=-Math.abs(b.vy)*0.67;}
  };
  const quaternionMultiply=(a,b)=>[
    a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
    a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
    a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
  ];
  for(let i=0;i<count;i++){
    const bead=balls[i],oldX=bead.x,oldY=bead.y;
    bead.vx+=gravityX*time*1.25;
    bead.vy+=gravityY*time*1.25;
    const damping=Math.exp(-friction*time);
    bead.vx*=damping;bead.vy*=damping;
    const speed=Math.hypot(bead.vx,bead.vy);
    if(speed>9){bead.vx*=9/speed;bead.vy*=9/speed;}
    bead.x+=bead.vx*time;bead.y+=bead.vy*time;
    confine(bead);
    const dx=bead.x-oldX,dy=bead.y-oldY,move=Math.hypot(dx,dy);
    if(move>1e-5){
      const halfAngle=move/(2*radius),sinHalf=Math.sin(halfAngle);
      const delta=[-dy/move*sinHalf,dx/move*sinHalf,0,Math.cos(halfAngle)];
      const q=quaternionMultiply(delta,bead.q);
      const norm=Math.hypot(...q);
      bead.q=q.map(x=>x/norm);
    }
  }
  // Two passes reduce residual overlap after a chain of 50 simultaneous impacts.
  for(let pass=0;pass<2;pass++){
    for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
      const a=balls[i],b=balls[j],dx=b.x-a.x,dy=b.y-a.y;
      const distanceSquared=dx*dx+dy*dy,diameter=radius*2;
      if(distanceSquared>=diameter*diameter)continue;
      const distance=Math.sqrt(distanceSquared);
      const nx=distance>1e-4?dx/distance:1;
      const ny=distance>1e-4?dy/distance:0;
      const penetration=diameter-distance;
      a.x-=nx*penetration*0.5;a.y-=ny*penetration*0.5;
      b.x+=nx*penetration*0.5;b.y+=ny*penetration*0.5;
      const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      if(relative<0){
        const impulse=-(1+0.76)*relative*0.5;
        a.vx-=impulse*nx;a.vy-=impulse*ny;
        b.vx+=impulse*nx;b.vy+=impulse*ny;
      }
    }
    for(let i=0;i<count;i++)confine(balls[i]);
  }
}
