import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type R = { id: string; user_id: string; data: any; updated_at: number; deleted: boolean }
const remote: Record<string, R[]> = {}
const uploads: { path: string; type?: string }[] = []
const removed: string[][] = []
const files: Record<string, Blob> = {}
let failUpload = false
let downloads = 0

vi.mock('../supabase', () => {
  const from = (table: string) => {
    remote[table] ??= []
    const q: any = {
      _since: 0,
      select() { return q },
      gte(_c: string, v: number) { q._since = v; return q },
      order() { return q },
      range(a: number, b: number) {
        const rows = remote[table].filter((r) => r.updated_at >= q._since).sort((x, y) => x.updated_at - y.updated_at)
        return Promise.resolve({ data: rows.slice(a, b + 1), error: null })
      },
      upsert(rows: R | R[]) {
        for (const r of Array.isArray(rows) ? rows : [rows]) {
          const i = remote[table].findIndex((x) => x.id === r.id)
          if (i >= 0) remote[table][i] = r
          else remote[table].push(r)
        }
        return Promise.resolve({ error: null })
      },
    }
    return q
  }
  const bucket = {
    upload(path: string, blob: Blob, opts: { contentType?: string }) {
      if (failUpload) return Promise.resolve({ error: new Error('réseau coupé') })
      uploads.push({ path, type: opts.contentType })
      files[path] = blob
      return Promise.resolve({ error: null })
    },
    download(path: string) {
      downloads++
      return Promise.resolve(files[path] ? { data: files[path], error: null } : { data: null, error: new Error('absent') })
    },
    remove(paths: string[]) {
      removed.push(paths)
      return Promise.resolve({ error: null })
    },
  }
  return {
    supabase: {
      from,
      storage: { from: () => bucket },
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1', email: 'a@b.c' } } } }),
        signOut: () => Promise.resolve({}),
      },
    },
  }
})

import { db, newId, clearLocalData } from '../db'
import { syncNow, pendingCount } from '../sync'
import { dataUrlToBlob, pendingPhotoCount, queuePhotoDeletes, resolvePhoto } from '../photos'
import type { Property } from '../types'

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='

const property = (photos: string[]): Property => ({
  id: newId(), kind: 'maison', deal: 'location', title: 'Villa', price: 50000, caution: 0, avance: 0,
  city: 'Lomé', quarter: 'Adidogomé', landmark: '', surface: 0, rooms: 0, bathrooms: 0, equipments: [],
  description: '', status: 'disponible', mandate: 'simple', photos, createdAt: Date.now(), updatedAt: Date.now(),
})

beforeEach(async () => {
  localStorage.clear()
  uploads.length = 0
  removed.length = 0
  downloads = 0
  failUpload = false
  for (const k of Object.keys(remote)) delete remote[k]
  for (const k of Object.keys(files)) delete files[k]
  await clearLocalData()
})

describe('photos', () => {
  it('convertit une photo base64 en fichier JPEG', () => {
    const b = dataUrlToBlob(PHOTO)
    expect(b.type).toBe('image/jpeg')
    expect(b.size).toBeGreaterThan(5)
  })

  it("envoie la photo dans le dossier de l'utilisateur et la remplace par sa référence", async () => {
    const p = property([PHOTO])
    await db.properties.add(p)
    expect(await pendingPhotoCount()).toBe(1)
    expect(await syncNow()).toBe(true)

    expect(uploads).toHaveLength(1)
    expect(uploads[0].path).toMatch(/^u1\/[0-9a-f-]{36}\.jpg$/)
    expect(uploads[0].type).toBe('image/jpeg')

    const local = await db.properties.get(p.id!)
    expect(local!.photos).toEqual([`sb:${uploads[0].path}`])
    expect((await db.photoCache.get(`sb:${uploads[0].path}`))?.dataUrl).toBe(PHOTO)
    // la fiche envoyée au serveur ne contient que la référence, jamais l'image
    expect(remote.properties[0].data.photos).toEqual([`sb:${uploads[0].path}`])
    expect(JSON.stringify(remote.properties[0])).not.toContain('base64')
    expect(await pendingPhotoCount()).toBe(0)
  })

  it("n'envoie pas deux fois une photo déjà envoyée", async () => {
    await db.properties.add(property([PHOTO]))
    await syncNow()
    await syncNow()
    expect(uploads).toHaveLength(1)
  })

  it("en cas d'échec d'envoi, la fiche part sans la photo et la photo reste en attente", async () => {
    failUpload = true
    const p = property([PHOTO])
    await db.properties.add(p)
    expect(await syncNow()).toBe(true) // les données ne sont pas bloquées par les photos
    expect(remote.properties[0].data.photos).toEqual([])
    expect((await db.properties.get(p.id!))!.photos).toEqual([PHOTO]) // toujours sur l'appareil
    expect(await pendingPhotoCount()).toBe(1)
    expect(await pendingCount()).toBeGreaterThanOrEqual(1) // empêche une déconnexion qui la perdrait

    failUpload = false
    await syncNow()
    expect(uploads).toHaveLength(1)
    expect((await db.properties.get(p.id!))!.photos[0]).toMatch(/^sb:u1\//)
    expect(await pendingPhotoCount()).toBe(0)
  })

  it('supprime du serveur une photo retirée ou un bien supprimé', async () => {
    const p = property([PHOTO])
    await db.properties.add(p)
    await syncNow()
    const ref = (await db.properties.get(p.id!))!.photos[0]
    await queuePhotoDeletes([ref, 'data:image/jpeg;base64,xxx']) // seule la photo du serveur est concernée
    expect(await db.photoDeletes.count()).toBe(1)
    await syncNow()
    expect(removed).toEqual([[ref.slice(3)]])
    expect(await db.photoDeletes.count()).toBe(0)
    expect(await db.photoCache.get(ref)).toBeUndefined()
  })

  it("affiche une photo du cache sans internet, ou la télécharge puis la garde", async () => {
    expect(await resolvePhoto(PHOTO)).toBe(PHOTO)

    await db.photoCache.put({ ref: 'sb:u1/cache.jpg', dataUrl: 'data:image/jpeg;base64,AAAA' })
    expect(await resolvePhoto('sb:u1/cache.jpg')).toBe('data:image/jpeg;base64,AAAA')
    expect(downloads).toBe(0)

    files['u1/autre.jpg'] = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    const url = await resolvePhoto('sb:u1/autre.jpg')
    expect(url).toMatch(/^data:image\/jpeg;base64,/)
    expect(downloads).toBe(1)
    await resolvePhoto('sb:u1/autre.jpg')
    expect(downloads).toBe(1) // déjà en cache

    expect(await resolvePhoto('sb:u1/inconnue.jpg')).toBeNull()
  })

  it("une fiche modifiée ailleurs ne fait pas disparaître une photo prise ici et pas encore envoyée", async () => {
    failUpload = true
    const p = property([PHOTO])
    await db.properties.add(p)
    await syncNow()
    // l'autre appareil modifie le titre, plus tard
    remote.properties[0] = {
      ...remote.properties[0],
      data: { ...remote.properties[0].data, title: 'Villa modifiée', photos: ['sb:u1/deja.jpg'] },
      updated_at: Date.now() + 10000,
    }
    await syncNow()
    const local = await db.properties.get(p.id!)
    expect(local!.title).toBe('Villa modifiée')
    expect(local!.photos).toEqual(['sb:u1/deja.jpg', PHOTO])
  })
})
