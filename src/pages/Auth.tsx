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
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'confirm'>('login')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
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
        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            await supabase.auth.resend({ type: 'signup', email: email.trim() })
            setCode('')
            setInfo('Ton email n\'est pas encore confirmé. Un nouveau code vient de partir.')
            setMode('confirm')
          } else setMsg(translate(error.message))
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
        if (error) setMsg(translate(error.message))
        else if (!data.session) {
          // Confirmation de l'email par un code
          setCode('')
          setInfo('Compte créé. Un code vient de partir par email (regarde aussi les spams).')
          setMode('confirm')
        }
      }
    } catch (err) {
      setMsg(translate(err instanceof Error ? err.message : 'Erreur'))
    }
    setBusy(false)
  }

  // Mot de passe oublié : 1) on envoie un code par email, 2) il le tape avec son nouveau mot de passe
  const sendCode = async () => {
    setMsg('')
    setInfo('')
    if (!email.includes('@')) return setMsg("Écris ton adresse email.")
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setBusy(false)
    if (error) return setMsg(translate(error.message))
    setCodeSent(true)
    setInfo('Un code vient de partir. Regarde ta boîte mail (et les spams).')
  }

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    setInfo('')
    if (!/^\d{6,8}$/.test(code.trim())) return setMsg('Entre le code reçu par email (6 à 8 chiffres).')
    if (password.length < 6) return setMsg('Le nouveau mot de passe doit avoir au moins 6 caractères.')
    setBusy(true)
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' })
      if (error) {
        setMsg('Code incorrect ou expiré. Demande un nouveau code.')
      } else {
        const { error: e2 } = await supabase.auth.updateUser({ password })
        if (e2) setMsg(translate(e2.message))
      }
    } catch (err) {
      setMsg(translate(err instanceof Error ? err.message : 'Erreur'))
    }
    setBusy(false)
  }

  const confirmEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    setInfo('')
    if (!/^\d{6,8}$/.test(code.trim())) return setMsg('Entre le code reçu par email (6 à 8 chiffres).')
    setBusy(true)
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'signup' })
      if (error) setMsg('Code incorrect ou expiré. Demande un nouveau code.')
    } catch (err) {
      setMsg(translate(err instanceof Error ? err.message : 'Erreur'))
    }
    setBusy(false)
  }

  const resendConfirm = async () => {
    setMsg('')
    setInfo('')
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    if (error) setMsg(translate(error.message))
    else setInfo('Nouveau code envoyé.')
  }

  const backToLogin = () => {
    setMsg('')
    setInfo('')
    setCode('')
    setCodeSent(false)
    setMode('login')
  }

  if (mode === 'confirm') {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '56px 20px' }}>
        <div className="brand" style={{ fontSize: '2rem', textAlign: 'center', paddingBottom: 6 }}>
          YDS <b>Immo</b>
        </div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
          Confirme ton email
        </p>
        <form onSubmit={confirmEmail} style={{ marginTop: 26 }}>
          <p className="muted small">Code envoyé à {email}</p>
          <Field label="Code reçu par email">
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </Field>
          {msg && <p style={{ color: 'var(--bad)' }}>{msg}</p>}
          {info && <p style={{ color: 'var(--ok)' }}>{info}</p>}
          <button className="btn block" style={{ marginTop: 20 }} disabled={busy}>
            {busy ? 'Un instant…' : 'Confirmer'}
          </button>
        </form>
        <div className="row between" style={{ marginTop: 18 }}>
          <a href="#" style={{ color: 'var(--gold)', fontWeight: 600 }} onClick={(e) => { e.preventDefault(); backToLogin() }}>
            Retour
          </a>
          <a href="#" className="muted" onClick={(e) => { e.preventDefault(); void resendConfirm() }}>
            Renvoyer le code
          </a>
        </div>
      </div>
    )
  }

  if (mode === 'reset') {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '56px 20px' }}>
        <div className="brand" style={{ fontSize: '2rem', textAlign: 'center', paddingBottom: 6 }}>
          YDS <b>Immo</b>
        </div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
          Changer ton mot de passe
        </p>
        <form onSubmit={codeSent ? resetPassword : (e) => { e.preventDefault(); void sendCode() }} style={{ marginTop: 26 }}>
          <Field label="Email">
            <input type="email" autoComplete="email" value={email} disabled={codeSent} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {codeSent && (
            <>
              <Field label="Code reçu par email">
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </Field>
              <Field label="Nouveau mot de passe">
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </>
          )}
          {msg && <p style={{ color: 'var(--bad)' }}>{msg}</p>}
          {info && <p style={{ color: 'var(--ok)' }}>{info}</p>}
          <button className="btn block" style={{ marginTop: 20 }} disabled={busy}>
            {busy ? 'Un instant…' : codeSent ? 'Changer le mot de passe' : 'Recevoir le code'}
          </button>
        </form>
        <div className="row between" style={{ marginTop: 18 }}>
          <a href="#" style={{ color: 'var(--gold)', fontWeight: 600 }} onClick={(e) => { e.preventDefault(); backToLogin() }}>
            Retour
          </a>
          {codeSent && (
            <a href="#" className="muted" onClick={(e) => { e.preventDefault(); void sendCode() }}>
              Renvoyer le code
            </a>
          )}
        </div>
      </div>
    )
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
              setMsg('')
              setInfo('')
              setPassword('')
              setMode('reset')
            }}
          >
            Mot de passe oublié ?
          </a>
        )}
      </div>
    </div>
  )
}
