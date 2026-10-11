import test from 'node:test';
import assert from 'node:assert/strict';
import {MarblePhysics,CAPACITY} from '../physics.mjs';
import {defaults,normalize} from '../config.js';
test('reproducible initial centers',()=>{
 const a=new MarblePhysics({...defaults,count:20}),b=new MarblePhysics({...defaults,count:20});
 assert.equal(a.marbles.length,CAPACITY);assert.deepEqual(a.marbles,b.marbles);
});
test('marbles never escape container under extended turbulence',()=>{
 const world=new MarblePhysics({...defaults,count:28,speed:2,swirl:2.5,turbulence:1.8,buoyancy:.4,radius:.26,wallGap:.14});
 for(let i=0;i<5000;i++)world.step(1/120);
 world.validate();assert.ok(world.clock>0);
});
test('changing wall clearance keeps every center inside immediately',()=>{
 const world=new MarblePhysics({...defaults,count:28});
 world.s.wallGap=.22;world.contain();world.validate();
});
test('soft collision produces measurable repulsion',()=>{
 const settings={...defaults,count:2,radius:.20,swirl:0,turbulence:0,buoyancy:0,cohesion:0,damping:0};
 const simulate=repulsion=>{
  const w=new MarblePhysics({...settings,repulsion});
  const [a,b]=w.marbles;
  a.x=-.09;a.y=a.z=0;b.x=.09;b.y=b.z=0;
  a.vx=a.vy=a.vz=b.vx=b.vy=b.vz=0;
  for(let i=0;i<40;i++)w.step(1/120);
  return b.x-a.x;
 };
 assert.ok(simulate(2)>simulate(0)+.006);
});
test('stop, stir, packing and deterministic center movement',()=>{
 const world=new MarblePhysics({...defaults,count:14,speed:0});
 const x=world.marbles[0].x;world.step(1/120);assert.equal(x,world.marbles[0].x);
 const old=world.marbles[0].vx;world.stir();assert.notEqual(old,world.marbles[0].vx);
 const packed=world.packed();assert.equal(packed.length,14*8);
 world.s.speed=1;world.step(1/120);world.validate();
});
test('normalize parameter range, reject invalid enum and nonfinite values',()=>{
 assert.deepEqual(normalize({count:99,blend:5,quality:'nope',ior:Infinity,wallGap:-1,hue:'0.55'}),{count:28,blend:.55,wallGap:0,hue:.55});
});
