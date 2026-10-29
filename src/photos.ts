import { useEffect, useState } from 'react'
import { db, newId, requestSync } from './db'
import { supabase } from './supabase'

// Une photo d'une fiche est l'un de ces deux textes :
//   "data:image/jpeg;base64,..."  photo prise sur cet appareil, pas encore envoyée
//   "sb:<chemin>"                  photo envoyée dans Supabase Storage (dossier de l'utilisateur)
export const BUCKET = 'photos'
export const isLocalPhoto = (ref: string) => ref.startsWith('data:')
export const isRemotePhoto = (ref: string) => ref.startsWith('sb:')
export const pathOf = (ref: string) => ref.slice(3)

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(b)
  })

export function dataUrlToBlob(url: string): Blob {
  const [head, body = ''] = url.split(',')
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg'
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

const inflight = new Map<string, Promise<string | null>>()

// Donne de quoi afficher la photo : sa copie locale, sinon on la télécharge puis on la garde
export function resolvePhoto(ref: string): Promise<string | null> {
  if (isLocalPhoto(ref)) return Promise.resolve(ref)
  if (!isRemotePhoto(ref)) return Promise.resolve(null)
  const running = inflight.get(ref)
  if (running) return running
  const job = (async () => {
    const hit = await db.photoCache.get(ref)
    if (hit) return hit.dataUrl
    if (!navigator.onLine) return null
    const { data, error } = await supabase.storage.from(BUCKET).download(pathOf(ref))
    if (error || !data) return null
    const dataUrl = await blobToDataUrl(data)
    await db.photoCache.put({ ref, dataUrl })
    return dataUrl
  })()
    .catch(() => null)
    .finally(() => inflight.delete(ref))
  inflight.set(ref, job)
  return job
}

export function usePhoto(ref: string | undefined): string | null {
  const [src, setSrc] = useState<string | null>(ref && isLocalPhoto(ref) ? ref : null)
  useEffect(() => {
    let alive = true
    if (!ref) {
      setSrc(null)
      return
    }
    if (isLocalPhoto(ref)) {
      setSrc(ref)
      return
    }
    setSrc(null)
    void resolvePhoto(ref).then((s) => {
      if (alive) setSrc(s)
    })
    return () => {
      alive = false
    }
  }, [ref])
  return src
}

// Photos à supprimer du serveur (le client a retiré la photo ou supprimé le bien)
export async function queuePhotoDeletes(refs: string[]) {
  const remote = refs.filter(isRemotePhoto)
  if (!remote.length) return
  await db.photoDeletes.bulkPut(remote.map((ref) => ({ ref })))
  requestSync()
}

// Envoie les photos prises sur cet appareil. S'arrête à la première erreur : on réessaiera à la synchro suivante.
export async function uploadPendingPhotos(uid: string): Promise<void> {
  const props = await db.properties.toArray()
  for (const p of props) {
    for (const photo of p.photos) {
      if (!isLocalPhoto(photo)) continue
      const path = `${uid}/${newId()}.jpg`
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, dataUrlToBlob(photo), { contentType: 'image/jpeg', upsert: false })
      if (error) throw error
      const ref = `sb:${path}`
      await db.photoCache.put({ ref, dataUrl: photo })

      // On remplace dans la fiche la plus récente : elle a pu changer pendant l'envoi
      const replaced = await db.transaction('rw', db.properties, async () => {
        const fresh = await db.properties.get(p.id!)
        const i = fresh ? fresh.photos.indexOf(photo) : -1
        if (!fresh || i === -1) return false
        const photos = [...fresh.photos]
        photos[i] = ref
        await db.properties.update(p.id!, { photos })
        return true
      })
      // Fiche ou photo supprimée pendant l'envoi : on ne garde pas un fichier orphelin
      if (!replaced) await db.photoDeletes.put({ ref })
    }
  }
}

export async function deleteQueuedPhotos(): Promise<void> {
  const queued = await db.photoDeletes.toArray()
  if (!queued.length) return
  const { error } = await supabase.storage.from(BUCKET).remove(queued.map((q) => pathOf(q.ref)))
  if (error) throw error
  const refs = queued.map((q) => q.ref)
  await db.photoDeletes.bulkDelete(refs)
  await db.photoCache.bulkDelete(refs)
}

export async function pendingPhotoCount(): Promise<number> {
  let n = await db.photoDeletes.count()
  const props = await db.properties.toArray()
  for (const p of props) n += p.photos.filter(isLocalPhoto).length
  return n
}
