/* Work Diary — 서비스 워커
 *
 * 하는 일은 두 가지뿐이다.
 *  1) 앱 껍데기(HTML·아이콘)를 캐시해서 두 번째부터 즉시 뜨게 하고, 잠깐 끊겨도 화면은 열리게 한다.
 *  2) 새 버전이 올라오면 페이지에 알려준다.
 *
 * 데이터(api.github.com)는 절대 캐시하지 않는다. 낡은 data.json 을 돌려주면
 * 앱이 옛 sha 로 저장을 시도해 충돌이 나기 때문이다.
 *
 * ※ 아이콘이나 index.html 을 바꿔 올릴 때는 아래 CACHE 이름의 날짜를 반드시 올릴 것.
 *    그래야 이미 설치한 기기가 새 파일을 받아간다.
 */
const CACHE = 'workdiary-2026-09-03a';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

// 파일 하나가 없어도 캐시가 통째로 실패하지 않도록 개별로 담는다.
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(async (url) => {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res && res.ok) await cache.put(url, res.clone());
    }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// 페이지가 "지금 바로 새 버전으로 교체" 하라고 알려올 때
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 데이터·인증 요청은 손대지 않는다 (항상 네트워크)
  if (url.hostname === 'api.github.com' || url.hostname === 'github.com') return;

  // 페이지 이동: 네트워크 우선, 안 되면 캐시된 화면이라도 띄운다
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // 그 밖의 같은 출처 파일(아이콘 등): 캐시 우선
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return hit || Response.error();
      }
    })());
    return;
  }

  // 웹폰트 같은 외부 자원: 네트워크 우선, 실패하면 캐시
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req)) || Response.error();
    }
  })());
});
