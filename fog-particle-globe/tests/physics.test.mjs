import test from 'node:test';import assert from 'node:assert/strict';
import {FogSimulation,MAX_PARTICLES,rngFromSeed} from '../physics.mjs';
const settings={count:2400,size:.14,spread:.93,shape:'cloud',seed:7,speed:1,flow:.5,windX:.04,windY:0,windZ:0,swirl:1.5,turbulence:1.1,buoyancy:.07,damping:.3,bounce:.5};
test('seeded initial positions are repeatable',()=>{
 const a=new FogSimulation(settings),b=new FogSimulation(settings);
 assert.deepEqual(a.particles.slice(0,15),b.particles.slice(0,15));assert.equal(a.particles.length,MAX_PARTICLES);
});
test('2400 fog particles stay within sphere after long turbulent flight',()=>{
 const sim=new FogSimulation(settings);
 for(let i=0;i<2400;i++)sim.step(1/120);
 sim.validate();assert.ok(sim.particles.some(p=>Math.abs(p.vx)>0.01));
});
test('all distribution presets start inside sphere',()=>{
 for(const shape of ['cloud','shell','band','uniform']){
  const sim=new FogSimulation({...settings,shape});
  sim.validate();
  assert.equal(sim.particles.length,2400);
 }
});
test('sorted buffer is back to front, and stir moves particles',()=>{
 const sim=new FogSimulation({...settings,count:100});
 const cam={forward:[0,0,1],position:[0,0,-3]};
 const data=sim.sorted(cam);assert.equal(data.length,100*12);
 for(let i=1;i<100;i++)assert.ok(data[i*12+2]<=data[(i-1)*12+2]+1e-5);
 const prior=sim.particles[0].vx;sim.stir();assert.notEqual(prior,sim.particles[0].vx);
});
test('velocity is finite when simulation speed is zero',()=>{
 const sim=new FogSimulation({...settings,count:600,speed:0});
 for(let i=0;i<120;i++)sim.step(1/120);
 sim.validate();
});
