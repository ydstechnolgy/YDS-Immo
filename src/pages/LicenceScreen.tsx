import { useState } from 'react'
import { activateLicence, deviceKind, licenceMessage } from '../licence'
import { Field } from '../ui'
import { supabase } from '../supabase'
import { signOutSafely } from '../sync'

export function LicenceScreen({
  uid,
  email,
  error,
  onDone,
}: {
  uid: string
  email: string
  error?: string
  onDone: () => void
}) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(error && error !== 'no_licence' ? licenceMessage(error) : '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (key.trim().length < 8) return setMsg('Entre ta clé complète (ex : YDS-1A2B-3C4D-5E6F).')
    setBusy(true)
    setMsg('')
    const r = await activateLicence(key, uid)
    setBusy(false)
    if (r.ok) onDone()
    else setMsg(licenceMessage(r.error))
  }

  const logout = async () => {
    const r = await signOutSafely()
    if (!r.ok) {
      // rien à perdre ici si l'appli n'a jamais été activée : on force
      await supabase.auth.signOut({ scope: 'local' })
    }
  }

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
          Entre la clé d'activation reçue de YDS Tech. Elle fonctionne sur 1 PC et 1 téléphone.
          Cet appareil sera enregistré comme {deviceKind() === 'phone' ? 'téléphone' : 'PC'}.
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
        {msg && <p style={{ color: 'var(--bad)' }}>{msg}</p>}
        <button className="btn block" style={{ marginTop: 18 }} disabled={busy}>
          {busy ? 'Vérification…' : 'Activer'}
        </button>
      </form>

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
