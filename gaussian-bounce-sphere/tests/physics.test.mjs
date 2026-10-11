import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Simulation} from '../physics.mjs';
const settings={count:100,sigma:.1,amplitude:1,threshold:.55,repulsion:.08,attraction:.02,bounce:.9,wallFriction:.04,damping:.003,gravity:0,turbulence:.05,pulse:.1,collisionGlow:1,speed:1,spatial:'on'};
const createRandom=()=>{let state=12345;return ()=>((state=(state*1664525+1013904223)>>>0)/4294967296);};
test('100 particles remain inside sphere over 5000 steps',()=>{const sim=new Simulation(settings,createRandom());for(let k=0;k<5000;k++){sim.step(1/120);sim.validateBounds();}assert.equal(sim.data.length,800);assert.ok(sim.candidatePairs<=4950);});
test('uniform grid matches exhaustive search for nearby pairs',()=>{const sim=new Simulation(settings,createRandom());const before=sim.data.slice();sim.physicalPairs(1/120);const gridOutput=sim.data.slice();sim.data.set(before);const old=settings.spatial;settings.spatial='off';sim.physicalPairs(1/120);settings.spatial=old;for(let i=0;i<100;i++){const b=i*8;for(let v=4;v<=6;v++)assert.ok(Math.abs(gridOutput[b+v]-sim.data[b+v])<.0001,`particle ${i} velocity ${v}`);} });
test('wall collision bounces, emits ripple, does not escape',()=>{const sim=new Simulation(settings,createRandom());settings.count=1;sim.data[0]=.93;sim.data[1]=0;sim.data[2]=0;sim.data[4]=1.2;sim.step(.12);assert.ok(sim.data[4]<0);assert.ok(sim.ripples.length>=1);sim.validateBounds();settings.count=100;});
test('100 particle burst produces finite positions and energies',()=>{const sim=new Simulation(settings,createRandom());sim.burst();for(let k=0;k<1000;k++){sim.step(1/120);sim.validateBounds();}assert.ok([...sim.data].every(Number.isFinite));});
