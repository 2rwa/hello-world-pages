import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const shader=readFileSync('sdf-cyan-halo/character.wgsl','utf8');
const exportJS=readFileSync('sdf-cyan-halo/export.js','utf8');
// WGSL has no JavaScript-style multiple variable declarations.
assert.doesNotMatch(shader,/\b(?:let|var)\s+[A-Za-z_]\w*\s*=[^;\n]+,\s*[A-Za-z_]\w*\s*=/,
  'Invalid WGSL comma-separated variable declarations');
assert.match(shader,/let v\s*=\s*-quat\.xyz\s*;/);
assert.match(shader,/let twice\s*=\s*2\.\s*\*\s*cross\(v,\s*point\)\s*;/);
// All eight cube corners are required for marching tetrahedra.
assert.match(exportJS,/\[1,1,1\]\s*,\s*\[0,1,1\]/);
console.log('Static WGSL declaration / OBJ cell topology preflight passed');
// The authoritative shader test is Chrome WebGPU getCompilationInfo + real render.
