import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { db } from '../db'
import { kindLabel, type Commission } from '../types'
import { Empty, Field, NumInput, Top, confirmDelete, settings } from '../ui'
import { fcfa, formatDate, today } from '../utils'

export function CommissionList() {
  const list = useLiveQuery(() => db.commissions.orderBy('date').reverse().toArray(), [])
  const props = useLiveQuery(() => db.properties.toArray(), [])
  const pName = (id: number) => {
    const p = props?.find((x) => x.id === id)
    return p ? p.title || `${kindLabel(p.kind)} ${p.quarter}` : 'Bien supprimé'
  }
  const total = (list ?? []).reduce((s, c) => s + c.total, 0)
  const received = (list ?? []).reduce((s, c) => s + c.received, 0)

  return (
    <>
      <Top title="Commissions" back={false} />
      <div className="grid" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="n">{fcfa(received)}</div><div className="l">Déjà encaissé</div></div>
        <div className="stat"><div className="n">{fcfa(total - received)}</div><div className="l">Reste à recevoir</div></div>
      </div>
      {(list ?? []).length === 0 && <Empty text="Aucune commission. Quand un bien est loué ou vendu, enregistre ta commission ici." />}
      {(list ?? []).map((c) => (
        <div key={c.id} className="card">
          <div className="row between">
            <Link to={`/biens/${c.propertyId}`} style={{ color: 'var(--gold)', fontWeight: 700 }}>{pName(c.propertyId)}</Link>
            <span className="muted small">{formatDate(c.date)}</span>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span>Commission : <b>{fcfa(c.total)}</b></span>
            <span className={`badge ${c.received >= c.total ? 'ok' : 'warn'}`}>
              {c.received >= c.total ? 'Payée' : `Reste ${fcfa(c.total - c.received)}`}
            </span>
          </div>
          {c.note && <div className="muted small" style={{ marginTop: 6 }}>{c.note}</div>}
          <div className="row wrap" style={{ marginTop: 10 }}>
            {c.received < c.total && (
              <button className="btn sm grow" onClick={() => db.commissions.update(c.id!, { received: c.total })}>
                Marquer comme payée
              </button>
            )}
            <button
              className="btn danger sm"
              onClick={async () => confirmDelete('cette commission') && (await db.commissions.delete(c.id!))}
              aria-label="Supprimer"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
      <Link to="/commissions/nouveau" className="fab" aria-label="Ajouter une commission"><Plus size={30} /></Link>
    </>
  )
}

export function CommissionForm() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const props = useLiveQuery(() => db.properties.toArray(), [])
  const [form, setForm] = useState<Commission>({
    propertyId: Number(sp.get('bien')) || 0,
    total: 0,
    received: 0,
    note: '',
    date: today(),
    createdAt: Date.now(),
  })
  const [rate, setRate] = useState(settings.get().rate || 0)
  const set = <K extends keyof Commission>(k: K, v: Commission[K]) => setForm({ ...form, [k]: v })
  const prop = props?.find((p) => p.id === form.propertyId)

  const computeFromRate = () => prop && rate && set('total', Math.round((prop.price * rate) / 100))

  const save = async () => {
    if (!form.propertyId) return alert('Choisis le bien concerné.')
    if (!form.total) return alert('Indique le montant de ta commission.')
    await db.commissions.add(form)
    nav(-1)
  }

  return (
    <>
      <Top title="Nouvelle commission" />
      <Field label="Bien concerné">
        <select value={form.propertyId || ''} onChange={(e) => set('propertyId', Number(e.target.value))}>
          <option value="">— Choisir —</option>
          {(props ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.title || kindLabel(p.kind)} · {p.quarter} · {fcfa(p.price)}</option>
          ))}
        </select>
      </Field>
      {prop && (
        <div className="card">
          <label style={{ marginTop: 0 }}>Calculer avec un pourcentage du prix</label>
          <div className="row">
            <input inputMode="decimal" style={{ maxWidth: 110 }} value={rate || ''} onChange={(e) => setRate(Number(e.target.value.replace(',', '.')) || 0)} placeholder="%" />
            <button className="btn alt sm grow" onClick={computeFromRate}>Calculer</button>
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>Prix du bien : {fcfa(prop.price)}</div>
        </div>
      )}
      <Field label="Montant de ma commission (FCFA)">
        <NumInput value={form.total} onChange={(n) => set('total', n)} />
      </Field>
      <Field label="Déjà reçu (FCFA)">
        <NumInput value={form.received} onChange={(n) => set('received', n)} />
      </Field>
      <Field label="Date">
        <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea value={form.note} onChange={(e) => set('note', e.target.value)} />
      </Field>
      <button className="btn block" style={{ marginTop: 22 }} onClick={save}>Enregistrer</button>
    </>
  )
}
