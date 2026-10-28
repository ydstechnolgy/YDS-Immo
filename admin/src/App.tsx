import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface Licence {
  id: string
  key: string
  note: string
  expires_at: string
  created_at: string
  max_pc: number
  max_phone: number
  user_email: string | null
  pcs: number
  phones: number
  last_seen: string | null
}

type Status = 'unused' | 'active' | 'soon' | 'expired'
const DAY = 24 * 3600 * 1000

const statusOf = (l: Licence): Status => {
  const left = new Date(l.expires_at).getTime() - Date.now()
  if (left <= 0) return 'expired'
  if (!l.user_email) return 'unused'
  return left < 15 * DAY ? 'soon' : 'active'
}
const STATUS_LABEL: Record<Status, string> = {
  unused: 'Pas encore activée',
  active: 'Active',
  soon: 'Expire bientôt',
  expired: 'Expirée / suspendue',
}
const STATUS_CLASS: Record<Status, string> = { unused: '', active: 'ok', soon: 'warn', expired: 'bad' }

const fmt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY)

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    window.prompt('Copie la clé :', text)
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!ready) return <div className="wrap muted">Chargement…</div>
  return session ? <Admin session={session} /> : <Login />
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setMsg('Email ou mot de passe incorrect.')
    setBusy(false)
  }
  return (
    <form className="login" onSubmit={submit}>
      <h1>YDS <b>Immo</b> · Licences</h1>
      <p className="muted">Espace réservé à l'administrateur.</p>
      <input type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Mot de passe" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {msg && <p className="err">{msg}</p>}
      <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
    </form>
  )
}

function Admin({ session }: { session: Session }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [list, setList] = useState<Licence[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [q, setQ] = useState('')
  const [months, setMonths] = useState(12)
  const [note, setNote] = useState('')
  const [fresh, setFresh] = useState('')

  const load = useCallback(async () => {
    setErr('')
    const { data, error } = await supabase.rpc('admin_list_licences')
    if (error) return setErr(error.message)
    setList((data as Licence[]) ?? [])
  }, [])

  useEffect(() => {
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (error) setErr(error.message)
      setIsAdmin(!!data)
      if (data) void load()
    })
  }, [load])

  const act = async (fn: string, args: Record<string, unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(true)
    setErr('')
    const { data, error } = await supabase.rpc(fn, args)
    if (error) setErr(error.message)
    setBusy(false)
    await load()
    return data
  }

  const create = async () => {
    const key = (await act('admin_create_licence', { p_months: months, p_note: note })) as string | undefined
    if (key) {
      setFresh(key)
      setNote('')
      void copy(key)
    }
  }

  const stats = useMemo(() => {
    const c = { total: list.length, unused: 0, active: 0, soon: 0, expired: 0 }
    list.forEach((l) => c[statusOf(l)]++)
    return c
  }, [list])

  const shown = list.filter((l) => {
    if (filter !== 'all' && statusOf(l) !== filter) return false
    return `${l.key} ${l.note} ${l.user_email ?? ''}`.toLowerCase().includes(q.toLowerCase())
  })

  if (isAdmin === null) return <div className="wrap muted">Chargement…</div>
  if (!isAdmin)
    return (
      <div className="wrap">
        <h1>YDS <b>Immo</b> · Licences</h1>
        <p className="err">Ce compte ({session.user.email}) n'a pas les droits d'administrateur.</p>
        {err && <p className="muted small">{err}</p>}
        <button className="btn alt" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
    )

  return (
    <div className="wrap">
      <div className="row between">
        <h1>YDS <b>Immo</b> · Licences</h1>
        <div className="row">
          <span className="muted small">{session.user.email}</span>
          <button className="btn alt sm" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="n">{stats.total}</div><div className="muted small">Licences</div></div>
        <div className="stat"><div className="n">{stats.active}</div><div className="muted small">Actives</div></div>
        <div className="stat"><div className="n">{stats.soon}</div><div className="muted small">Expirent bientôt</div></div>
        <div className="stat"><div className="n">{stats.expired}</div><div className="muted small">Expirées</div></div>
        <div className="stat"><div className="n">{stats.unused}</div><div className="muted small">Pas activées</div></div>
      </div>

      <h2>Nouvelle licence</h2>
      <div className="card">
        <div className="row">
          <div>
            <label htmlFor="months">Durée</label>
            <select id="months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} mois</option>)}
            </select>
          </div>
          <div className="grow">
            <label htmlFor="note">Client (nom, téléphone…)</label>
            <input id="note" style={{ width: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button className="btn" disabled={busy} onClick={create}>Générer la clé</button>
          </div>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>Chaque licence fonctionne sur 1 PC et 1 téléphone. La clé est copiée automatiquement.</p>
      </div>
      {fresh && (
        <div className="card newkey row between">
          <div><div className="muted small">Nouvelle clé (copiée)</div><div className="key">{fresh}</div></div>
          <button className="btn alt" onClick={() => copy(fresh)}>Copier</button>
        </div>
      )}

      <h2>Toutes les licences</h2>
      <input style={{ width: '100%' }} placeholder="Rechercher (clé, client, email)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {(['all', 'active', 'soon', 'expired', 'unused'] as const).map((f) => (
          <span key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Toutes' : STATUS_LABEL[f]}
          </span>
        ))}
      </div>
      {err && <p className="err">{err}</p>}
      {shown.length === 0 && <p className="muted">Aucune licence à afficher.</p>}

      {shown.map((l) => {
        const s = statusOf(l)
        const left = daysLeft(l.expires_at)
        return (
          <div className="card" key={l.id}>
            <div className="row between">
              <span className="key">{l.key}</span>
              <span className={`badge ${STATUS_CLASS[s]}`}>{STATUS_LABEL[s]}</span>
            </div>
            <div className="muted small" style={{ margin: '6px 0 10px' }}>
              {l.note || 'Sans nom'}
              {l.user_email ? ` · ${l.user_email}` : ''}
              {' · '}Expire le {fmt(l.expires_at)}{left > 0 ? ` (${left} j)` : ''}
              {' · '}PC {l.pcs}/{l.max_pc} · Tél. {l.phones}/{l.max_phone}
              {l.last_seen ? ` · vu le ${fmt(l.last_seen)}` : ''}
            </div>
            <div className="row">
              <button className="btn alt sm" onClick={() => copy(l.key)}>Copier</button>
              {[1, 3, 12].map((m) => (
                <button key={m} className="btn sm" disabled={busy} onClick={() => act('admin_extend_licence', { p_id: l.id, p_months: m })}>+{m} mois</button>
              ))}
              {l.pcs > 0 && <button className="btn alt sm" disabled={busy} onClick={() => act('admin_release_devices', { p_id: l.id, p_kind: 'pc' }, 'Libérer le PC de ce client ? Il pourra en activer un autre.')}>Libérer le PC</button>}
              {l.phones > 0 && <button className="btn alt sm" disabled={busy} onClick={() => act('admin_release_devices', { p_id: l.id, p_kind: 'phone' }, 'Libérer le téléphone de ce client ?')}>Libérer le tél.</button>}
              {s !== 'expired' && <button className="btn danger sm" disabled={busy} onClick={() => act('admin_suspend_licence', { p_id: l.id }, 'Suspendre cette licence maintenant ?')}>Suspendre</button>}
              {!l.user_email && <button className="btn danger sm" disabled={busy} onClick={() => act('admin_delete_licence', { p_id: l.id }, 'Supprimer cette clé jamais activée ?')}>Supprimer</button>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
