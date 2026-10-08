import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudWorld,collision} from '../world.js';
test('procedural splats finite and well structured',()=>{
 const a=new CloudWorld(1234).splats(0);
 assert.ok(a instanceof Float32Array);assert.equal(a.length%10,0);assert.ok(a.length/10>1000);
 for(const f of a)assert.ok(Number.isFinite(f));
});
test('orb and hazard collision radii',()=>{
 assert.equal(collision({type:'orb',x:0,y:0},1,0),true);
 assert.equal(collision({type:'orb',x:0,y:0},2.2,0),false);
 assert.equal(collision({type:'hazard',x:0,y:0},2,0),true);
});
test('orb triggers once',()=>{
 const w=new CloudWorld(17);
 w.nodes=[{type:'orb',x:0,y:0,z:4.5,resolved:false,particles:[]}];
 assert.deepEqual(w.advance(.1,10,0,0),['orb']);
 assert.deepEqual(w.advance(.1,10,0,0),[]);
});
test('pulse affects only nearby objects ahead',()=>{
 const w=new CloudWorld(42);
 w.nodes=[{type:'hazard',x:0,y:0,z:15,resolved:false},{type:'orb',x:8,y:0,z:15,resolved:false},{type:'orb',x:0,y:0,z:60,resolved:false}];
 assert.deepEqual(w.pulse(0,0),['hazard']);assert.equal(w.nodes.length,2);
});
test('movement keeps finite splat buffers',()=>{
 const w=new CloudWorld(99);
 for(let i=0;i<1000;i++)w.advance(.016,25,0,0);
 const a=w.splats(16);assert.ok(a.length>10000);assert.ok(a.every(Number.isFinite));
});
