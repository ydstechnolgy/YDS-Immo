import { useState } from 'react'
import { supabase } from '../supabase'
import { Field } from '../ui'

const translate = (msg: string) => {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'Email ou mot de passe incorrect.'
  if (m.includes('already registered')) return 'Cet email a déjà un compte. Connecte-toi.'
  if (m.includes('email not confirmed')) return "Confirme d'abord ton email (regarde ta boîte de réception)."
  if (m.includes('password') && m.includes('6')) return 'Le mot de passe doit avoir au moins 6 caractères.'
  if (m.includes('rate limit')) return 'Trop de tentatives. Attends un peu puis réessaie.'
  if (m.includes('fetch') || m.includes('network')) return 'Pas de connexion internet. La première connexion en a besoin.'
  return msg
}

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [info, setInfo] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    setInfo('')
    if (!email.includes('@')) return setMsg("Écris ton adresse email.")
    if (password.length < 6) return setMsg('Le mot de passe doit avoir au moins 6 caractères.')
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) setMsg(translate(error.message))
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
        if (error) setMsg(translate(error.message))
        else if (!data.session) {
          setInfo('Compte créé. Regarde ta boîte mail et clique sur le lien de confirmation, puis connecte-toi.')
          setMode('login')
        }
      }
    } catch (err) {
      setMsg(translate(err instanceof Error ? err.message : 'Erreur'))
    }
    setBusy(false)
  }

  const forgot = async () => {
    if (!email.includes('@')) return setMsg("Écris d'abord ton email ci-dessus.")
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    if (error) setMsg(translate(error.message))
    else setInfo('Un email pour changer ton mot de passe vient de partir.')
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '56px 20px' }}>
      <div className="brand" style={{ fontSize: '2rem', textAlign: 'center', paddingBottom: 6 }}>
        YDS <b>Immo</b>
      </div>
      <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
        Tous tes biens, propriétaires et clients au même endroit.
      </p>

      <form onSubmit={submit} style={{ marginTop: 26 }}>
        <Field label="Email">
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mot de passe">
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {msg && <p style={{ color: 'var(--bad)' }}>{msg}</p>}
        {info && <p style={{ color: 'var(--ok)' }}>{info}</p>}
        <button className="btn block" style={{ marginTop: 20 }} disabled={busy}>
          {busy ? 'Un instant…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
        </button>
      </form>

      <div className="row between" style={{ marginTop: 18 }}>
        <a
          href="#"
          style={{ color: 'var(--gold)', fontWeight: 600 }}
          onClick={(e) => {
            e.preventDefault()
            setMsg('')
            setInfo('')
            setMode(mode === 'login' ? 'signup' : 'login')
          }}
        >
          {mode === 'login' ? 'Créer un compte' : "J'ai déjà un compte"}
        </a>
        {mode === 'login' && (
          <a
            href="#"
            className="muted"
            onClick={(e) => {
              e.preventDefault()
              void forgot()
            }}
          >
            Mot de passe oublié ?
          </a>
        )}
      </div>
    </div>
  )
}
