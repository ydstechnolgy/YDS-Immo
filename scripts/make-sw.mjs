// Après `vite build` : écrit dist/sw.js, la liste des fichiers à garder pour ouvrir le site sans internet.
// Le nom du cache change à chaque version : l'ancienne version est supprimée à l'activation.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const dist = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else files.push(relative(dist, full).split(sep).join('/'))
  }
}
walk(dist)

const precache = files.filter((f) => f !== 'sw.js')
const hash = createHash('sha256')
for (const f of precache.sort()) hash.update(f).update(readFileSync(join(dist, f)))
const version = hash.digest('hex').slice(0, 12)

const sw = `// Généré par scripts/make-sw.mjs : ne pas modifier à la main
const CACHE = 'yds-immo-${version}'
const FILES = ${JSON.stringify(['./', ...precache], null, 0)}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('yds-immo-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Seuls les fichiers du site sont servis depuis le cache. Supabase (autre domaine) n'est jamais touché.
self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit
      if (req.mode === 'navigate') return caches.match('./')
      return fetch(req)
    }),
  )
})
`
writeFileSync(join(dist, 'sw.js'), sw)
console.log(`sw.js : ${precache.length} fichiers, cache yds-immo-${version}`)
