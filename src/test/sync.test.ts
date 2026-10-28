import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type R = { id: string; user_id: string; data: any; updated_at: number; deleted: boolean }
const remote: Record<string, R[]> = {}
const upserts: { table: string; rows: R[] }[] = []

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
        const list = Array.isArray(rows) ? rows : [rows]
        upserts.push({ table, rows: list })
        for (const r of list) {
          const i = remote[table].findIndex((x) => x.id === r.id)
          if (i >= 0) remote[table][i] = r
          else remote[table].push(r)
        }
        return Promise.resolve({ error: null })
      },
    }
    return q
  }
  return {
    supabase: {
      from,
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1', email: 'a@b.c' } } } }),
        signOut: () => Promise.resolve({}),
      },
    },
  }
})

import { db, newId, clearLocalData } from '../db'
import { syncNow, pendingCount } from '../sync'

const owner = (name: string) => ({ id: newId(), name, phone: '', whatsapp: '', note: '', createdAt: Date.now() })

beforeEach(async () => {
  localStorage.clear()
  upserts.length = 0
  for (const k of Object.keys(remote)) delete remote[k]
  await clearLocalData()
})

describe('synchronisation', () => {
  it('envoie un nouvel élément puis ne renvoie rien au second passage', async () => {
    const o = owner('Kofi')
    await db.owners.add(o)
    expect(await pendingCount()).toBe(1)
    expect(await syncNow()).toBe(true)
    expect(remote.owners).toHaveLength(1)
    expect(remote.owners[0].data.name).toBe('Kofi')
    expect(await pendingCount()).toBe(0)
    upserts.length = 0
    await syncNow()
    expect(upserts).toHaveLength(0)
  })

  it('envoie une modification avec une date plus récente', async () => {
    const o = owner('Ama')
    await db.owners.add(o)
    await syncNow()
    const t1 = remote.owners[0].updated_at
    await new Promise((r) => setTimeout(r, 5))
    await db.owners.update(o.id, { name: 'Ama K.' })
    await syncNow()
    expect(remote.owners[0].data.name).toBe('Ama K.')
    expect(remote.owners[0].updated_at).toBeGreaterThan(t1)
  })

  it('propage une suppression locale', async () => {
    const o = owner('Yao')
    await db.owners.add(o)
    await syncNow()
    await db.owners.delete(o.id)
    expect(await db.deletions.count()).toBe(1)
    await syncNow()
    expect(remote.owners[0].deleted).toBe(true)
    expect(await db.deletions.count()).toBe(0)
  })

  it("reçoit un élément créé sur un autre appareil, sans le renvoyer", async () => {
    const id = newId()
    remote.owners = [{ id, user_id: 'u1', data: { id, name: 'Esi', phone: '', whatsapp: '', note: '', createdAt: 1 }, updated_at: 5000, deleted: false }]
    await syncNow()
    expect((await db.owners.get(id))?.name).toBe('Esi')
    expect((await db.owners.get(id))?.updatedAt).toBe(5000)
    expect(upserts.filter((u) => u.table === 'owners' && u.rows.some((r) => r.id === id && !r.deleted)).length).toBeLessThanOrEqual(1)
    expect(await db.deletions.count()).toBe(0)
  })

  it("applique une suppression venant d'un autre appareil sans créer de trace locale", async () => {
    const o = owner('Dela')
    await db.owners.add(o)
    await syncNow()
    remote.owners[0] = { ...remote.owners[0], deleted: true, updated_at: Date.now() + 1000, data: {} }
    await syncNow()
    expect(await db.owners.get(o.id)).toBeUndefined()
    expect(await db.deletions.count()).toBe(0)
  })

  it('garde la version la plus récente en cas de conflit', async () => {
    const o = owner('Mawu')
    await db.owners.add(o)
    await syncNow()
    remote.owners[0] = { ...remote.owners[0], data: { ...remote.owners[0].data, name: 'Mawu (autre appareil)' }, updated_at: Date.now() + 5000 }
    await syncNow()
    expect((await db.owners.get(o.id))?.name).toBe('Mawu (autre appareil)')
  })
})
