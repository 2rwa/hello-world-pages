import assert from 'node:assert/strict';
import {resetBodies, simulateBodies} from '../physics.mjs';
const palette = [[1,.4,.3],[.4,.8,1]];
for (const glassCount of [0,1,24,48,64]) {
  for(const opaqueCount of [0,7,10]){
    const cfg = { glass:glassCount,opaque:opaqueCount,blend:.32 };
    const balls = resetBodies(cfg,palette);
    const glass=balls.filter(b=>b.glass).length;
    assert.equal(glass,glassCount,'glass count mismatch');
    assert.equal(balls.length,glassCount+opaqueCount,'ball count mismatch');
    let maxPenetration = 0, maxOutside=0, pairChecks=0;
    for(let t=0;t<240;t++){
      simulateBodies(balls,1/120,cfg.blend);
      for(let i=0;i<balls.length;i++){
        const a=balls[i];
        maxOutside=Math.max(maxOutside,Math.hypot(...a.pos)+a.radius-2.4);
        for(let j=i+1;j<balls.length;j++){
          const b=balls[j];
          if(a.glass&&b.glass)continue;
          const distance=Math.hypot(...a.pos.map((v,k)=>v-b.pos[k]));
          const minDistance=a.radius+b.radius+(a.glass!==b.glass?.08+.25*cfg.blend:.008);
          maxPenetration=Math.max(maxPenetration,minDistance-distance);
          pairChecks++;
        }
      }
    }
    console.log(`glass ${glassCount} opaque ${opaqueCount}: checks=${pairChecks}, max-penetration=${maxPenetration.toFixed(6)}, outside=${maxOutside.toFixed(6)}`);
    assert.ok(maxPenetration < .035, 'hard collision violated');
    assert.ok(maxOutside < .035, 'shell collision violated');
  }
}
console.log('PHYSICS CHECK OK');
