/* VASABI service worker — приложение работает полностью локально.
   • Страница, иконки, фото машин и шрифты хранятся на телефоне и открываются мгновенно, даже без интернета.
   • Когда интернет есть, новая версия тихо скачивается в фоне и включается при следующем запуске.
   • Меню (menu.txt) проверяется в фоне; без интернета берётся последнее сохранённое.
   При обновлении файлов увеличьте номер версии ниже. */
const VERSION = 'vasabi-v1.25.1';
const CACHE = VERSION;
const FONT_CACHE = 'vasabi-fonts';          // шрифты не удаляем при обновлениях
const SHELL = [
  './',
  './index.html',
  './menu.txt',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-64.png'
];
const OPTIONAL = [
  './cars/1.jpg', './cars/1-s.jpg', './cars/2.jpg', './cars/2-s.jpg', './cars/3.jpg', './cars/3-s.jpg', './cars/4.jpg', './cars/4-s.jpg', './cars/5.jpg', './cars/5-s.jpg', './cars/6.jpg', './cars/6-s.jpg', './cars/7.jpg', './cars/7-s.jpg', './cars/8.jpg', './cars/8-s.jpg', './cars/9.jpg', './cars/9-s.jpg', './cars/10.jpg', './cars/10-s.jpg', './cars/11.jpg', './cars/11-s.jpg',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Unbounded:wght@500;600;700;800&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    await Promise.all(OPTIONAL.map(u => {
      const cross = u.startsWith('http');
      return (cross ? caches.open(FONT_CACHE) : Promise.resolve(c))
        .then(cc => fetch(new Request(u, cross ? { mode: 'no-cors' } : {})).then(r => (r.ok || r.type === 'opaque') && cc.put(u, r)))
        .catch(() => {});
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const putCache = (name, key, res) => caches.open(name).then(c => c.put(key, res)).catch(() => {});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Шрифты Google — с телефона; если их ещё нет, скачиваем и сохраняем
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { cacheName: FONT_CACHE }) || await caches.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') putCache(FONT_CACHE, req, r.clone()); return r; }
      catch (err) { return new Response('', { status: 504 }); }
    })());
    return;
  }
  if (url.origin !== location.origin) return;

  // Меню: сначала свежее из интернета (не дольше 3 секунд), иначе сохранённое
  if (url.pathname.endsWith('/menu.txt')) {
    e.respondWith((async () => {
      const cached = caches.match('./menu.txt');
      try {
        const r = await Promise.race([fetch(req, { cache: 'no-store' }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);
        if (r && r.ok) { putCache(CACHE, './menu.txt', r.clone()); return r; }
      } catch (err) {}
      return (await cached) || new Response('', { status: 504 });
    })());
    return;
  }

  // Страница: мгновенно с телефона, а в фоне — проверка обновления
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    e.respondWith((async () => {
      const cached = await caches.match('./index.html') || await caches.match('./');
      const update = fetch(req, { cache: 'no-cache' }).then(r => {
        if (r.ok && r.type === 'basic') { putCache(CACHE, './index.html', r.clone()); putCache(CACHE, './', r.clone()); }
        return r;
      }).catch(() => null);
      if (cached) { e.waitUntil(update); return cached; }
      return (await update) || new Response('<h1>Нет интернета</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    })());
    return;
  }

  // Остальное (иконки, фото): с телефона, если нет — скачать и сохранить
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { const r = await fetch(req); if (r.ok) putCache(CACHE, req, r.clone()); return r; }
    catch (err) { return new Response('', { status: 504 }); }
  })());
});
