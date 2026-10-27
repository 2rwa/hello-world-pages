export function setting(id){return Number(document.getElementById(id).value);}
export function installInterface({canvas,reset,resize}){
  const panel=document.getElementById("panel");
  const toggle=document.getElementById("toggle");
  let yaw=0,pitch=0,impulse=null;
  for(const element of document.querySelectorAll('input[type="range"]')){
    const output=document.getElementById(element.id+"Value");
    if(output){
      const sync=()=>{output.textContent=Number(element.value).toFixed(2);};
      element.addEventListener("input",sync);sync();
    }
  }
  // The simulation toggles pause itself; this event is wired by app.js.
  document.getElementById("reset").addEventListener("click",reset);
  document.getElementById("resolution").addEventListener("input",resize);
  function setPanel(open){
    panel.classList.toggle("hidden",!open);
    toggle.setAttribute("aria-expanded",String(open));
  }
  if(innerWidth<=750)setPanel(false);
  toggle.addEventListener("click",()=>setPanel(panel.classList.contains("hidden")));
  document.getElementById("hide").addEventListener("click",()=>setPanel(false));
  let pointer=null;
  canvas.addEventListener("pointerdown",event=>{
    if(event.button!==0)return;
    pointer={x:event.clientX,y:event.clientY,previousX:event.clientX,previousY:event.clientY,moved:false};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove",event=>{
    if(!pointer)return;
    const dx=event.clientX-pointer.previousX,dy=event.clientY-pointer.previousY;
    if(Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>8)pointer.moved=true;
    if(pointer.moved){yaw+=dx*.0045;pitch=Math.max(-.30,Math.min(.3,pitch-dy*.003));}
    pointer.previousX=event.clientX;pointer.previousY=event.clientY;
  });
  canvas.addEventListener("pointerup",event=>{
    if(!pointer)return;
    if(!pointer.moved){
      const rect=canvas.getBoundingClientRect();
      const uvx=(event.clientX-rect.left)/rect.width*2-1;
      const uvy=1-(event.clientY-rect.top)/rect.height*2;
      const aspect=canvas.width/canvas.height;
      const dx=uvx*aspect*.82,dz=-1,dy=uvy*.78-.16+pitch;
      if(dy<-.015){
        const distance=setting("height")/-dy;
        const wx=(dx*Math.cos(yaw)+dz*Math.sin(yaw))*distance;
        const wz=(dz*Math.cos(yaw)-dx*Math.sin(yaw))*distance;
        impulse=[wx,wz,1.0];
      }
    }
    pointer=null;
  });
  canvas.addEventListener("pointercancel",()=>pointer=null);
  window.addEventListener("resize",resize);
  return {
    get yaw(){return yaw;},
    get pitch(){return pitch;},
    consumeImpulse(){const event=impulse;impulse=null;return event;},
    clearImpulse(){impulse=null;}
  };
}
