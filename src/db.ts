import Dexie, { type Table, type Transaction } from 'dexie'
import type { Client, Commission, Owner, Property, Visit } from './types'

export const SYNC_TABLES = ['owners', 'properties', 'clients', 'visits', 'commissions'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

// Trace d'une suppression à envoyer au serveur (pour que les autres appareils la reçoivent)
export interface Deletion {
  key: string // "table:id"
  table: SyncTable
  id: string
  updatedAt: number
}

class YdsImmoDB extends Dexie {
  owners!: Table<Owner, string>
  properties!: Table<Property, string>
  clients!: Table<Client, string>
  visits!: Table<Visit, string>
  commissions!: Table<Commission, string>
  deletions!: Table<Deletion, string>

  constructor() {
    super('yds-immo-v2')
    this.version(1).stores({
      owners: 'id, name, updatedAt',
      properties: 'id, ownerId, deal, kind, status, quarter, createdAt, updatedAt',
      clients: 'id, name, deal, kind, updatedAt',
      visits: 'id, propertyId, clientId, date, updatedAt',
      commissions: 'id, propertyId, date, updatedAt',
      deletions: 'key',
    })
  }
}

export const db = new YdsImmoDB()

export const newId = () => crypto.randomUUID()

// Les modifications venant du serveur ne doivent pas être renvoyées au serveur
export const REMOTE_FLAG = '__applyingRemote'
const isRemote = (trans: Transaction) => !!(trans as unknown as Record<string, unknown>)[REMOTE_FLAG]

const listeners: (() => void)[] = []
export const onLocalChange = (fn: () => void) => {
  listeners.push(fn)
}
const notify = () => listeners.forEach((fn) => fn())

for (const name of SYNC_TABLES) {
  const table = db[name] as Table<{ id?: string; updatedAt?: number }, string>

  table.hook('creating', function (_pk, obj, trans) {
    if (isRemote(trans)) return
    if (obj.updatedAt == null) obj.updatedAt = Date.now()
    this.onsuccess = () => notify()
  })

  table.hook('updating', function (_mods, _pk, _obj, trans) {
    if (isRemote(trans)) return
    this.onsuccess = () => notify()
    return { updatedAt: Date.now() }
  })

  table.hook('deleting', function (pk, _obj, trans) {
    if (isRemote(trans)) return
    const id = String(pk)
    this.onsuccess = () => {
      Dexie.ignoreTransaction(() =>
        db.deletions
          .put({ key: `${name}:${id}`, table: name, id, updatedAt: Date.now() })
          .then(notify),
      )
    }
  })
}

export async function clearLocalData() {
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db[t]), db.deletions], async (tx) => {
    ;(tx as unknown as Record<string, unknown>)[REMOTE_FLAG] = true
    await Promise.all([...SYNC_TABLES.map((t) => db[t].clear()), db.deletions.clear()])
  })
}
