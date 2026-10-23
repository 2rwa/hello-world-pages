// Motion permission is intentionally requested within a real button click.
export function createTiltSensor(getElement,button,report){
 let active=false,received=false,baseline=null;
 let gravity=[0,0];
 function orientationAngle(){
   const angle=screen.orientation?.angle ?? window.orientation ?? 0;
   return ((Math.round(Number(angle)/90)*90)%360+360)%360;
 }
 function convertDeviceGravity(acc){
   const x=acc.x,y=acc.y;
   switch(orientationAngle()){
     case 90:return [-y,-x];
     case 180:return [x,-y];
     case 270:return [y,x];
     default:return [-x,y];
   }
 }
 function onMotion(event){
   const acc=event.accelerationIncludingGravity;
   if(!acc||!Number.isFinite(acc.x)||!Number.isFinite(acc.y))return;
   const axes=convertDeviceGravity(acc);
   if(!baseline)baseline=axes.slice();
   const invert=getElement('reverse').checked?-1:1;
   const targetX=Math.max(-9.8,Math.min(9.8,(axes[0]-baseline[0])*invert));
   const targetY=Math.max(-9.8,Math.min(9.8,(axes[1]-baseline[1])*invert));
   gravity[0]=gravity[0]*0.78+targetX*0.22;
   gravity[1]=gravity[1]*0.78+targetY*0.22;
   received=true;
 }
 button.addEventListener('click',async()=>{
   try{
     if(typeof DeviceMotionEvent==='undefined')throw Error('DeviceMotionEvent に非対応');
     if(typeof DeviceMotionEvent.requestPermission==='function'){
       const result=await DeviceMotionEvent.requestPermission();
       if(result!=='granted')throw Error('モーションセンサーの許可がありません');
     }
     if(!active){
       window.addEventListener('devicemotion',onMotion,{passive:true});
       active=true;
     }
     baseline=null;received=false;
     button.textContent='センサー有効・再設定';
     report('センサー待機中… 端末を少し傾けてください');
     setTimeout(()=>{
       if(active&&!received)report('センサーデータなし。設定を確認するか指でドラッグしてください。');
     },2200);
   }catch(error){report(String(error.message||error)+' ／ ドラッグ操作も使えます');}
 });
 getElement('recenter').addEventListener('click',()=>{
   baseline=null;gravity=[0,0];report('現在の角度を水平基準にします');
 });
 return {get gravity(){return gravity},get active(){return active},get received(){return received}};
}
