// Service Worker para Oficina Smart v20.3
// Permite funcionamento offline e cache de recursos

const PRECACHE = 'oficina-smart-precache-v1';
const RUNTIME = 'oficina-smart-runtime';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/oficina_smart_v20_3_melhorado.html',
  '/offline.html',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512-maskable.png',
  'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Instalação - precache dos recursos essenciais
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(err => console.warn('Falha ao precachear:', err))
  );
});

// Ativação - limpar caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== PRECACHE && key !== RUNTIME)
            .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Função utilitária: resposta em timeout
function networkWithTimeout(request, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    fetch(request).then(response => {
      clearTimeout(timer);
      resolve(response);
    }).catch(err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Estratégia de fetch:
// - Navegações (document) => Network first, fallback para offline.html
// - Requisições same-origin (assets) => Cache first, então network e cache
// - Cross-origin (CDN) => Network first com timeout, então cache
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    // Não interferir com POST/PUT/DELETE (sync/upload)
    return;
  }

  const requestURL = new URL(event.request.url);

  // Navegação (páginas) - network first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Salva cópia no runtime cache
          const copy = response.clone();
          caches.open(RUNTIME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match('/offline.html').then(res => res || new Response('Offline - funcionalidade limitada', { status: 503, headers: { 'Content-Type': 'text/plain' } })))
    );
    return;
  }

  // Same-origin requests (assets, scripts) - cache first
  if (requestURL.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Evitar cachear respostas inválidas
          if (!response || response.status !== 200) return response;
          const respClone = response.clone();
          caches.open(RUNTIME).then(cache => cache.put(event.request, respClone));
          return response;
        }).catch(() => {
          // Se não estiver no cache e falhar, retorne mensagem simples
          return new Response('Offline - recurso não disponível', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        });
      })
    );
    return;
  }

  // Cross-origin (CDNs) - network first com timeout, depois cache
  event.respondWith(
    networkWithTimeout(event.request, 8000)
      .then(response => {
        // Guardar somente se for ok
        if (response && response.status === 200) {
          const rClone = response.clone();
          caches.open(RUNTIME).then(cache => cache.put(event.request, rClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || new Response('', { status: 504, statusText: 'Gateway Timeout' })))
  );
});

// Permite ao cliente forçar ativação imediata do novo SW
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});