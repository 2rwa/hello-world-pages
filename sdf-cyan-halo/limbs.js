export function addLimbs(b,o){
 const {sphere,capsule,torus,box}=b,A=o.armor,C=o.cannon,P=o.pose;
 // Bilateral hips, knees, shin guards, talons.
 for(const s of [-1,1]){
  sphere(.245*s,-.43,-.04,.174,3);
  torus([.245*s,-.43,-.04],[1,0,0],.142,.027,4);
  const hip=[.245*s,-.43,-.025];
  const knee=[(.34+.055*P)*s,-1.02,.08+P*(s>0?.03:-.09)];
  const ankle=[(.37+.05*P)*s,-1.49,-.015+(s>0?.02:-.06)*P];
  capsule(hip,knee,.16*A,1);
  capsule([.26*s,-.56,.035],[.33*s,-.9,.15],.186*A,0);
  box([.30*s,-.73,.13],[.16*A,.275,.085],.07,0);
  sphere(...knee,.16,3);torus(knee,[1,0,0],.13,.035,4);
  capsule(knee,ankle,.133*A,1);
  capsule([.36*s,-1.10,.085],[.39*s,-1.42,.045],.17*A,0);
  box([.37*s,-1.27,.12],[.13*A,.235,.08],.05,0);
  sphere(...ankle,.105,3);
  box([.38*s,-1.67,.14],[.16,.105,.29],.063,0);
  box([.38*s,-1.635,.35],[.12,.055,.09],.03,4);
 }
 // Offhand manipulator.
 capsule([-.55,.70,-.01],[-.77,.29,.12],.125*A,1);
 capsule([-.63,.56,.03],[-.77,.35,.13],.157*A,0);
 sphere(-.77,.28,.13,.12,3);
 torus([-.77,.28,.13],[0,0,1],.10,.025,4);
 capsule([-.77,.25,.13],[-.81,-.13,.29],.11*A,1);
 capsule([-.81,.17,.13],[-.84,-.035,.22],.145*A,0);
 sphere(-.82,-.15,.28,.11,3);
 for(let i=0;i<3;i++){const x=-.92+i*.10;capsule([x,-.17,.29],[x-.025,-.33,.38],.037,0);}
 // Forward pointing modular energy emitter.
 const sh=[.55,.70,-.01],elbow=[.74,.38,.16+P*.06];
 const tip=[.88+P*.17,.30+P*.17,.97+P*.28];
 const back=[.79,.36,.22],front=[tip[0],tip[1],tip[2]-.11];
 capsule(sh,elbow,.145*A,1);
 capsule([.60,.59,.01],elbow,.171*A,0);
 sphere(...elbow,.145,3);
 capsule(elbow,front,.143*C,1);
 capsule(back,front,.18*C,0);
 capsule([.805,.34,.32],[tip[0]-.025,tip[1],tip[2]-.08],.155*C,0);
 const delta=tip.map((v,i)=>v-elbow[i]),len=Math.hypot(...delta);
 const forward=delta.map(v=>v/len);
 torus(tip,forward,.132*C,.038,4);
 sphere(...tip,.105*C,2);
 const mid=elbow.map((v,i)=>(v+tip[i])/2);
 torus(mid,forward,.178*C,.025,3);
 box([mid[0]+.16*C,mid[1],mid[2]],[.035,.06,.31*C],.025,0);
 box([mid[0]-.16*C,mid[1],mid[2]],[.035,.06,.31*C],.025,0);
}
