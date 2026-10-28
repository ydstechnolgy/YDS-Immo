import { supabase } from './supabase'

export type DeviceKind = 'pc' | 'phone'

export interface LicenceResult {
  ok: boolean
  error?: string
  expiresAt?: string
  fromCache?: boolean
}

interface Cache {
  uid: string
  expiresAt: string
  checkedAt: number
}

// Hors ligne, la licence reste valable tant qu'elle n'a pas expiré
// et qu'elle a été vérifiée en ligne dans les 14 derniers jours.
export const OFFLINE_GRACE_MS = 14 * 24 * 3600 * 1000
const CACHE_KEY = 'yds.licence'

export function deviceId(): string {
  let id = localStorage.getItem('yds.deviceId')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('yds.deviceId', id)
  }
  return id
}

export function deviceKind(): DeviceKind {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'phone' : 'pc'
}

export function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Cache) : null
  } catch {
    return null
  }
}

const writeCache = (uid: string, expiresAt: string) =>
  localStorage.setItem(CACHE_KEY, JSON.stringify({ uid, expiresAt, checkedAt: Date.now() } satisfies Cache))

export const clearLicenceCache = () => localStorage.removeItem(CACHE_KEY)

// Décide si on peut ouvrir l'appli sans connexion à partir de la dernière vérification
export function evaluateCache(cache: Cache | null, uid: string, now = Date.now()): LicenceResult {
  if (!cache || cache.uid !== uid) return { ok: false, error: 'need_online' }
  if (new Date(cache.expiresAt).getTime() <= now) return { ok: false, error: 'expired', expiresAt: cache.expiresAt }
  if (now - cache.checkedAt > OFFLINE_GRACE_MS) return { ok: false, error: 'need_online', expiresAt: cache.expiresAt }
  return { ok: true, expiresAt: cache.expiresAt, fromCache: true }
}

export async function checkLicence(uid: string): Promise<LicenceResult> {
  if (!navigator.onLine) return evaluateCache(readCache(), uid)
  try {
    const { data, error } = await supabase.rpc('check_licence', { p_device_id: deviceId() })
    if (error) throw error
    if (data?.ok) {
      writeCache(uid, data.expires_at)
      return { ok: true, expiresAt: data.expires_at }
    }
    clearLicenceCache()
    return { ok: false, error: data?.error ?? 'unknown', expiresAt: data?.expires_at }
  } catch {
    // Serveur injoignable : on se rabat sur la dernière vérification
    return evaluateCache(readCache(), uid)
  }
}

export async function activateLicence(key: string, uid: string): Promise<LicenceResult> {
  try {
    const { data, error } = await supabase.rpc('activate_licence', {
      p_key: key,
      p_device_id: deviceId(),
      p_kind: deviceKind(),
    })
    if (error) throw error
    if (data?.ok) {
      writeCache(uid, data.expires_at)
      return { ok: true, expiresAt: data.expires_at }
    }
    return { ok: false, error: data?.error ?? 'unknown', expiresAt: data?.expires_at }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export const licenceMessage = (error?: string): string => {
  switch (error) {
    case 'invalid_key':
      return "Cette clé n'existe pas. Vérifie qu'elle est bien recopiée."
    case 'key_used':
      return 'Cette clé est déjà utilisée par un autre compte.'
    case 'expired':
      return 'Ta licence a expiré. Contacte YDS Tech pour la renouveler.'
    case 'device_limit':
      return 'Cette licence est déjà installée sur un autre appareil du même type (1 PC et 1 téléphone maximum).'
    case 'device_not_registered':
      return "Cet appareil n'est pas enregistré sur ta licence. Entre ta clé pour l'activer."
    case 'no_licence':
      return 'Entre ta clé d’activation pour commencer.'
    case 'need_online':
      return 'Connecte-toi à internet pour vérifier ta licence.'
    case 'network':
      return 'Pas de connexion internet. Réessaie.'
    case 'not_logged_in':
      return 'Reconnecte-toi.'
    default:
      return "Une erreur est survenue. Réessaie dans un instant."
  }
}

export const formatExpiry = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''
