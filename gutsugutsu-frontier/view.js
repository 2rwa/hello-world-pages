import {INGREDIENTS,EDGES} from "./data.js";

const teamColor={player:"#356ea0",enemy:"#a7443c",neutral:"#8e806c"};
const lerp=(a,b,t)=>a+(b-a)*t;

export class GameView{
  constructor(model,handlers){
    this.model=model;this.handlers=handlers;this.canvas=document.querySelector("#map");this.ctx=this.canvas.getContext("2d");
    this.drag=null;this.chargeStart=0;this.toastTimer=0;this.cards=new Map();
    this.bindCanvas();this.buildCards();this.bindBattle();this.resize();addEventListener("resize",()=>this.resize());
  }
  resize(){
    const r=this.canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
    this.canvas.width=Math.round(r.width*d);this.canvas.height=Math.round(r.height*d);this.ctx.setTransform(d,0,0,d,0,0);this.w=r.width;this.h=r.height;
  }
  pos(node){return {x:node.x*this.w,y:node.y*this.h}}
  unitPos(u){
    if(u.travel){const a=this.pos(this.model.node(u.travel.from)),b=this.pos(this.model.node(u.travel.to));return{x:lerp(a.x,b.x,u.travel.progress),y:lerp(a.y,b.y,u.travel.progress)}}
    const p=this.pos(this.model.node(u.node));const same=this.model.units.filter(x=>!x.dead&&!x.travel&&x.node===u.node&&x.team===u.team);
    const i=same.indexOf(u),offset=(i-(same.length-1)/2)*22;return{x:p.x+offset,y:p.y+(u.team==="player"?-34:34)}
  }
  hitUnit(x,y){
    let best=null,d=28;for(const u of this.model.units){if(u.team!=="player"||u.dead)continue;const p=this.unitPos(u),dd=Math.hypot(x-p.x,y-p.y);if(dd<d){d=dd;best=u}}return best;
  }
  nearestNode(x,y){
    let best=null,d=55;for(const n of this.model.nodes){const p=this.pos(n),dd=Math.hypot(x-p.x,y-p.y);if(dd<d){d=dd;best=n}}return best;
  }
  pointer(e){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  bindCanvas(){
    this.canvas.addEventListener("pointerdown",e=>{const p=this.pointer(e),u=this.hitUnit(p.x,p.y);if(!u)return;this.drag={id:u.id,x:p.x,y:p.y};this.canvas.classList.add("dragging");this.canvas.setPointerCapture?.(e.pointerId)});
    this.canvas.addEventListener("pointermove",e=>{if(!this.drag)return;const p=this.pointer(e);this.drag.x=p.x;this.drag.y=p.y});
    const finish=e=>{if(!this.drag)return;const p=this.pointer(e),n=this.nearestNode(p.x,p.y),id=this.drag.id;this.drag=null;this.canvas.classList.remove("dragging");if(n&&!this.handlers.move(id,n.id))this.toast("そこへは今行けない")};
    this.canvas.addEventListener("pointerup",finish);this.canvas.addEventListener("pointercancel",()=>{this.drag=null;this.canvas.classList.remove("dragging")});
  }
  buildCards(){
    const root=document.querySelector("#generals");root.innerHTML="";
    for(const u of this.model.units.filter(x=>x.team==="player")){
      const el=document.createElement("div");el.className="general";el.dataset.id=u.id;
      el.innerHTML=`<div class="g-head"><span class="g-name">${u.emoji} ${u.name}</span><span class="g-stats">武${u.power.toFixed(1)} 速${u.speed.toFixed(1)} 料理${u.cook}</span></div><div class="g-state"></div><div class="prep"><select data-slot="0"></select><select data-slot="1"></select></div>`;
      for(const select of el.querySelectorAll("select"))for(const [k,v] of Object.entries(INGREDIENTS)){const o=document.createElement("option");o.value=k;o.textContent=v.label;select.append(o)}
      el.querySelectorAll("select").forEach((s,i)=>{s.value=u.prep[i];s.addEventListener("change",()=>this.handlers.prep(u.id,i,s.value))});
      root.append(el);this.cards.set(u.id,el);
    }
  }
  bindBattle(){
    this.battleEl=document.querySelector("#battle");this.pot=document.querySelector("#pot");
    this.pot.addEventListener("pointerdown",e=>{if(!this.model.battle)return;this.chargeStart=performance.now();this.pot.setPointerCapture?.(e.pointerId);e.preventDefault()});
    const release=e=>{if(!this.chargeStart)return;const sec=Math.min(3,(performance.now()-this.chargeStart)/1000);this.chargeStart=0;this.handlers.summon(sec);e?.preventDefault()};
    this.pot.addEventListener("pointerup",release);this.pot.addEventListener("pointercancel",()=>this.chargeStart=0);
    document.querySelector("#retreat").addEventListener("click",()=>this.handlers.retreat());
    document.querySelector("#restart").addEventListener("click",()=>this.handlers.restart());
  }
  toast(text){const el=document.querySelector("#toast");el.textContent=text;el.classList.add("show");clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.classList.remove("show"),1200)}
  render(){
    this.drawMap();this.updateHud();this.updateCards();this.updateBattle();this.updateEnding();
  }
  drawMap(){
    const c=this.ctx;c.clearRect(0,0,this.w,this.h);
    const g=c.createLinearGradient(0,0,0,this.h);g.addColorStop(0,"#a7c993");g.addColorStop(1,"#d8bd7c");c.fillStyle=g;c.fillRect(0,0,this.w,this.h);
    c.lineWidth=8;c.lineCap="round";c.strokeStyle="#826c4d";
    for(const [a,b] of EDGES){const pa=this.pos(this.model.node(a)),pb=this.pos(this.model.node(b));c.beginPath();c.moveTo(pa.x,pa.y);c.lineTo(pb.x,pb.y);c.stroke()}
    c.lineWidth=3;c.strokeStyle="#d7c499";
    for(const [a,b] of EDGES){const pa=this.pos(this.model.node(a)),pb=this.pos(this.model.node(b));c.beginPath();c.moveTo(pa.x,pa.y);c.lineTo(pb.x,pb.y);c.stroke()}
    for(const n of this.model.nodes)this.drawNode(n);
    for(const u of this.model.units)if(!u.dead)this.drawUnit(u);
    if(this.drag){c.strokeStyle="#fff8c7";c.lineWidth=4;c.setLineDash([7,7]);const u=this.model.unit(this.drag.id),p=this.unitPos(u);c.beginPath();c.moveTo(p.x,p.y);c.lineTo(this.drag.x,this.drag.y);c.stroke();c.setLineDash([])}
  }
  drawNode(n){
    const c=this.ctx,p=this.pos(n);c.save();c.translate(p.x,p.y);
    c.fillStyle="#f7e8bd";c.strokeStyle=teamColor[n.owner];c.lineWidth=6;c.beginPath();c.arc(0,0,29,0,Math.PI*2);c.fill();c.stroke();
    c.textAlign="center";c.textBaseline="middle";c.font="20px sans-serif";c.fillText(n.id==="home"?"🏰":n.id==="enemy"?"🍴":n.kind?INGREDIENTS[n.kind].short:"🧱",0,-1);
    c.font="700 11px sans-serif";c.fillStyle="#372b22";c.fillText(n.name,0,46);c.restore();
  }
  drawUnit(u){
    const c=this.ctx,p=this.unitPos(u);c.save();c.translate(p.x,p.y);c.fillStyle=u.team==="player"?"#e8f4ff":"#ffe7df";c.strokeStyle=teamColor[u.team];c.lineWidth=4;c.beginPath();c.arc(0,0,19,0,Math.PI*2);c.fill();c.stroke();c.textAlign="center";c.textBaseline="middle";c.font="18px sans-serif";c.fillText(u.emoji,0,0);c.font="9px sans-serif";c.fillStyle="#2e241d";c.fillText(Math.ceil(u.troops),0,29);c.restore();
  }
  updateHud(){
    for(const k of ["herb","fire","spark"])document.querySelector("#res-"+k).textContent=this.model.resources[k];
    document.querySelector("#boil").textContent=Math.round(this.model.boil)+"%";
    if(this.model.message&&this._msg!==this.model.message){this._msg=this.model.message;this.toast(this._msg)}
  }
  updateCards(){
    for(const u of this.model.units.filter(x=>x.team==="player")){const el=this.cards.get(u.id);el.classList.toggle("dead",u.dead);const state=u.dead?`再出撃まで ${Math.ceil(u.cooldown)}秒`:u.travel?`${this.model.node(u.travel.to).name}へ移動中`:this.model.node(u.node).name+` / 兵 ${Math.ceil(u.troops)}`;el.querySelector(".g-state").textContent=state;el.querySelectorAll("select").forEach((s,i)=>{s.disabled=!!this.model.battle||u.dead;s.value=u.prep[i]})}
  }
  updateBattle(){
    const b=this.model.battle;this.battleEl.classList.toggle("hidden",!b);if(!b){this.chargeStart=0;return}
    const p=this.model.unit(b.playerId),e=this.model.unit(b.enemyId);
    document.querySelector("#battle-player-name").textContent=p.emoji+" "+p.name;document.querySelector("#battle-enemy-name").textContent=e.emoji+" "+e.name;
    document.querySelector("#player-troops").textContent=`兵 ${Math.ceil(p.troops)}`;document.querySelector("#enemy-troops").textContent=`兵 ${Math.ceil(e.troops)}`;
    document.querySelector("#player-bar").style.width=`${100*p.troops/p.maxTroops}%`;document.querySelector("#enemy-bar").style.width=`${100*e.troops/e.maxTroops}%`;
    document.querySelector("#summon-result").textContent=this.model.lastSummon;
    const sec=this.chargeStart?Math.min(3,(performance.now()-this.chargeStart)/1000):0;document.querySelector("#charge-fill").style.width=`${sec/3*100}%`;
    this.pot.textContent=this.chargeStart?`🍲 ${sec.toFixed(1)}秒… 離して解放`:`🍲 ${p.prep.map(x=>INGREDIENTS[x].short).join("+")} を煮込む`;
  }
  updateEnding(){
    const el=document.querySelector("#ending"),result=this.model.gameOver;el.classList.toggle("hidden",!result);if(!result)return;
    document.querySelector("#ending-title").textContent=result==="win"?"大厨房、陥落！":"おたま城、沸騰…";
    document.querySelector("#ending-text").textContent=result==="win"?"低APMでも逆転の一手は気持ちよかった？":"弱い将軍の時間稼ぎと撤退をもっと使ってみよう。";
  }
}
