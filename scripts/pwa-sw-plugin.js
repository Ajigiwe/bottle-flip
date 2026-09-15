/**
 * Vite plugin: offline PWA service worker for Flip Pure.
 *
 * Generates `dist/sw.js` at build time with a precache manifest of the REAL
 * hashed output files. A static public/sw.js can't do this because Vite
 * fingerprints bundle files (`index-B9bEb606.js`) and rewrites module paths —
 * hardcoding `/src/*.js` breaks offline caching in production.
 *
 * Strategy (unchanged from the original worker):
 *  - install: precache every build artifact + the shell documents
 *  - activate: purge old caches, take control immediately
 *  - fetch: cache-first, falling back to network; successful basic GETs are
 *    added to the cache at runtime
 */
import fs from 'node:fs';
import path from 'node:path';

export function pwaServiceWorker() {
  let publicDir = null;

  return {
    name: 'flip-pure-pwa-service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(options, bundle) {
      // At generateBundle time every chunk/asset already has its final hashed
      // fileName — collect all of them as precache entries so no asset can
      // be missed. (writeBundle is too late: files are already on disk by then.)
      const assetUrls = Object.values(bundle)
        .filter((file) => file.type === 'chunk' || file.type === 'asset')
        .filter((file) => file.fileName !== 'sw.js')
        .map((file) => `/${file.fileName}`);

      // Files copied straight from public/ never enter the bundle, so pick
      // them up from disk and add them to the precache manifest as well.
      let publicUrls = [];
      if (publicDir && fs.existsSync(publicDir)) {
        publicUrls = fs
          .readdirSync(publicDir, { recursive: true })
          .filter((f) => fs.statSync(path.join(publicDir, f)).isFile())
          .map((f) => `/${f.split(path.sep).join('/')}`);
      }

      const urls = ['/', '/index.html', ...new Set([...assetUrls, ...publicUrls])];
      const version = new Date().toISOString();
      const sw = `// Flip Pure — Service Worker (generated at build time — do not edit)
// Precaches the hashed production bundle for fully offline play.

const CACHE_NAME = 'flip-pure-${version}';

const PRECACHE_URLS = ${JSON.stringify(urls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

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
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}
