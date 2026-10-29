import { supabase } from './supabase'

export type DeviceKind = 'pc' | 'phone'

export interface LicenceResult {
  ok: boolean
  error?: string
  expiresAt?: string
  // Licence expirée mais encore dans les 7 jours de grâce : le logiciel marche, avec un avertissement
  grace?: boolean
  graceUntil?: string
  // device_limit : le client peut remplacer son ancien appareil par celui-ci
  canReplace?: boolean
  // replace_too_soon : date à partir de laquelle le remplacement sera possible
  nextAt?: string
  fromCache?: boolean
}

interface Cache {
  uid: string
  expiresAt: string
  checkedAt: number
}

const DAY = 24 * 3600 * 1000
// Hors ligne : la preuve d'une vérification en ligne reste valable 30 jours (comme YDS Beauty)
export const OFFLINE_GRACE_MS = 30 * DAY
// Après la date de fin : 7 jours de grâce, puis le logiciel demande de renouveler
export const EXPIRY_GRACE_MS = 7 * DAY
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

// Décide si on peut ouvrir l'appli sans connexion, à partir de la dernière vérification en ligne
export function evaluateCache(cache: Cache | null, uid: string, now = Date.now()): LicenceResult {
  if (!cache || cache.uid !== uid) return { ok: false, error: 'need_online' }
  const end = new Date(cache.expiresAt).getTime()
  if (now >= end + EXPIRY_GRACE_MS) return { ok: false, error: 'expired', expiresAt: cache.expiresAt }
  if (now - cache.checkedAt > OFFLINE_GRACE_MS) return { ok: false, error: 'need_online', expiresAt: cache.expiresAt }
  const grace = now >= end
  return {
    ok: true,
    expiresAt: cache.expiresAt,
    grace,
    graceUntil: grace ? new Date(end + EXPIRY_GRACE_MS).toISOString() : undefined,
    fromCache: true,
  }
}

interface ServerReply {
  ok?: boolean
  error?: string
  expires_at?: string
  grace?: boolean
  grace_until?: string
  can_replace?: boolean
  next_at?: string
}

function fromServer(uid: string, d: ServerReply | null): LicenceResult {
  if (d?.ok && d.expires_at) {
    writeCache(uid, d.expires_at)
    return { ok: true, expiresAt: d.expires_at, grace: !!d.grace, graceUntil: d.grace_until }
  }
  return {
    ok: false,
    error: d?.error ?? 'unknown',
    expiresAt: d?.expires_at,
    canReplace: d?.can_replace,
    nextAt: d?.next_at,
  }
}

export async function checkLicence(uid: string): Promise<LicenceResult> {
  if (!navigator.onLine) return evaluateCache(readCache(), uid)
  try {
    const { data, error } = await supabase.rpc('check_licence', { p_device_id: deviceId() })
    if (error) throw error
    const r = fromServer(uid, data as ServerReply)
    if (!r.ok) clearLicenceCache()
    return r
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
    return fromServer(uid, data as ServerReply)
  } catch {
    return { ok: false, error: 'network' }
  }
}

// Le client remplace son ancien appareil du même type par celui-ci (1 fois tous les 30 jours)
export async function replaceDevice(uid: string): Promise<LicenceResult> {
  try {
    const { data, error } = await supabase.rpc('replace_licence_device', {
      p_device_id: deviceId(),
      p_kind: deviceKind(),
    })
    if (error) throw error
    return fromServer(uid, data as ServerReply)
  } catch {
    return { ok: false, error: 'network' }
  }
}

export const formatExpiry = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''

export const licenceMessage = (r: LicenceResult | string | undefined): string => {
  const res: LicenceResult = typeof r === 'string' || r === undefined ? { ok: false, error: r } : r
  const kind = deviceKind() === 'phone' ? 'téléphone' : 'PC'
  switch (res.error) {
    case 'invalid_key':
      return "Cette clé n'existe pas. Vérifie qu'elle est bien recopiée."
    case 'key_used':
      return 'Cette clé est déjà utilisée par un autre compte.'
    case 'too_many':
      return 'Trop de clés incorrectes. Réessaie dans une heure.'
    case 'suspended':
      return 'Cette licence est suspendue. Contacte YDS Tech.'
    case 'expired':
      return 'Ta licence a expiré. Contacte YDS Tech pour la renouveler.'
    case 'device_limit':
      return res.canReplace
        ? `Cette licence est déjà installée sur un autre ${kind}. Tu peux le remplacer par celui-ci (une fois tous les 30 jours).`
        : `Cette licence est déjà installée sur un autre ${kind}.`
    case 'replace_too_soon':
      return `Tu as déjà remplacé un appareil récemment. Prochain remplacement possible le ${formatExpiry(res.nextAt)}. Sinon, contacte YDS Tech.`
    case 'device_not_registered':
      return "Cet appareil n'est pas encore enregistré sur ta licence. Entre ta clé pour l'activer."
    case 'no_licence':
      return 'Entre ta clé d’activation pour commencer.'
    case 'need_online':
      return 'Connecte-toi à internet pour vérifier ta licence.'
    case 'network':
      return 'Pas de connexion internet. Réessaie.'
    case 'not_logged_in':
      return 'Reconnecte-toi.'
    default:
      return 'Une erreur est survenue. Réessaie dans un instant.'
  }
}
