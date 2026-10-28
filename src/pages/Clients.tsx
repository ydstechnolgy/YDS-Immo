import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Phone, Plus, Trash2, UserSearch } from 'lucide-react'
import { db } from '../db'
import { KINDS, kindLabel, type Client } from '../types'
import { Empty, Field, NumInput, StatusBadge, Top, confirmDelete } from '../ui'
import { fcfa, matchScore, waLink } from '../utils'

export function ClientList() {
  const clients = useLiveQuery(() => db.clients.orderBy('createdAt').reverse().toArray(), [])
  const [q, setQ] = useState('')
  const list = (clients ?? []).filter((c) => `${c.name} ${c.phone} ${c.quarter}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <Top title="Clients" back={false} />
      <input className="search" placeholder="Rechercher un client" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 && <Empty text="Aucun client. Appuie sur + pour noter quelqu'un qui cherche un bien." />}
      {list.map((c) => (
        <Link key={c.id} to={`/clients/${c.id}`} className="card click row" style={{ display: 'flex' }}>
          <div className="thumb ph" style={{ width: 52, height: 52, borderRadius: 26 }}>
            <UserSearch />
          </div>
          <div className="grow">
            <strong>{c.name}</strong>
            <div className="muted small">
              Cherche {c.deal === 'vente' ? 'à acheter' : 'à louer'}
              {c.kind ? ` · ${kindLabel(c.kind)}` : ''}
              {c.budgetMax ? ` · max ${fcfa(c.budgetMax)}` : ''}
            </div>
          </div>
        </Link>
      ))}
      <Link to="/clients/nouveau" className="fab" aria-label="Ajouter un client">
        <Plus size={30} />
      </Link>
    </>
  )
}

export function ClientForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const existing = useLiveQuery(() => (id ? db.clients.get(Number(id)) : undefined), [id])
  const blank: Client = { name: '', phone: '', deal: 'location', kind: '', budgetMax: 0, quarter: '', note: '', createdAt: Date.now() }
  const [form, setForm] = useState<Client | null>(id ? null : blank)
  if (id && existing && !form) setForm(existing)
  if (!form) return <Top title="Client" />
  const set = <K extends keyof Client>(k: K, v: Client[K]) => setForm({ ...form, [k]: v })

  const save = async () => {
    if (!form.name.trim()) return alert('Écris le nom du client.')
    if (id) await db.clients.put(form)
    else await db.clients.add(form)
    nav(-1)
  }

  return (
    <>
      <Top title={id ? 'Modifier le client' : 'Nouveau client'} />
      <Field label="Nom">
        <input value={form.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Téléphone">
        <input inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <Field label="Il cherche">
        <div className="chips">
          {(['location', 'vente'] as const).map((d) => (
            <span key={d} className={`chip ${form.deal === d ? 'on' : ''}`} onClick={() => set('deal', d)}>
              {d === 'location' ? 'À louer' : 'À acheter'}
            </span>
          ))}
        </div>
      </Field>
      <Field label="Type de bien">
        <div className="chips">
          <span className={`chip ${form.kind === '' ? 'on' : ''}`} onClick={() => set('kind', '')}>Peu importe</span>
          {KINDS.map((k) => (
            <span key={k.value} className={`chip ${form.kind === k.value ? 'on' : ''}`} onClick={() => set('kind', k.value)}>
              {k.label}
            </span>
          ))}
        </div>
      </Field>
      <Field label="Budget maximum (FCFA)">
        <NumInput value={form.budgetMax} onChange={(n) => set('budgetMax', n)} />
      </Field>
      <Field label="Quartier souhaité">
        <input value={form.quarter} onChange={(e) => set('quarter', e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea value={form.note} onChange={(e) => set('note', e.target.value)} />
      </Field>
      <button className="btn block" style={{ marginTop: 22 }} onClick={save}>
        Enregistrer
      </button>
    </>
  )
}

export function ClientDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const c = useLiveQuery(() => db.clients.get(Number(id)), [id])
  const props = useLiveQuery(() => db.properties.toArray(), [])
  const visits = useLiveQuery(() => db.visits.where('clientId').equals(Number(id)).toArray(), [id])
  if (!c) return <Top title="Client" />

  const matches = (props ?? []).filter((p) => matchScore(c, p))

  const remove = async () => {
    if (!confirmDelete(c.name)) return
    await db.visits.where('clientId').equals(c.id!).modify({ clientId: undefined })
    await db.clients.delete(c.id!)
    nav('/clients', { replace: true })
  }

  return (
    <>
      <Top
        title={c.name}
        right={
          <Link to={`/clients/${c.id}/modifier`} className="btn alt sm">
            Modifier
          </Link>
        }
      />
      <div className="card">
        <div className="kv"><span>Téléphone</span><span>{c.phone || '—'}</span></div>
        <div className="kv"><span>Cherche</span><span>{c.deal === 'vente' ? 'À acheter' : 'À louer'}{c.kind ? ` · ${kindLabel(c.kind)}` : ''}</span></div>
        {c.budgetMax > 0 && <div className="kv"><span>Budget max</span><span>{fcfa(c.budgetMax)}</span></div>}
        {c.quarter && <div className="kv"><span>Quartier</span><span>{c.quarter}</span></div>}
        {c.note && <div className="kv"><span>Notes</span><span>{c.note}</span></div>}
        {c.phone && (
          <div className="row wrap" style={{ marginTop: 12 }}>
            <a className="btn sm grow" href={`tel:${c.phone}`}><Phone size={18} /> Appeler</a>
            <a className="btn wa sm grow" href={waLink(c.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        )}
      </div>

      <h2>Biens qui lui correspondent ({matches.length})</h2>
      {matches.length === 0 && <div className="card muted">Aucun bien disponible ne correspond pour l'instant.</div>}
      {matches.map((p) => (
        <Link key={p.id} to={`/biens/${p.id}`} className="card click" style={{ display: 'block' }}>
          <div className="row between">
            <strong>{p.title || kindLabel(p.kind)}</strong>
            <StatusBadge s={p.status} />
          </div>
          <div className="price">{fcfa(p.price)}</div>
          <div className="muted small">{p.quarter}</div>
        </Link>
      ))}

      <h2>Visites ({visits?.length ?? 0})</h2>
      <Link to={`/visites/nouveau?client=${c.id}`} className="btn alt block">
        + Noter une visite
      </Link>

      <button className="btn danger block" style={{ marginTop: 28 }} onClick={remove}>
        <Trash2 size={18} /> Supprimer ce client
      </button>
    </>
  )
}
