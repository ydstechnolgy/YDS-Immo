// Où tourne l'appli : application Windows (Tauri), application Android (Capacitor) ou navigateur ?
type Win = Window & { __TAURI_INTERNALS__?: unknown; Capacitor?: { isNativePlatform?: () => boolean } }

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as Win)
export const isCapacitor = () =>
  typeof window !== 'undefined' && !!(window as Win).Capacitor?.isNativePlatform?.()
export const isNative = () => isTauri() || isCapacitor()

export const APP_VERSION = __APP_VERSION__

// Dans l'appli Windows, un lien vers un autre site s'ouvre dans le navigateur de l'ordinateur
export function setupExternalLinks() {
  if (!isTauri()) return
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    if (!/^(https?:|mailto:|tel:)/i.test(href)) return
    e.preventDefault()
    void import('@tauri-apps/plugin-opener').then((m) => m.openUrl(href))
  })
}

// Site web : garde les fichiers pour s'ouvrir sans internet (inutile dans les applications installées)
export function registerOfflineCache() {
  if (isNative() || !('serviceWorker' in navigator) || import.meta.env.DEV) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* sans effet : le site marche quand même avec internet */
    })
  })
}

// Application Android : enregistre l'image dans le cache puis ouvre le partage du téléphone (WhatsApp, etc.)
export async function shareNative(blob: Blob, text: string, title: string) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const data = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })
  const path = `fiche-${Date.now()}.jpg`
  const { uri } = await Filesystem.writeFile({ path, data, directory: Directory.Cache })
  await Share.share({ title, text, files: [uri], dialogTitle: 'Partager la fiche' })
}
