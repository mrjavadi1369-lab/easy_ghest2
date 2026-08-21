const CACHE_NAME = 'vam-manager-2026-v354-offline';
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './js/tailwindcss.js',
  './js/chart.umd.min.js',
  './js/chartjs-plugin-datalabels.min.js',
  './js/xlsx.full.min.js',
  './js/app.js',
  './css/app.css',
  './css/all.min.css',
  './css/vazirmatn.css',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './webfonts/fa-solid-900.woff2',
  './webfonts/fa-solid-900.ttf',
  './webfonts/fa-regular-400.woff2',
  './webfonts/fa-regular-400.ttf',
  './webfonts/fa-brands-400.woff2',
  './webfonts/fa-brands-400.ttf',
  './webfonts/fa-v4compatibility.woff2',
  './webfonts/fa-v4compatibility.ttf',
  './fonts/vazirmatn-arabic-300.woff2',
  './fonts/vazirmatn-arabic-400.woff2',
  './fonts/vazirmatn-arabic-500.woff2',
  './fonts/vazirmatn-arabic-600.woff2',
  './fonts/vazirmatn-arabic-700.woff2',
  './fonts/vazirmatn-latin-300.woff2',
  './fonts/vazirmatn-latin-400.woff2',
  './fonts/vazirmatn-latin-500.woff2',
  './fonts/vazirmatn-latin-600.woff2',
  './fonts/vazirmatn-latin-700.woff2'
];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>آفلاین — سیستم مدیریت وام</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:Tahoma,Arial,sans-serif;background:linear-gradient(145deg,#0f172a,#1e293b);color:#e2e8f0;text-align:center;padding:24px}
  .box{max-width:360px}
  .icon{font-size:48px;margin-bottom:12px}
  h1{font-size:1.25rem;margin:0 0 8px}
  p{color:#94a3b8;line-height:1.7;font-size:0.95rem}
  button{margin-top:16px;background:#4f46e5;color:#fff;border:none;border-radius:12px;padding:12px 20px;font-size:15px;cursor:pointer}
</style>
</head>
<body>
  <div class="box">
    <div class="icon">📡</div>
    <h1>اتصال برقرار نیست</h1>
    <p>برنامه آفلاین است. اگر قبلاً باز شده باشد، داده‌های ذخیره‌شده روی دستگاه در دسترس‌اند. اتصال را بررسی و دوباره تلاش کنید.</p>
    <button onclick="location.reload()">تلاش مجدد</button>
  </div>
</body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(LOCAL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() =>
        caches.open(CACHE_NAME).then((cache) =>
          Promise.all(LOCAL_ASSETS.map((url) => cache.add(url).catch(() => {})))
        ).then(() => self.skipWaiting())
      )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isNavigate(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).catch(() => new Response('', { status: 503 })))
    );
    return;
  }

  if (isNavigate(request)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('./index.html', clone));
          }
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) =>
            cached || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
          )
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return res;
      }).catch(() => {
        if (request.destination === 'image') {
          return caches.match('./icons/icon-192.png');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});


/* اعلان‌های سیستم */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = './index.html';
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          try {
            client.postMessage({ type: 'NOTIFICATION_CLICK', data: event.notification.data || {} });
          } catch (e) {}
          return;
        }
      }
      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});
