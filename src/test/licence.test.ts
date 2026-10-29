import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))

import { EXPIRY_GRACE_MS, OFFLINE_GRACE_MS, evaluateCache, licenceMessage } from '../licence'

const DAY = 24 * 3600 * 1000
const now = Date.UTC(2026, 9, 28)
const iso = (t: number) => new Date(t).toISOString()

describe('licence hors ligne', () => {
  it('vaut 30 jours hors ligne et 7 jours de grâce', () => {
    expect(OFFLINE_GRACE_MS).toBe(30 * DAY)
    expect(EXPIRY_GRACE_MS).toBe(7 * DAY)
  })

  it('accepte une licence vérifiée récemment et non expirée', () => {
    const r = evaluateCache({ uid: 'u1', expiresAt: iso(now + 60 * DAY), checkedAt: now - 2 * DAY }, 'u1', now)
    expect(r).toMatchObject({ ok: true, grace: false })
  })

  it('accepte encore une vérification vieille de 29 jours', () => {
    const r = evaluateCache({ uid: 'u1', expiresAt: iso(now + 60 * DAY), checkedAt: now - 29 * DAY }, 'u1', now)
    expect(r.ok).toBe(true)
  })

  it('refuse sans vérification en ligne depuis plus de 30 jours', () => {
    const r = evaluateCache({ uid: 'u1', expiresAt: iso(now + 90 * DAY), checkedAt: now - 31 * DAY }, 'u1', now)
    expect(r).toMatchObject({ ok: false, error: 'need_online' })
  })

  it('autorise pendant les 7 jours de grâce, avec avertissement', () => {
    const r = evaluateCache({ uid: 'u1', expiresAt: iso(now - 3 * DAY), checkedAt: now - DAY }, 'u1', now)
    expect(r).toMatchObject({ ok: true, grace: true })
    expect(r.graceUntil).toBe(iso(now + 4 * DAY))
  })

  it('refuse après les 7 jours de grâce', () => {
    const r = evaluateCache({ uid: 'u1', expiresAt: iso(now - 8 * DAY), checkedAt: now - DAY }, 'u1', now)
    expect(r).toMatchObject({ ok: false, error: 'expired' })
  })

  it("refuse la licence mémorisée d'un autre compte", () => {
    const r = evaluateCache({ uid: 'autre', expiresAt: iso(now + 30 * DAY), checkedAt: now }, 'u1', now)
    expect(r.ok).toBe(false)
  })

  it("refuse quand rien n'a jamais été vérifié", () => {
    expect(evaluateCache(null, 'u1', now).ok).toBe(false)
  })
})

describe('messages', () => {
  it('propose le remplacement seulement si le client en a le droit', () => {
    expect(licenceMessage({ ok: false, error: 'device_limit', canReplace: true })).toContain('remplacer')
    expect(licenceMessage({ ok: false, error: 'device_limit', canReplace: false })).not.toContain('remplacer')
  })

  it('donne la date du prochain remplacement possible', () => {
    const m = licenceMessage({ ok: false, error: 'replace_too_soon', nextAt: '2026-11-28T00:00:00Z' })
    expect(m).toContain('2026')
  })

  it('connaît les nouvelles erreurs du serveur', () => {
    for (const e of ['too_many', 'suspended', 'expired', 'need_online']) {
      expect(licenceMessage(e)).not.toContain('Une erreur est survenue')
    }
  })
})
