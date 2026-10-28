const CACHE = 'fieldnotes-shell-__CACHE_VERSION__';
// Let an updated worker wait until existing tabs finish with the old shell.
// Forced activation evicts their cached assets while they may still need them.
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(__PRECACHE_ASSETS__))); });
self.addEventListener('activate', event => { event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('fieldnotes-shell-') && k !== CACHE).map(k => caches.delete(k))))])); });
self.addEventListener('fetch', event => {
 const url = new URL(event.request.url);
 if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/auth')) return;
 if (event.request.mode === 'navigate') {
  event.respondWith(fetch(event.request).then(response => { if(response.ok) { const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put('/',copy)); } return response; }).catch(()=>caches.match('/').then(r=>r || new Response('首次使用需要连接网络。', {status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}}))));
 } else if (url.pathname.startsWith('/assets/') || ['/icon.svg','/manifest.webmanifest'].includes(url.pathname)) {
  event.respondWith(caches.match(event.request, {ignoreVary:true}).then(cached=>cached || fetch(event.request).then(response=>{ if(response.ok) { const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(event.request,copy)); } return response; })));
 }
});
