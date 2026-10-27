const COUNT=384;
export function gaussianParticles(){
  let seed=16327;
  function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  const values=new Float32Array(COUNT*8);
  for(let i=0;i<COUNT;i++){
    const j=i*8;
    values[j]=48*rand()-24;values[j+1]=48*rand()-24;
    values[j+2]=0.63+rand()*0.47;
    values[j+3]=0.60+rand()*0.90;
    values[j+4]=0.08+rand()*.34;values[j+5]=(rand()-.5)*.35;
    values[j+6]=0;values[j+7]=rand()*6.2831853;
  }
  return values;
}
