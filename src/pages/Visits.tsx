import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { db } from '../db'
import { FEEDBACKS, feedbackLabel, kindLabel, type Feedback, type Visit } from '../types'
import { Empty, Field, Top, confirmDelete } from '../ui'
import { formatDate, today } from '../utils'

const fbClass = (f: Feedback) =>
  f === 'interesse' ? 'ok' : f === 'a_rappeler' ? 'warn' : f === 'pas_interesse' ? 'bad' : ''

export function VisitList() {
  const visits = useLiveQuery(() => db.visits.orderBy('date').reverse().toArray(), [])
  const props = useLiveQuery(() => db.properties.toArray(), [])
  const clients = useLiveQuery(() => db.clients.toArray(), [])
  const pName = (id: number) => {
    const p = props?.find((x) => x.id === id)
    return p ? p.title || `${kindLabel(p.kind)} ${p.quarter}` : 'Bien supprimé'
  }
  const cName = (id?: number) => clients?.find((x) => x.id === id)?.name

  const upcoming = (visits ?? []).filter((v) => v.date >= today())
  const past = (visits ?? []).filter((v) => v.date < today())

  const remove = async (v: Visit) => {
    if (confirmDelete('cette visite')) await db.visits.delete(v.id!)
  }

  const Item = ({ v }: { v: Visit }) => (
    <div className="card">
      <div className="row between">
        <strong>{formatDate(v.date)}</strong>
        <span className={`badge ${fbClass(v.feedback)}`}>{feedbackLabel(v.feedback)}</span>
      </div>
      <Link to={`/biens/${v.propertyId}`} style={{ color: 'var(--gold)' }}>{pName(v.propertyId)}</Link>
      {cName(v.clientId) && <div className="muted small">Client : {cName(v.clientId)}</div>}
      {v.note && <div className="small" style={{ marginTop: 6 }}>{v.note}</div>}
      <div className="row wrap" style={{ marginTop: 10 }}>
        {FEEDBACKS.map((f) => (
          <span
            key={f.value}
            className={`chip ${v.feedback === f.value ? 'on' : ''}`}
            style={{ padding: '6px 12px', fontSize: '.82rem' }}
            onClick={() => db.visits.update(v.id!, { feedback: f.value })}
          >
            {f.label}
          </span>
        ))}
        <button className="btn danger sm" onClick={() => remove(v)} aria-label="Supprimer"><Trash2 size={16} /></button>
      </div>
    </div>
  )

  return (
    <>
      <Top title="Visites" back={false} />
      {(visits ?? []).length === 0 && <Empty text="Aucune visite notée. Appuie sur + pour en ajouter une." />}
      {upcoming.length > 0 && <h2>À venir</h2>}
      {upcoming.reverse().map((v) => <Item key={v.id} v={v} />)}
      {past.length > 0 && <h2>Passées</h2>}
      {past.map((v) => <Item key={v.id} v={v} />)}
      <Link to="/visites/nouveau" className="fab" aria-label="Ajouter une visite"><Plus size={30} /></Link>
    </>
  )
}

export function VisitForm() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const props = useLiveQuery(() => db.properties.toArray(), [])
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), [])
  const [form, setForm] = useState<Visit>({
    propertyId: Number(sp.get('bien')) || 0,
    clientId: Number(sp.get('client')) || undefined,
    date: today(),
    feedback: 'en_attente',
    note: '',
    createdAt: Date.now(),
  })
  const set = <K extends keyof Visit>(k: K, v: Visit[K]) => setForm({ ...form, [k]: v })

  const save = async () => {
    if (!form.propertyId) return alert('Choisis le bien visité.')
    await db.visits.add(form)
    nav(-1)
  }

  return (
    <>
      <Top title="Nouvelle visite" />
      <Field label="Bien visité">
        <select value={form.propertyId || ''} onChange={(e) => set('propertyId', Number(e.target.value))}>
          <option value="">— Choisir —</option>
          {(props ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title || kindLabel(p.kind)} · {p.quarter}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Client">
        <select value={form.clientId ?? ''} onChange={(e) => set('clientId', e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">— Aucun / inconnu —</option>
          {(clients ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
      </Field>
      <Field label="Retour du client">
        <div className="chips">
          {FEEDBACKS.map((f) => (
            <span key={f.value} className={`chip ${form.feedback === f.value ? 'on' : ''}`} onClick={() => set('feedback', f.value)}>
              {f.label}
            </span>
          ))}
        </div>
      </Field>
      <Field label="Notes">
        <textarea value={form.note} onChange={(e) => set('note', e.target.value)} />
      </Field>
      <button className="btn block" style={{ marginTop: 22 }} onClick={save}>Enregistrer la visite</button>
    </>
  )
}
