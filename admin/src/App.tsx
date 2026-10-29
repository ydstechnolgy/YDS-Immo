import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface Licence {
  id: string
  key: string
  note: string
  expires_at: string | null
  pending_months: number | null
  activated_at: string | null
  active: boolean
  created_at: string
  max_pc: number
  max_phone: number
  user_email: string | null
  pcs: number
  phones: number
  last_seen: string | null
  last_replaced_at: string | null
  paid_total: number
  payments: number
}

type Status = 'unused' | 'active' | 'soon' | 'grace' | 'expired' | 'suspended'
const DAY = 24 * 3600 * 1000
const GRACE_DAYS = 7

const statusOf = (l: Licence): Status => {
  if (!l.active) return 'suspended'
  if (!l.expires_at) return 'unused'
  const left = new Date(l.expires_at).getTime() - Date.now()
  if (left <= -GRACE_DAYS * DAY) return 'expired'
  if (left <= 0) return 'grace'
  return left < 15 * DAY ? 'soon' : 'active'
}
const STATUS_LABEL: Record<Status, string> = {
  unused: 'Pas encore activée',
  active: 'Active',
  soon: 'Expire bientôt',
  grace: 'En grâce (7 j)',
  expired: 'Expirée',
  suspended: 'Suspendue',
}
const STATUS_CLASS: Record<Status, string> = { unused: '', active: 'ok', soon: 'warn', grace: 'warn', expired: 'bad', suspended: 'bad' }

const fmt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY)
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} FCFA`
const toInputDate = (iso: string) => iso.slice(0, 10)

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
    const c: Record<string, number> = { total: list.length, unused: 0, active: 0, soon: 0, grace: 0, expired: 0, suspended: 0 }
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
        <div className="stat"><div className="n">{stats.grace}</div><div className="muted small">En grâce</div></div>
        <div className="stat"><div className="n">{stats.expired + stats.suspended}</div><div className="muted small">Expirées / suspendues</div></div>
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
        <p className="muted small" style={{ marginBottom: 0 }}>Chaque licence fonctionne sur 1 PC et 1 téléphone. La durée commence quand le client active la clé. La clé est copiée automatiquement.</p>
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
        {(['all', 'active', 'soon', 'grace', 'expired', 'suspended', 'unused'] as const).map((f) => (
          <span key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Toutes' : STATUS_LABEL[f]}
          </span>
        ))}
      </div>
      {err && <p className="err">{err}</p>}
      {shown.length === 0 && <p className="muted">Aucune licence à afficher.</p>}

      {shown.map((l) => (
        <LicenceCard key={l.id} l={l} busy={busy} act={act} />
      ))}
    </div>
  )
}

type Act = (fn: string, args: Record<string, unknown>, confirmMsg?: string) => Promise<unknown>

function LicenceCard({ l, busy, act }: { l: Licence; busy: boolean; act: Act }) {
  const s = statusOf(l)
  const [panel, setPanel] = useState<null | 'pay' | 'edit'>(null)
  // paiement
  const [amount, setAmount] = useState('')
  const [pmonths, setPmonths] = useState(1)
  const [method, setMethod] = useState('Mobile Money')
  const [pnote, setPnote] = useState('')
  // modification
  const [note, setNote] = useState(l.note)
  const [maxPc, setMaxPc] = useState(l.max_pc)
  const [maxPhone, setMaxPhone] = useState(l.max_phone)
  const [expiry, setExpiry] = useState(l.expires_at ? toInputDate(l.expires_at) : '')

  const pay = async () => {
    await act('admin_record_licence_payment', {
      p_id: l.id,
      p_amount: Number(amount.replace(/\D/g, '')) || 0,
      p_months: pmonths,
      p_method: method,
      p_note: pnote,
    })
    setAmount('')
    setPnote('')
    setPanel(null)
  }

  const save = async () => {
    await act('admin_update_licence', { p_id: l.id, p_note: note, p_max_pc: maxPc, p_max_phone: maxPhone })
    if (expiry && expiry !== (l.expires_at ? toInputDate(l.expires_at) : '')) {
      await act('admin_set_licence_expiry', { p_id: l.id, p_date: `${expiry}T23:59:59Z` })
    }
    setPanel(null)
  }

  return (
    <div className="card">
      <div className="row between">
        <span className="key">{l.key}</span>
        <span className={`badge ${STATUS_CLASS[s]}`}>{STATUS_LABEL[s]}</span>
      </div>
      <div className="muted small" style={{ margin: '6px 0 10px' }}>
        {l.note || 'Sans nom'}
        {l.user_email ? ` · ${l.user_email}` : ''}
        {' · '}
        {l.expires_at
          ? `Expire le ${fmt(l.expires_at)}${daysLeft(l.expires_at) > 0 ? ` (${daysLeft(l.expires_at)} j)` : ''}`
          : `Durée : ${l.pending_months ?? 0} mois, à partir de l'activation`}
        {' · '}PC {l.pcs}/{l.max_pc} · Tél. {l.phones}/{l.max_phone}
        {l.last_seen ? ` · vu le ${fmt(l.last_seen)}` : ''}
        {l.payments > 0 ? ` · ${l.payments} paiement(s), ${fcfa(l.paid_total)}` : ''}
        {l.last_replaced_at ? ` · appareil remplacé le ${fmt(l.last_replaced_at)}` : ''}
      </div>

      <div className="row">
        <button className="btn alt sm" onClick={() => copy(l.key)}>Copier</button>
        <button className="btn sm" disabled={busy} onClick={() => setPanel(panel === 'pay' ? null : 'pay')}>Paiement</button>
        {[1, 3, 12].map((m) => (
          <button key={m} className="btn alt sm" disabled={busy} onClick={() => act('admin_extend_licence', { p_id: l.id, p_months: m }, `Ajouter ${m} mois sans enregistrer de paiement ?`)}>+{m} mois</button>
        ))}
        <button className="btn alt sm" onClick={() => setPanel(panel === 'edit' ? null : 'edit')}>Modifier</button>
        {l.pcs > 0 && <button className="btn alt sm" disabled={busy} onClick={() => act('admin_release_devices', { p_id: l.id, p_kind: 'pc' }, 'Libérer le PC de ce client ? Il pourra en activer un autre.')}>Libérer le PC</button>}
        {l.phones > 0 && <button className="btn alt sm" disabled={busy} onClick={() => act('admin_release_devices', { p_id: l.id, p_kind: 'phone' }, 'Libérer le téléphone de ce client ?')}>Libérer le tél.</button>}
        {l.active
          ? <button className="btn danger sm" disabled={busy} onClick={() => act('admin_set_licence_active', { p_id: l.id, p_active: false }, 'Suspendre cette licence maintenant ? Le client ne pourra plus enregistrer de données.')}>Suspendre</button>
          : <button className="btn sm" disabled={busy} onClick={() => act('admin_set_licence_active', { p_id: l.id, p_active: true })}>Réactiver</button>}
        {!l.user_email && <button className="btn danger sm" disabled={busy} onClick={() => act('admin_delete_licence', { p_id: l.id }, 'Supprimer cette clé jamais activée ?')}>Supprimer</button>}
      </div>

      {panel === 'pay' && (
        <div className="panel">
          <div className="row">
            <div>
              <label htmlFor={`amt-${l.id}`}>Montant reçu</label>
              <input id={`amt-${l.id}`} inputMode="numeric" placeholder="FCFA" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`pm-${l.id}`}>Mois ajoutés</label>
              <select id={`pm-${l.id}`} value={pmonths} onChange={(e) => setPmonths(Number(e.target.value))}>
                {[1, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} mois</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`mt-${l.id}`}>Moyen</label>
              <select id={`mt-${l.id}`} value={method} onChange={(e) => setMethod(e.target.value)}>
                {['Mobile Money', 'Espèces', 'Virement', 'Autre'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="grow">
              <label htmlFor={`pn-${l.id}`}>Note</label>
              <input id={`pn-${l.id}`} style={{ width: '100%' }} value={pnote} onChange={(e) => setPnote(e.target.value)} />
            </div>
          </div>
          <p className="muted small">
            {l.expires_at ? 'La date de fin est repoussée.' : 'La clé n’est pas activée : la durée en attente augmente.'}
          </p>
          <button className="btn" disabled={busy} onClick={pay}>Enregistrer le paiement</button>
        </div>
      )}

      {panel === 'edit' && (
        <div className="panel">
          <div className="row">
            <div className="grow">
              <label htmlFor={`nt-${l.id}`}>Client</label>
              <input id={`nt-${l.id}`} style={{ width: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`pc-${l.id}`}>PC max</label>
              <input id={`pc-${l.id}`} type="number" min={0} style={{ width: 90 }} value={maxPc} onChange={(e) => setMaxPc(Number(e.target.value))} />
            </div>
            <div>
              <label htmlFor={`ph-${l.id}`}>Tél. max</label>
              <input id={`ph-${l.id}`} type="number" min={0} style={{ width: 90 }} value={maxPhone} onChange={(e) => setMaxPhone(Number(e.target.value))} />
            </div>
            {l.expires_at && (
              <div>
                <label htmlFor={`ex-${l.id}`}>Date de fin</label>
                <input id={`ex-${l.id}`} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </div>
            )}
          </div>
          <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={save}>Enregistrer</button>
        </div>
      )}
    </div>
  )
}
