// 极简 service worker：只为满足“添加到主屏幕”的安装条件，不缓存任何东西。
// 所有请求直接走网络，不拦截、不存缓存，所以不会出现旧版本包打不开的问题。
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // 直通：不调用 event.respondWith()，请求按默认方式走网络
})
