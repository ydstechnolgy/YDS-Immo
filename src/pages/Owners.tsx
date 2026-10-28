import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Phone, Plus, Trash2, User } from 'lucide-react'
import { db, newId } from '../db'
import type { Owner } from '../types'
import { kindLabel } from '../types'
import { Empty, Field, StatusBadge, Top, confirmDelete } from '../ui'
import { fcfa, waLink } from '../utils'

export function OwnerList() {
  const owners = useLiveQuery(() => db.owners.orderBy('name').toArray(), [])
  const props = useLiveQuery(() => db.properties.toArray(), [])
  const [q, setQ] = useState('')
  const list = (owners ?? []).filter((o) => `${o.name} ${o.phone}`.toLowerCase().includes(q.toLowerCase()))
  const count = (id?: string) => (props ?? []).filter((p) => p.ownerId === id).length

  return (
    <>
      <Top title="Propriétaires" back={false} />
      <input className="search" placeholder="Rechercher un nom ou un numéro" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 && <Empty text="Aucun propriétaire. Appuie sur + pour en ajouter un." />}
      {list.map((o) => (
        <Link key={o.id} to={`/proprietaires/${o.id}`} className="card click row" style={{ display: 'flex' }}>
          <div className="thumb ph" style={{ width: 52, height: 52, borderRadius: 26 }}>
            <User />
          </div>
          <div className="grow">
            <strong>{o.name}</strong>
            <div className="muted small">{o.phone || 'Pas de numéro'}</div>
          </div>
          <span className="badge">{count(o.id)} bien(s)</span>
        </Link>
      ))}
      <Link to="/proprietaires/nouveau" className="fab" aria-label="Ajouter un propriétaire">
        <Plus size={30} />
      </Link>
    </>
  )
}

export function OwnerForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const existing = useLiveQuery(() => (id ? db.owners.get(String(id)) : undefined), [id])
  const blank: Owner = { name: '', phone: '', whatsapp: '', note: '', createdAt: Date.now() }
  const [form, setForm] = useState<Owner | null>(id ? null : blank)

  if (id && existing && !form) setForm(existing)
  if (!form) return <Top title="Propriétaire" />
  const set = <K extends keyof Owner>(k: K, v: Owner[K]) => setForm({ ...form, [k]: v })

  const save = async () => {
    if (!form.name.trim()) return alert('Écris le nom du propriétaire.')
    if (id) {
      await db.owners.put(form)
      nav(-1)
    } else {
      await db.owners.add({ ...form, id: newId() })
      nav(-1)
    }
  }

  return (
    <>
      <Top title={id ? 'Modifier' : 'Nouveau propriétaire'} />
      <Field label="Nom complet">
        <input value={form.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Téléphone">
        <input inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <Field label="WhatsApp (si différent)">
        <input inputMode="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
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

export function OwnerDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const o = useLiveQuery(() => db.owners.get(String(id)), [id])
  const props = useLiveQuery(() => db.properties.where('ownerId').equals(String(id)).toArray(), [id])
  if (!o) return <Top title="Propriétaire" />

  const remove = async () => {
    if (!confirmDelete(`${o.name}`)) return
    // on garde ses biens, mais on les détache
    await db.properties.where('ownerId').equals(o.id!).modify({ ownerId: undefined })
    await db.owners.delete(o.id!)
    nav('/proprietaires', { replace: true })
  }

  return (
    <>
      <Top
        title={o.name}
        right={
          <Link to={`/proprietaires/${o.id}/modifier`} className="btn alt sm">
            Modifier
          </Link>
        }
      />
      <div className="card">
        <div className="kv"><span>Téléphone</span><span>{o.phone || '—'}</span></div>
        {o.whatsapp && <div className="kv"><span>WhatsApp</span><span>{o.whatsapp}</span></div>}
        {o.note && <div className="kv"><span>Notes</span><span>{o.note}</span></div>}
        <div className="row wrap" style={{ marginTop: 12 }}>
          {o.phone && (
            <a className="btn sm grow" href={`tel:${o.phone}`}>
              <Phone size={18} /> Appeler
            </a>
          )}
          {(o.whatsapp || o.phone) && (
            <a className="btn wa sm grow" href={waLink(o.whatsapp || o.phone)} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          )}
        </div>
      </div>

      <h2>Ses biens ({props?.length ?? 0})</h2>
      {(props ?? []).length === 0 && <div className="card muted">Aucun bien pour ce propriétaire.</div>}
      {(props ?? []).map((p) => (
        <Link key={p.id} to={`/biens/${p.id}`} className="card click" style={{ display: 'block' }}>
          <div className="row between">
            <strong>{p.title || kindLabel(p.kind)}</strong>
            <StatusBadge s={p.status} />
          </div>
          <div className="price">{fcfa(p.price)}</div>
        </Link>
      ))}

      <button className="btn danger block" style={{ marginTop: 28 }} onClick={remove}>
        <Trash2 size={18} /> Supprimer ce propriétaire
      </button>
    </>
  )
}
