import {GameModel} from "../model.js";

const ok=(v,m)=>{if(!v)throw new Error(m)};
const m=new GameModel();

ok(m.move("p2","fire"),"player route");
for(let i=0;i<50;i++)m.tick(.1);
ok(m.unit("p2").node==="fire"||m.unit("p2").travel,"movement advances");

const p=m.unit("p1"),e=m.unit("e1");
p.node="herb";p.travel=null;p.path=[];p.troops=p.maxTroops;
e.node="herb";e.travel=null;e.path=[];e.troops=e.maxTroops;
m.resources={herb:9,fire:9,spark:9};
ok(m.checkBattle(),"battle starts");
const before=e.troops;
const summon=m.summon(1.4);
ok(summon&&e.troops<before,"summon damages");
ok(m.resources.herb<9||m.resources.fire<9||m.resources.spark<9,"ingredients consumed");

console.log(JSON.stringify({status:"ok",summon:summon.name,before,after:e.troops}));
