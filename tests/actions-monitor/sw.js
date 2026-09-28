'use strict';
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=(event.notification.data&&event.notification.data.url)||'./';
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('focus' in client){
        try{
          if('navigate' in client&&target.startsWith('https://github.com/'))await client.navigate(target);
        }catch(_){}
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
