import { useEffect, useState } from 'react'
import type { Table } from 'dexie'
import { SYNC_TABLES, REMOTE_FLAG, clearLocalData, db, onLocalChange, type SyncTable } from './db'
import { supabase } from './supabase'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'
export interface SyncInfo {
  state: SyncState
  lastSync: number | null
  error: string
}

let info: SyncInfo = { state: 'idle', lastSync: null, error: '' }
const subs = new Set<(i: SyncInfo) => void>()
const setInfo = (patch: Partial<SyncInfo>) => {
  info = { ...info, ...patch }
  subs.forEach((f) => f(info))
}

export function useSyncInfo() {
  const [i, setI] = useState(info)
  useEffect(() => {
    subs.add(setI)
    setI(info)
    return () => {
      subs.delete(setI)
    }
  }, [])
  return i
}

type Row = { id?: string; updatedAt?: number } & Record<string, unknown>
const tbl = (name: SyncTable) => db[name] as unknown as Table<Row, string>

const key = (uid: string, kind: 'pull' | 'push', t: SyncTable) => `yds.sync.${uid}.${kind}.${t}`
const getNum = (k: string) => Number(localStorage.getItem(k) || '0')

// Pages de 20 lignes : les fiches avec photos sont lourdes
const PAGE = 20

async function pull(uid: string) {
  for (const name of SYNC_TABLES) {
    const since = getNum(key(uid, 'pull', name))
    let max = since
    let offset = 0
    for (;;) {
      const { data, error } = await supabase
        .from(name)
        .select('id, data, updated_at, deleted')
        .gte('updated_at', since)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const rows = data ?? []
      if (rows.length) {
        await db.transaction('rw', [tbl(name), db.deletions], async (tx) => {
          ;(tx as unknown as Record<string, unknown>)[REMOTE_FLAG] = true
          for (const r of rows) {
            const local = await tbl(name).get(r.id)
            if (r.deleted) {
              if (local) await tbl(name).delete(r.id)
              continue
            }
            if (!local || (local.updatedAt ?? 0) < Number(r.updated_at)) {
              await tbl(name).put({ ...(r.data as Row), id: r.id, updatedAt: Number(r.updated_at) })
            }
          }
        })
        for (const r of rows) max = Math.max(max, Number(r.updated_at))
      }
      if (rows.length < PAGE) break
      offset += PAGE
    }
    localStorage.setItem(key(uid, 'pull', name), String(max))
  }
}

async function push(uid: string) {
  // 1. Suppressions
  const dels = await db.deletions.toArray()
  if (dels.length) {
    for (const d of dels) {
      const { error: e } = await supabase.from(d.table).upsert(
        { id: d.id, user_id: uid, data: {}, updated_at: d.updatedAt, deleted: true },
        { onConflict: 'id' },
      )
      if (e) throw e
      await db.deletions.delete(d.key)
    }
  }
  // 2. Créations et modifications
  for (const name of SYNC_TABLES) {
    const since = getNum(key(uid, 'push', name))
    const rows = await tbl(name).where('updatedAt').above(since).toArray()
    let max = since
    for (let i = 0; i < rows.length; i += 5) {
      const chunk = rows.slice(i, i + 5)
      const { error } = await supabase.from(name).upsert(
        chunk.map((r) => ({
          id: r.id,
          user_id: uid,
          data: r,
          updated_at: r.updatedAt ?? Date.now(),
          deleted: false,
        })),
        { onConflict: 'id' },
      )
      if (error) throw error
      for (const r of chunk) max = Math.max(max, r.updatedAt ?? 0)
      localStorage.setItem(key(uid, 'push', name), String(max))
    }
  }
}

let running = false
let again = false

export async function syncNow(): Promise<boolean> {
  if (running) {
    again = true
    return false
  }
  if (!navigator.onLine) {
    setInfo({ state: 'offline' })
    return false
  }
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return false

  running = true
  setInfo({ state: 'syncing', error: '' })
  try {
    await pull(uid) // d'abord récupérer ce qui est plus récent ailleurs
    await push(uid)
    setInfo({ state: 'idle', lastSync: Date.now(), error: '' })
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message || 'Erreur inconnue'
    setInfo({ state: navigator.onLine ? 'error' : 'offline', error: msg })
    return false
  } finally {
    running = false
    if (again) {
      again = false
      scheduleSync(500)
    }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
export function scheduleSync(delay = 3000) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

export async function pendingCount(): Promise<number> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return 0
  let n = await db.deletions.count()
  for (const name of SYNC_TABLES) {
    n += await tbl(name).where('updatedAt').above(getNum(key(uid, 'push', name))).count()
  }
  return n
}

let started = false
export function startSync() {
  if (started) return
  started = true
  onLocalChange(() => scheduleSync())
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('offline', () => setInfo({ state: 'offline' }))
  setInterval(() => {
    if (navigator.onLine) void syncNow()
  }, 60000)
  void syncNow()
}

// Appelé à la connexion : si un autre compte a utilisé cet appareil, on repart de zéro
export async function prepareForUser(uid: string) {
  const last = localStorage.getItem('yds.uid')
  if (last && last !== uid) await clearLocalData()
  localStorage.setItem('yds.uid', uid)
}

// Déconnexion : envoie d'abord les modifications en attente, puis efface les données de l'appareil
export async function signOutSafely(): Promise<{ ok: boolean; message?: string }> {
  await syncNow()
  const left = await pendingCount()
  if (left > 0) {
    return {
      ok: false,
      message: `${left} modification(s) ne sont pas encore envoyées. Connecte-toi à internet et réessaie, sinon elles seraient perdues.`,
    }
  }
  await clearLocalData()
  localStorage.removeItem('yds.uid')
  await supabase.auth.signOut({ scope: 'local' })
  return { ok: true }
}
