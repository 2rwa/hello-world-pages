export const INGREDIENTS={
  herb:{label:"🥬 若菜",short:"🥬",color:"#6ca957"},
  fire:{label:"🔥 火種",short:"🔥",color:"#cf633b"},
  spark:{label:"⚡ 雷粉",short:"⚡",color:"#d6ae39"}
};

export const NODES=[
  {id:"home",name:"おたま城",x:.10,y:.50,owner:"player",kind:null},
  {id:"herb",name:"若菜の森",x:.33,y:.25,owner:"neutral",kind:"herb"},
  {id:"fire",name:"火吹き峠",x:.34,y:.76,owner:"neutral",kind:"fire"},
  {id:"spark",name:"雷鳴塔",x:.65,y:.24,owner:"neutral",kind:"spark"},
  {id:"fort",name:"古い砦",x:.65,y:.75,owner:"neutral",kind:null},
  {id:"enemy",name:"敵の大厨房",x:.90,y:.50,owner:"enemy",kind:null}
];

export const EDGES=[
  ["home","herb"],["home","fire"],["herb","fire"],
  ["herb","spark"],["fire","fort"],["spark","fort"],
  ["spark","enemy"],["fort","enemy"]
];

export const GENERALS=[
  {id:"p1",team:"player",name:"ガレット",emoji:"🛡️",node:"home",power:1.35,speed:1.0,cook:0,maxTroops:82,prep:["herb","fire"]},
  {id:"p2",team:"player",name:"ピピン",emoji:"🐇",node:"home",power:.82,speed:1.55,cook:0,maxTroops:58,prep:["herb","spark"]},
  {id:"p3",team:"player",name:"ポルポ",emoji:"👨‍🍳",node:"home",power:.72,speed:.92,cook:2,maxTroops:66,prep:["fire","spark"]},
  {id:"e1",team:"enemy",name:"カラシ隊長",emoji:"🌶️",node:"enemy",power:1.05,speed:1.0,cook:0,maxTroops:76},
  {id:"e2",team:"enemy",name:"フライ卿",emoji:"🍳",node:"enemy",power:.9,speed:1.18,cook:0,maxTroops:68},
  {id:"e3",team:"enemy",name:"ヤカン公",emoji:"🫖",node:"enemy",power:1.18,speed:.82,cook:0,maxTroops:84}
];

const R={
  "herb+herb":[
    ["芽吹き小隊",22,8,0],["サラダ騎士団",48,18,0],["しおしお大根",30,4,9]],
  "fire+herb":[
    ["唐辛子スキッパー",28,0,0],["烈火ロック鳥",58,0,0],["炭化インプ",38,0,13]],
  "herb+spark":[
    ["しびれカブ",26,0,0],["稲妻シカ",55,4,0],["焦げコイル",37,0,12]],
  "fire+fire":[
    ["火の粉コブタ",30,0,0],["炉心オーガ",62,0,0],["灰かぶり雲",42,0,15]],
  "fire+spark":[
    ["爆ぜ豆マイン",32,0,0],["プラズマ猪",66,0,0],["切れたヒューズ",40,0,16]],
  "spark+spark":[
    ["瞬きダニ",25,0,0],["嵐クラゲ",60,6,0],["焼けた発電機",39,0,14]]
};
export const RECIPES=R;

export function recipeFor(a,b,stage){
  const key=[a,b].sort().join("+");
  const row=R[key][stage];
  return {name:row[0],damage:row[1],heal:row[2],self:row[3],key};
}
