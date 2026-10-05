export const VOWEL_META = {
  iy:{label:'i',ipa:'/i/',word:'heed'},
  ih:{label:'ɪ',ipa:'/ɪ/',word:'hid'},
  ey:{label:'eɪ',ipa:'/eɪ/',word:'hayed'},
  eh:{label:'ɛ',ipa:'/ɛ/',word:'head'},
  ae:{label:'æ',ipa:'/æ/',word:'had'},
  ah:{label:'ɑ',ipa:'/ɑ/',word:'hod'},
  aw:{label:'ɔ',ipa:'/ɔ/',word:'hawed'},
  oa:{label:'oʊ',ipa:'/oʊ/',word:'hoed'},
  oo:{label:'ʊ',ipa:'/ʊ/',word:'hood'},
  uw:{label:'u',ipa:'/u/',word:"who'd"},
  uh:{label:'ʌ',ipa:'/ʌ/',word:'hud'},
  er:{label:'ɝ',ipa:'/ɝ/',word:'heard'},
};

const MEN = {
  iy:[342,2322,3000], ih:[427,2034,2684], ey:[476,2089,2691], eh:[580,1799,2605],
  ae:[588,1952,2601], ah:[768,1333,2522], aw:[652,997,2538], oa:[497,910,2459],
  oo:[469,1122,2434], uw:[378,997,2343], uh:[623,1200,2550], er:[474,1379,1710],
};
const WOMEN = {
  iy:[437,2761,3372], ih:[483,2365,3053], ey:[536,2530,3047], eh:[731,2058,2979],
  ae:[669,2349,2972], ah:[936,1551,2815], aw:[781,1136,2824], oa:[555,1035,2828],
  oo:[519,1225,2827], uw:[459,1105,2735], uh:[753,1426,2933], er:[523,1588,1929],
};

function build(raw){
  return Object.fromEntries(Object.entries(raw).map(([key,v])=>[
    key,{...VOWEL_META[key],f1:v[0],f2:v[1],f3:v[2]}
  ]));
}
function average(a,b){
  const out={};
  for(const key of Object.keys(a)) out[key]=a[key].map((v,i)=>(v+b[key][i])/2);
  return out;
}
export const PROFILES = {
  adult:{name:'Adult average',refs:build(average(MEN,WOMEN))},
  men:{name:'Men (Hillenbrand)',refs:build(MEN)},
  women:{name:'Women (Hillenbrand)',refs:build(WOMEN)},
};
export function cloneProfile(name='adult'){
  const src=PROFILES[name]?.refs||PROFILES.adult.refs;
  return Object.fromEntries(Object.entries(src).map(([k,v])=>[k,{...v}]));
}
