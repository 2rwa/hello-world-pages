import {GameModel} from "./model.js";
import {GameView} from "./view.js";

let model=new GameModel(),view;

function boot(){
  view=new GameView(model,{
    move:(id,n)=>model.move(id,n),
    prep:(id,slot,v)=>model.setPrep(id,slot,v),
    summon:sec=>model.summon(sec),
    retreat:()=>model.retreat(),
    restart:()=>{model=new GameModel();view.model=model;view.buildCards()}
  });
  if(new URLSearchParams(location.search).has("ci"))runCi();
  let last=performance.now();
  function frame(now){const dt=(now-last)/1000;last=now;model.tick(dt);view.render();requestAnimationFrame(frame)}
  requestAnimationFrame(frame);
}

function assert(cond,msg){if(!cond)throw new Error(msg)}

function runCi(){
  const root=document.documentElement;
  try{
    const selects=[...document.querySelectorAll('.general[data-id="p1"] select')];
    assert(selects.length===2,"prep selects missing");
    selects[0].value="spark";selects[0].dispatchEvent(new Event("change",{bubbles:true}));
    assert(model.unit("p1").prep[0]==="spark","prep UI did not update model");

    const p=model.unit("p1"),e=model.unit("e1");
    p.node="herb";p.lastNode="home";p.travel=null;p.path=[];p.troops=p.maxTroops;
    e.node="herb";e.travel=null;e.path=[];e.troops=e.maxTroops;
    model.resources={herb:9,fire:9,spark:9};
    assert(model.checkBattle(),"battle did not start");
    view.render();
    assert(!document.querySelector("#battle").classList.contains("hidden"),"battle overlay did not redraw");
    const before=e.troops;const result=model.summon(1.4);
    assert(result&&e.troops<before,"summon did not damage enemy");

    model.battle=null;p.node="home";e.node="enemy";
    assert(model.move("p2","fire"),"drag target route model failed");
    model.tick(4);
    assert(model.unit("p2").node==="fire"||model.unit("p2").travel,"movement did not advance");

    root.dataset.ciStatus="ok";
    root.dataset.ciChecks="prep-ui,battle-ui,summon,movement";
  }catch(err){
    root.dataset.ciStatus="error";root.dataset.ciError=String(err?.stack||err);console.error(err);
  }
}

boot();
