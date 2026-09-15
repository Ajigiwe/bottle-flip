// Flip Pure — Service Worker
// Caches all game assets for offline play using a Cache-First strategy.

const CACHE_NAME = 'flip-pure-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/src/style.css',
  '/src/main.js',
  '/src/physics.js',
  '/src/render.js',
  '/src/motion.js',
  '/src/audio.js',
  '/src/effects.js',
  '/src/leaderboard.js',
  '/src/achievements.js',
  '/src/skinSystem.js',
  '/src/eventBus.js',
  '/src/gameState.js',
];

// Install: pre-cache all listed assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first, fall back to network
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
