import Dexie, { type Table } from 'dexie'
import type { Client, Commission, Owner, Property, Visit } from './types'

class YdsImmoDB extends Dexie {
  owners!: Table<Owner, number>
  properties!: Table<Property, number>
  clients!: Table<Client, number>
  visits!: Table<Visit, number>
  commissions!: Table<Commission, number>

  constructor() {
    super('yds-immo')
    this.version(1).stores({
      owners: '++id, name, phone',
      properties: '++id, ownerId, deal, kind, status, quarter, createdAt',
      clients: '++id, name, deal, kind',
      visits: '++id, propertyId, clientId, date',
      commissions: '++id, propertyId, date',
    })
  }
}

export const db = new YdsImmoDB()
