const scope = self.registration.scope
const cachePrefix = `savemoney:${scope}:`
const cacheName = cachePrefix + BUILD_VERSION
const startUrl = new URL(scope)
const indexUrl = new URL('index.html', startUrl).href
const appFiles = new Set(BUILD_FILES.map((file) => new URL(file, scope).href))

self.addEventListener('install', (event) => {
  const requests = [...appFiles].map((url) => new Request(url, { cache: 'reload' }))
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(requests)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const oldCaches = (await caches.keys()).filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
    await Promise.all(oldCaches.map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== startUrl.origin) return
  const isHomePage = url.pathname === startUrl.pathname || url.pathname === new URL(indexUrl).pathname
  if (request.mode === 'navigate' && isHomePage) {
    event.respondWith(serveAsset(indexUrl, request))
  } else if (appFiles.has(request.url)) {
    event.respondWith(serveAsset(request.url, request))
  }
})

async function serveAsset(url, request) {
  const cache = await caches.open(cacheName)
  // Эти же файлы раздаются всем клиентам. Запросы на модули могут добавить Origin.
  return (await cache.match(url, { ignoreVary: true })) ?? fetch(request)
}
