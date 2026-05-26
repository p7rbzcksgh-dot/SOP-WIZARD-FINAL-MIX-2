const CACHE_KILL_VERSION = 'tcg-sop-wizard-bugfix-2026-05-26-v2';
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => { /* caching intentionally disabled during rollout so GitHub Pages shows updates immediately */ });
