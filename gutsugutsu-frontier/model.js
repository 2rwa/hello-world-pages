import {NODES,EDGES,GENERALS,recipeFor} from "./data.js";

const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class GameModel{
  constructor(){this.reset()}
  reset(){
    this.nodes=clone(NODES);
    this.units=clone(GENERALS).map(g=>({...g,troops:g.maxTroops,path:[],travel:null,dead:false,cooldown:0,lastNode:g.node}));
    this.resources={herb:4,fire:3,spark:3};
    this.resourceClock=0;this.aiClock=2;this.time=0;this.boil=0;
    this.battle=null;this.message="将軍をドラッグして中立拠点へ派遣しよう";
    this.lastSummon="";this.gameOver=null;
  }
  node(id){return this.nodes.find(n=>n.id===id)}
  unit(id){return this.units.find(u=>u.id===id)}
  neighbors(id){return EDGES.flatMap(e=>e[0]===id?[e[1]]:e[1]===id?[e[0]]:[])}
  route(from,to){
    if(from===to)return [];
    const q=[[from]],seen=new Set([from]);
    while(q.length){const p=q.shift(),last=p[p.length-1];for(const n of this.neighbors(last)){if(seen.has(n))continue;const np=[...p,n];if(n===to)return np.slice(1);seen.add(n);q.push(np)}}
    return [];
  }
  setPrep(id,slot,value){
    const u=this.unit(id);if(!u||u.team!=="player")return false;
    u.prep[slot]=value;this.message=`${u.name} の仕込みを変更`;return true;
  }
  move(id,target){
    const u=this.unit(id);if(!u||u.dead||u.travel||this.battle?.includes?.(id))return false;
    if(u.team==="player"&&this.battle&&(this.battle.playerId===id||this.battle.enemyId===id))return false;
    const path=this.route(u.node,target);if(!path.length)return false;
    u.path=path;this.startLeg(u);this.message=`${u.name} → ${this.node(target).name}`;return true;
  }
  startLeg(u){
    if(!u.path.length)return;
    const to=u.path.shift();u.travel={from:u.node,to,progress:0};u.lastNode=u.node;
  }
  tick(dt){
    if(this.gameOver)return;
    dt=Math.min(dt,.1);this.time+=dt;this.boil=clamp(this.time/180*100,0,100);
    this.produce(dt);this.respawn(dt);
    if(this.battle){this.tickBattle(dt);return}
    for(const u of this.units)if(!u.dead&&u.travel)this.tickTravel(u,dt);
    this.checkBattle();
    this.aiClock-=dt;if(this.aiClock<=0){this.aiClock=Math.max(1.8,4.8-this.boil*.025);this.runAi()}
  }
  produce(dt){
    this.resourceClock+=dt;if(this.resourceClock<3)return;
    this.resourceClock-=3;
    for(const n of this.nodes){if(n.owner==="player"&&n.kind)this.resources[n.kind]=Math.min(9,this.resources[n.kind]+1)}
  }
  respawn(dt){
    for(const u of this.units){if(!u.dead)continue;u.cooldown-=dt;if(u.cooldown>0)continue;u.dead=false;u.node=u.team==="player"?"home":"enemy";u.troops=Math.round(u.maxTroops*.72);u.path=[];u.travel=null;this.message=`${u.name} が再出撃`}
  }
  tickTravel(u,dt){
    const edgeTime=3.4/u.speed;u.travel.progress+=dt/edgeTime;
    if(u.travel.progress<1)return;
    u.node=u.travel.to;u.travel=null;
    this.captureIfSafe(u);
    if(!u.path.length)return;
    if(this.enemyAt(u.node,u.team))return;
    this.startLeg(u);
  }
  enemyAt(node,team){return this.units.some(u=>!u.dead&&!u.travel&&u.node===node&&u.team!==team)}
  captureIfSafe(u){
    if(this.enemyAt(u.node,u.team))return;
    const n=this.node(u.node);
    if(n.id==="home"&&u.team==="enemy"){this.end("lose");return}
    if(n.id==="enemy"&&u.team==="player"){this.end("win");return}
    if(n.owner!==u.team){n.owner=u.team;this.message=`${u.name} が ${n.name} を確保`}
  }
  checkBattle(){
    for(const n of this.nodes){
      const p=this.units.find(u=>!u.dead&&!u.travel&&u.node===n.id&&u.team==="player");
      const e=this.units.find(u=>!u.dead&&!u.travel&&u.node===n.id&&u.team==="enemy");
      if(p&&e){this.battle={node:n.id,playerId:p.id,enemyId:e.id,elapsed:0,enemyPot:5.2,stun:0};this.lastSummon="鍋はまだ静かだ…";this.message=`${n.name} で戦闘開始`;return true}
    }
    return false;
  }
  tickBattle(dt){
    const b=this.battle,p=this.unit(b.playerId),e=this.unit(b.enemyId);
    if(!p||!e||p.dead||e.dead){this.battle=null;return}
    b.elapsed+=dt;
    const heat=1+this.boil*.004;
    if(b.stun>0)b.stun-=dt;else p.troops-=e.power*2.05*heat*dt;
    e.troops-=p.power*1.9*dt;
    b.enemyPot-=dt;
    if(b.enemyPot<=0){
      const hit=13+this.boil*.10;p.troops-=hit;b.enemyPot=5.8;
      this.lastSummon=`${e.name} の乱暴な鍋！ -${Math.round(hit)}`
    }
    p.troops=Math.max(0,p.troops);e.troops=Math.max(0,e.troops);
    if(e.troops<=0)this.defeat(e,p);
    else if(p.troops<=0)this.defeat(p,e);
  }
  hasIngredients(prep){
    const need={herb:0,fire:0,spark:0};prep.forEach(x=>need[x]++);
    return Object.entries(need).every(([k,v])=>this.resources[k]>=v)
  }
  summon(charge){
    if(!this.battle)return null;
    const p=this.unit(this.battle.playerId),e=this.unit(this.battle.enemyId);
    if(!this.hasIngredients(p.prep)){this.lastSummon="材料が足りない！";return null}
    p.prep.forEach(k=>this.resources[k]--);
    const perfectEnd=2.15+p.cook*.18;
    const stage=charge<.85?0:charge<=perfectEnd?1:2;
    const r=recipeFor(p.prep[0],p.prep[1],stage);
    const cookBoost=1+p.cook*.08;
    const damage=Math.round(r.damage*cookBoost);
    e.troops=Math.max(0,e.troops-damage);
    p.troops=Math.min(p.maxTroops,Math.max(0,p.troops+r.heal-r.self));
    if(stage===1&&r.key==="fire+spark")this.battle.stun=1.5;
    const tag=stage===0?"浅炊き":stage===1?"適温！":"焦げ";
    this.lastSummon=`${tag}「${r.name}」 敵-${damage}${r.heal?` 味方+${r.heal}`:""}${r.self?` 自傷-${r.self}`:""}`;
    if(e.troops<=0)this.defeat(e,p);else if(p.troops<=0)this.defeat(p,e);
    return {stage,...r,damage};
  }
  retreat(){
    if(!this.battle)return false;
    const p=this.unit(this.battle.playerId);const fallback=p.lastNode||"home";
    p.node=fallback;p.troops=Math.max(1,p.troops-6);p.path=[];p.travel=null;
    this.battle=null;this.message=`${p.name} は ${this.node(fallback).name} へ撤退`;return true;
  }
  defeat(loser,winner){
    const node=loser.node;loser.dead=true;loser.cooldown=loser.team==="player"?13:11;loser.path=[];loser.travel=null;
    this.battle=null;this.lastSummon=`${loser.name} が吹き飛んだ！`;
    const n=this.node(node);
    if(n.id==="enemy"&&winner.team==="player"){this.end("win");return}
    if(n.id==="home"&&winner.team==="enemy"){this.end("lose");return}
    n.owner=winner.team;this.message=`${winner.name} が ${n.name} を制圧`;
    this.checkBattle();
  }
  runAi(){
    if(this.gameOver||this.battle)return;
    for(const u of this.units.filter(x=>x.team==="enemy"&&!x.dead&&!x.travel)){
      if(Math.random()>.72)continue;
      const candidates=this.nodes.filter(n=>n.owner!=="enemy");
      candidates.sort((a,b)=>{
        const ap=a.owner==="player"?-2:0,bp=b.owner==="player"?-2:0;
        return ap+this.route(u.node,a.id).length-(bp+this.route(u.node,b.id).length)
      });
      const t=candidates[0];if(t)this.move(u.id,t.id);
    }
  }
  end(result){this.gameOver=result;this.battle=null}
}
