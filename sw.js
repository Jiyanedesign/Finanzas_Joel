const CACHE_NAME = 'jiyanefinance-v15';

// Install: precache core shell
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Activar inmediatamente sin esperar
});

// Activate: borrar todas las cachés anteriores y tomar control
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first — siempre intentar traer del servidor primero
self.addEventListener('fetch', (e) => {
  // Nunca cachear API calls
  if (e.request.url.includes('/api/')) return;
  
  // Solo cachear peticiones GET
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Si obtenemos respuesta del servidor, guardar en caché y retornar
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Si no hay red, servir desde caché (modo offline)
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          // Fallback para navegación
          if (e.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
