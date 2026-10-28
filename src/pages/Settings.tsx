import { useEffect, useState } from 'react'
import { Download, LogOut, RefreshCw, Upload } from 'lucide-react'
import { db } from '../db'
import { supabase } from '../supabase'
import { signOutSafely, syncNow, useSyncInfo } from '../sync'
import { deviceKind, formatExpiry, readCache } from '../licence'
import { Field, Top, settings } from '../ui'

export function SettingsPage() {
  const s = settings.get()
  const [name, setName] = useState(s.name)
  const [phone, setPhone] = useState(s.phone)
  const [rate, setRate] = useState(String(s.rate || ''))
  const [saved, setSaved] = useState(false)
  const [email, setEmail] = useState('')
  const [outMsg, setOutMsg] = useState('')
  const sync = useSyncInfo()
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ''))
  }, [])

  const logout = async () => {
    if (!window.confirm('Te déconnecter ? Les données de cet appareil seront effacées après envoi au serveur.')) return
    const r = await signOutSafely()
    if (!r.ok) setOutMsg(r.message ?? '')
  }

  const save = () => {
    settings.set('agentName', name)
    settings.set('agentPhone', phone)
    settings.set('rate', rate.replace(',', '.'))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const exportAll = async () => {
    const data = {
      version: 1,
      owners: await db.owners.toArray(),
      properties: await db.properties.toArray(),
      clients: await db.clients.toArray(),
      visits: await db.visits.toArray(),
      commissions: await db.commissions.toArray(),
    }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `yds-immo-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const importAll = async (file?: File) => {
    if (!file) return
    if (!window.confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return
    const data = JSON.parse(await file.text())
    await db.transaction('rw', [db.owners, db.properties, db.clients, db.visits, db.commissions], async () => {
      await Promise.all([db.owners.clear(), db.properties.clear(), db.clients.clear(), db.visits.clear(), db.commissions.clear()])
      await db.owners.bulkAdd(data.owners ?? [])
      await db.properties.bulkAdd(data.properties ?? [])
      await db.clients.bulkAdd(data.clients ?? [])
      await db.visits.bulkAdd(data.visits ?? [])
      await db.commissions.bulkAdd(data.commissions ?? [])
    })
    alert('Sauvegarde restaurée ✔')
  }

  return (
    <>
      <Top title="Réglages" />
      <h2>Mon compte</h2>
      <div className="card">
        <div className="kv"><span>Email</span><span>{email || '—'}</span></div>
        <div className="kv"><span>Licence valable jusqu'au</span><span>{formatExpiry(readCache()?.expiresAt) || '—'}</span></div>
        <div className="kv"><span>Cet appareil</span><span>{deviceKind() === 'phone' ? 'Téléphone' : 'PC'}</span></div>
        <div className="kv">
          <span>Synchronisation</span>
          <span>
            {sync.state === 'syncing' ? 'En cours…' : sync.state === 'offline' ? 'Hors ligne' : sync.state === 'error' ? 'Erreur' : 'À jour'}
            {sync.lastSync ? ` · ${new Date(sync.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
        </div>
        {sync.error && <p className="small" style={{ color: 'var(--bad)' }}>{sync.error}</p>}
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button className="btn alt sm grow" onClick={() => void syncNow()}><RefreshCw size={18} /> Synchroniser maintenant</button>
          <button className="btn danger sm" onClick={logout}><LogOut size={18} /> Déconnexion</button>
        </div>
        {outMsg && <p className="small" style={{ color: 'var(--warn)' }}>{outMsg}</p>}
      </div>

      <h2>Mes infos</h2>
      <p className="muted small">Elles apparaissent sur les fiches que tu partages avec tes clients.</p>
      <Field label="Mon nom">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Mon numéro">
        <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Ma commission habituelle (%)">
        <input inputMode="decimal" placeholder="Ex : 10" value={rate} onChange={(e) => setRate(e.target.value)} />
      </Field>
      <button className="btn block" style={{ marginTop: 18 }} onClick={save}>
        {saved ? 'Enregistré ✔' : 'Enregistrer'}
      </button>

      <h2>Sauvegarde</h2>
      <p className="muted small">Tes données sont dans cet appareil. Fais une sauvegarde de temps en temps (la synchronisation automatique arrive à l'étape suivante).</p>
      <div className="row wrap">
        <button className="btn alt grow" onClick={exportAll}><Download /> Sauvegarder</button>
        <label className="btn alt grow" style={{ margin: 0 }}>
          <Upload /> Restaurer
          <input type="file" accept="application/json" hidden onChange={(e) => importAll(e.target.files?.[0])} />
        </label>
      </div>
    </>
  )
}
