(function(root){
'use strict';
function install({shell,button,exitButton}){
 const active=()=>document.fullscreenElement===shell||document.body.classList.contains('v6-immersive');
 function update(){
  const full=active();
  button.textContent=full?'⛶ 全画面を終了':'⛶ 全画面';
  button.setAttribute('aria-pressed',String(full));
 }
 async function toggle(){
  try{
   if(document.fullscreenElement===shell)await document.exitFullscreen();
   else if(active())document.body.classList.remove('v6-immersive');
   else if(shell.requestFullscreen)await shell.requestFullscreen();
   else document.body.classList.add('v6-immersive');
  }catch(_){
   document.body.classList.toggle('v6-immersive');
  }
  update();
 }
 button.addEventListener('click',toggle);
 exitButton.addEventListener('click',toggle);
 document.addEventListener('fullscreenchange',update);
 document.addEventListener('webkitfullscreenchange',update);
 root.addEventListener('keydown',e=>{
  if(e.code==='Escape'&&document.body.classList.contains('v6-immersive')){
   document.body.classList.remove('v6-immersive');update();
  }
 });
 update();
 return{active,toggle};
}
root.OrbitFullscreenV6=Object.freeze({install});
})(globalThis);
