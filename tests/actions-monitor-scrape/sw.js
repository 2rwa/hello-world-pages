'use strict';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const u=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil((async()=>{
    const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of cs){
      try{if(u.startsWith('https://github.com/')&&'navigate' in c)await c.navigate(u)}catch(_){}
      if('focus' in c)return c.focus();
    }
    return self.clients.openWindow(u);
  })());
});
