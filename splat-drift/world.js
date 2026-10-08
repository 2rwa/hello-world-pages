// Procedural 3D world made entirely from translucent, anisotropic Gaussian splats.
const TAU=Math.PI*2;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
export function collision(node,x,y){const dx=node.x-x,dy=node.y-y;return dx*dx+dy*dy<Math.pow(node.type==='orb'?1.75:2.05,2)}
export class CloudWorld{
 constructor(seed=4096){
  this.seed=seed>>>0;this.travel=0;this.spawnProgress=0;this.nodes=[];this.dust=[];
  for(let i=0;i<660;i++)this.dust.push({x:this.range(-13.8,13.8),y:this.range(-8.4,8.4),z:this.range(2,192),radius:this.range(.08,.38),shade:this.random(),angle:this.range(0,TAU),alpha:this.range(.05,.19)});
  for(let i=0;i<6;i++)this.spawn(47+i*26,i===0?'orb':i===1?'hazard':null);
 }
 random(){let t=this.seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296}
 range(a,b){return a+(b-a)*this.random()}
 gaussian(){return Math.sqrt(-2*Math.log(Math.max(1e-8,this.random())))*Math.cos(TAU*this.random())}
 spawn(z,forced=null){
  const type=forced||(this.random()<.58?'orb':'hazard');
  const x=this.range(-6.5,6.5),y=this.range(-4.0,4.0),size=type==='orb'?1.25:1.75;
  const particles=[],count=type==='orb'?56:74;
  for(let i=0;i<count;i++){
   const r=this.random(),a=this.range(0,TAU);
   let ox,oy,oz;
   if(type==='orb'){
    // A luminous ring enclosing a bright central core.
    const ring=i<count*.68;
    const radial=ring?this.range(.55,1.15):this.range(0,.45);
    ox=Math.cos(a)*radial*size;oy=Math.sin(a)*radial*size*.86;oz=this.gaussian()*.32;
   }else{
    // Ragged 3D cloud with a broad, hazardous centre.
    ox=clamp(this.gaussian()*.66,-1.65,1.65)*size;
    oy=clamp(this.gaussian()*.58,-1.5,1.5)*size;
    oz=clamp(this.gaussian()*.44,-1.1,1.1)*size;
   }
   const sx=this.range(.12,.40)*(type==='orb'?1:1.25);
   const sy=sx*this.range(.5,1.65);
   const col=type==='orb'?[this.range(.08,.31),this.range(.78,1),this.range(.74,1)]:[this.range(.85,1),this.range(.15,.40),this.range(.32,.67)];
   particles.push([ox,oy,oz,sx,sy,this.range(-Math.PI,Math.PI),...col,this.range(.17,.53)]);
  }
  this.nodes.push({x,y,z,type,particles,size,twinkle:this.range(0,TAU),resolved:false});
 }
 advance(dt,speed,shipX,shipY){
  const moved=dt*speed;this.travel+=moved;this.spawnProgress+=moved;
  while(this.spawnProgress>26){this.spawnProgress-=26;this.spawn(145);}
  const events=[];
  for(const n of this.nodes){
   const before=n.z;n.z-=moved;
   if(!n.resolved&&before>4&&n.z<=4){
    n.resolved=true;
    if(collision(n,shipX,shipY))events.push(n.type);
   }
  }
  this.nodes=this.nodes.filter(n=>n.z>-7);
  return events;
 }
 pulse(x,y){
  const events=[];
  for(const n of this.nodes){
   if(n.resolved||n.z<3||n.z>30)continue;
   if(Math.hypot(n.x-x,n.y-y)>5.1)continue;
   n.resolved=true;events.push(n.type);n.z=-20;
  }
  this.nodes=this.nodes.filter(n=>n.z>-7);
  return events;
 }
 splats(time){
  const out=[];
  const put=(x,y,z,sx,sy,rot,r,g,b,a)=>{if(z>1.2&&z<193)out.push(x,y,z,sx,sy,rot,r,g,b,a)};
  // Endless decorative tunnel: thousands of luminous, sparse dust particles.
  for(const d of this.dust){
   const z=((d.z-this.travel*.80)%190+190)%190+2;
   const drift=Math.sin(time*.24+d.angle)*.25;
   if(d.shade<.33)put(d.x+drift,d.y,z,d.radius,d.radius*1.8,d.angle,.12,.45,.91,d.alpha);
   else if(d.shade<.66)put(d.x+drift,d.y,z,d.radius*1.7,d.radius,d.angle,.55,.29,.92,d.alpha);
   else put(d.x+drift,d.y,z,d.radius,d.radius*1.6,d.angle,.25,.82,.94,d.alpha);
  }
  for(let ring=0;ring<11;ring++){
   const z=((ring*20-this.travel)%220+220)%220+3;
   for(let i=0;i<36;i++){
    const a=i/36*TAU,wiggle=Math.sin(i*3.91+ring*4.3)*.28;
    const x=Math.cos(a)*(11.7+wiggle),y=Math.sin(a)*(6.9+wiggle*.7);
    const bright=(ring%3===0)?1:.65;
    put(x,y,z,.43,.7,a,.27*bright,.65*bright,.96*bright,.13);
    if(i%3===0)put(x*.99,y*.99,z+.5,.9,.23,a,.72,.31,.88,.09);
   }
  }
  // Object local splats rotate as a cloud, revealing actual 3D depth.
  for(const n of this.nodes){
   if(n.z>187||n.z<1.5)continue;
   const spin=time*(n.type==='orb'?.9:-.23)+n.twinkle;
   const co=Math.cos(spin),si=Math.sin(spin);
   const shimmer=.87+.13*Math.sin(time*3.8+n.twinkle);
   const dim=n.resolved?.2:1;
   for(const p of n.particles){
    const x=n.x+p[0]*co-p[1]*si,y=n.y+p[0]*si+p[1]*co;
    put(x,y,n.z+p[2],p[3],p[4],p[5]+spin,p[6],p[7],p[8],p[9]*shimmer*dim);
   }
   if(n.type==='orb'){
    put(n.x,n.y,n.z,1.7,1.7,spin,.04,.76,.98,.13*dim);
    put(n.x,n.y,n.z,.36,.36,0,.62,1,.94,.75*dim);
   }else{
    put(n.x,n.y,n.z,2.5,2.0,spin,.96,.07,.34,.075*dim);
    put(n.x,n.y,n.z,.4,.4,0,1,.47,.55,.48*dim);
   }
  }
  return Float32Array.from(out);
 }
}
