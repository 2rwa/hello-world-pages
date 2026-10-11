import test from 'node:test';
import assert from 'node:assert/strict';
import {SmokeWorld,CAPACITY} from '../physics.mjs';
import {initial,normalized} from '../config.js';
test('deterministic sphere positions and 2-phase populations',()=>{
 const settings={...initial,count:120,phaseRatio:.5};
 const a=new SmokeWorld(settings),b=new SmokeWorld(settings);
 assert.deepEqual(a.bodies.slice(0,10),b.bodies.slice(0,10));
 assert.equal(a.bodies.length,CAPACITY);
 const one=a.bodies.slice(0,120).filter(p=>p.phase===0).length;
 assert.ok(one>=55&&one<=65,'Phase mixture should be close to 50/50: '+one);
});
test('zero and full phase ratios behave as a pure phase',()=>{
 for(const ratio of [0,1]){
  const world=new SmokeWorld({...initial,phaseRatio:ratio,count:128});
  assert.ok(world.bodies.slice(0,128).every(p=>p.phase===(ratio===1?0:1)));
 }
});
test('192 marbles remain inside non-wetting glass over 5,000 substeps',()=>{
 const world=new SmokeWorld({...initial,count:192,wallGap:.2,wallRepulsion:6,swirl:2,phaseRepulsion:5,sameAttraction:2.5,windY:.9});
 for(let i=0;i<5000;i++)world.step(1/120);
 world.validate();
 const limit=Math.max(...world.bodies.map(p=>Math.hypot(p.x,p.y,p.z)+p.r*.7));
 assert.ok(limit<=.80001,'Glass exclusion zone breached: '+limit);
});
test('glass wall hard-rejects outward sphere regardless of wall-force gain',()=>{
 const world=new SmokeWorld({...initial,count:10,wallGap:.18,wallRepulsion:0});
 const p=world.bodies[0];
 p.x=.999;p.y=0;p.z=0;p.vx=1.2;p.vy=0;p.vz=0;
 world.step(.02);world.validate();
 assert.ok(p.x<=1-world.s.wallGap-p.r*.7+.00001);
 assert.ok(p.vx<=0,'Outward velocity was not reflected');
});
test('oil-water repulsion creates greater separation acceleration',()=>{
 const settings={...initial,count:2,phaseRatio:.5,speed:1,turbulence:0,swirl:0,buoyancy:0,cohesion:0,sameAttraction:0,softCollision:0,damping:0,wallRepulsion:0,windX:0,windY:0,windZ:0};
 const simulate=(strength)=>{
  const w=new SmokeWorld({...settings,phaseRepulsion:strength});
  const [a,b]=w.bodies;a.phase=0;b.phase=1;
  a.x=-.12;a.y=0;a.z=0;b.x=.12;b.y=0;b.z=0;
  a.vx=a.vy=a.vz=b.vx=b.vy=b.vz=0;
  for(let n=0;n<20;n++)w.step(1/120);
  return b.x-a.x;
 };
 assert.ok(simulate(6)>simulate(0)+.001);
});
test('back-to-front sorted billboards and stirring',()=>{
 const w=new SmokeWorld({...initial,count:100});
 const camera={forward:[0,0,1],position:[0,0,-3]};
 const d=w.sorted(camera);
 assert.equal(d.length,1200);
 for(let i=1;i<100;i++)assert.ok(d[i*12+2]<=d[(i-1)*12+2]+1e-5);
 const vx=w.bodies[0].vx;w.stir();assert.notEqual(w.bodies[0].vx,vx);
});
test('input sanitization handles unsafe and invalid values',()=>{
 const v=normalized({count:5000,phaseRatio:-1,wallGap:'0.18',windY:'garbage',quality:'crazy',opacity:Infinity});
 assert.deepEqual(v,{count:192,phaseRatio:0,wallGap:.18});
});