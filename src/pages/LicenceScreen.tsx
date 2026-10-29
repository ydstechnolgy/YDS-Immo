import { useState } from 'react'
import { activateLicence, deviceKind, licenceMessage, replaceDevice, type LicenceResult } from '../licence'
import { Field } from '../ui'
import { supabase } from '../supabase'
import { signOutSafely } from '../sync'

export function LicenceScreen({
  uid,
  email,
  initial,
  onDone,
}: {
  uid: string
  email: string
  initial?: LicenceResult
  onDone: () => void
}) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<LicenceResult | undefined>(
    initial && initial.error && initial.error !== 'no_licence' ? initial : undefined,
  )
  const [msg, setMsg] = useState('')

  const show = (r: LicenceResult) => {
    setLast(r)
    setMsg(licenceMessage(r))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (key.trim().length < 8) return setMsg('Entre ta clé complète (ex : YDS-1A2B-3C4D-5E6F).')
    setBusy(true)
    setMsg('')
    const r = await activateLicence(key, uid)
    setBusy(false)
    if (r.ok) onDone()
    else show(r)
  }

  const replace = async () => {
    if (!window.confirm("Remplacer l'ancien appareil par celui-ci ? L'ancien ne pourra plus ouvrir le logiciel.")) return
    setBusy(true)
    const r = await replaceDevice(uid)
    setBusy(false)
    if (r.ok) onDone()
    else show(r)
  }

  const logout = async () => {
    const r = await signOutSafely()
    if (!r.ok) await supabase.auth.signOut({ scope: 'local' })
  }

  const shown = msg || (last ? licenceMessage(last) : '')
  const canReplace = last?.error === 'device_limit' && last.canReplace

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '56px 20px' }}>
      <div className="brand" style={{ fontSize: '2rem', textAlign: 'center', paddingBottom: 6 }}>
        YDS <b>Immo</b>
      </div>
      <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
        Connecté avec {email}
      </p>

      <div className="card" style={{ marginTop: 22 }}>
        <strong>Active ton logiciel</strong>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Entre la clé d'activation reçue de YDS Tech. Elle fonctionne sur 1 PC et 1 téléphone. Cet appareil sera
          enregistré comme {deviceKind() === 'phone' ? 'téléphone' : 'PC'}. La durée de ta licence commence à
          l'activation.
        </p>
      </div>

      <form onSubmit={submit}>
        <Field label="Clé d'activation">
          <input
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="YDS-XXXX-XXXX-XXXX"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
          />
        </Field>
        {shown && <p style={{ color: 'var(--bad)' }}>{shown}</p>}
        <button className="btn block" style={{ marginTop: 18 }} disabled={busy}>
          {busy ? 'Vérification…' : 'Activer'}
        </button>
      </form>

      {canReplace && (
        <button className="btn alt block" style={{ marginTop: 12 }} disabled={busy} onClick={replace}>
          Remplacer l'ancien {deviceKind() === 'phone' ? 'téléphone' : 'PC'} par celui-ci
        </button>
      )}

      <p style={{ textAlign: 'center', marginTop: 22 }}>
        <a
          href="#"
          className="muted"
          onClick={(e) => {
            e.preventDefault()
            void logout()
          }}
        >
          Changer de compte
        </a>
      </p>
    </div>
  )
}
