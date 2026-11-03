import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db, newId } from '../db'

// Toutes les requêtes triées/filtrées utilisées par les pages doivent correspondre à un index de la base.
// (Un tri sur un champ sans index fait planter la page : c'était le bug de la page Clients.)
describe('requêtes des pages', () => {
  it('chaque page peut lire ses données', async () => {
    const id = newId()
    await db.clients.add({ id, name: 'A', phone: '', deal: 'location', kind: '', budgetMax: 0, quarter: '', note: '', createdAt: 1 })
    await db.owners.add({ id: newId(), name: 'P', phone: '', whatsapp: '', note: '', createdAt: 1 } as never)
    await expect(db.owners.orderBy('name').toArray()).resolves.toHaveLength(1)
    await expect(db.properties.orderBy('createdAt').reverse().toArray()).resolves.toBeDefined()
    await expect(db.visits.orderBy('date').reverse().toArray()).resolves.toBeDefined()
    await expect(db.commissions.orderBy('date').reverse().toArray()).resolves.toBeDefined()
    await expect(db.clients.orderBy('name').toArray()).resolves.toHaveLength(1)
    await expect(db.visits.where('clientId').equals(id).toArray()).resolves.toBeDefined()
    await expect(db.visits.where('propertyId').equals('x').toArray()).resolves.toBeDefined()
    await expect(db.commissions.where('propertyId').equals('x').toArray()).resolves.toBeDefined()
    await expect(db.properties.where('ownerId').equals('x').toArray()).resolves.toBeDefined()
  })
})
