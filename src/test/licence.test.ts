import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))

import { OFFLINE_GRACE_MS, evaluateCache } from '../licence'

const DAY = 24 * 3600 * 1000
const now = Date.UTC(2026, 9, 28)
const iso = (t: number) => new Date(t).toISOString()

describe('licence hors ligne', () => {
  it('accepte une licence vérifiée récemment et non expirée', () => {
    const r = evaluateCache({ uid: 'u1', expiresAt: iso(now + 30 * DAY), checkedAt: now - 2 * DAY }, 'u1', now)
    expect(r.ok).toBe(true)
  })

  it('refuse sans vérification en ligne dans les 14 jours', () => {
    const r = evaluateCache({ uid: 'u1', expiresAt: iso(now + 30 * DAY), checkedAt: now - OFFLINE_GRACE_MS - DAY }, 'u1', now)
    expect(r).toMatchObject({ ok: false, error: 'need_online' })
  })

  it('refuse une licence expirée même vérifiée hier', () => {
    const r = evaluateCache({ uid: 'u1', expiresAt: iso(now - DAY), checkedAt: now - DAY }, 'u1', now)
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
