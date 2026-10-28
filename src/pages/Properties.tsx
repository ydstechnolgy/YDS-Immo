import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Crosshair, ImageIcon, MapPin, Phone, Plus, Share2, Trash2, MessageCircle } from 'lucide-react'
import { db, newId } from '../db'
import {
  EQUIPMENTS,
  KINDS,
  STATUSES,
  kindLabel,
  type Property,
  type Status,
} from '../types'
import { Empty, Field, NumInput, StatusBadge, Top, confirmDelete, settings } from '../ui'
import {
  buildFlyer,
  compressImage,
  fcfa,
  formatDate,
  mapsLink,
  propertyShareText,
  waLink,
} from '../utils'

export function PropertyList() {
  const props = useLiveQuery(() => db.properties.orderBy('createdAt').reverse().toArray(), [])
  const [q, setQ] = useState('')
  const [deal, setDeal] = useState<'tous' | 'location' | 'vente'>('tous')
  const [status, setStatus] = useState<'tous' | Status>('disponible')

  const list = (props ?? []).filter((p) => {
    if (deal !== 'tous' && p.deal !== deal) return false
    if (status !== 'tous' && p.status !== status) return false
    const hay = `${p.title} ${p.quarter} ${p.city} ${p.landmark} ${kindLabel(p.kind)}`.toLowerCase()
    return hay.includes(q.toLowerCase())
  })

  return (
    <>
      <Top title="Mes biens" back={false} />
      <input className="search" placeholder="Rechercher (quartier, type…)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips" style={{ marginBottom: 8 }}>
        {(['tous', 'location', 'vente'] as const).map((d) => (
          <span key={d} className={`chip ${deal === d ? 'on' : ''}`} onClick={() => setDeal(d)}>
            {d === 'tous' ? 'Tout' : d === 'location' ? 'Location' : 'Vente'}
          </span>
        ))}
      </div>
      <div className="chips" style={{ marginBottom: 14 }}>
        <span className={`chip ${status === 'tous' ? 'on' : ''}`} onClick={() => setStatus('tous')}>
          Tous statuts
        </span>
        {STATUSES.map((s) => (
          <span key={s.value} className={`chip ${status === s.value ? 'on' : ''}`} onClick={() => setStatus(s.value)}>
            {s.label}
          </span>
        ))}
      </div>

      {list.length === 0 && <Empty text="Aucun bien pour le moment. Appuie sur + pour en ajouter un." />}
      {list.map((p) => (
        <Link key={p.id} to={`/biens/${p.id}`} className="card click row" style={{ display: 'flex' }}>
          {p.photos[0] ? <img className="thumb" src={p.photos[0]} alt="" /> : <div className="thumb ph"><ImageIcon /></div>}
          <div className="grow">
            <div className="row between">
              <strong>{p.title || kindLabel(p.kind)}</strong>
              <StatusBadge s={p.status} />
            </div>
            <div className="price">
              {fcfa(p.price)}
              {p.deal === 'location' ? ' /mois' : ''}
            </div>
            <div className="muted small">
              {p.deal === 'vente' ? 'Vente' : 'Location'} · {kindLabel(p.kind)}
              {p.quarter ? ` · ${p.quarter}` : ''}
            </div>
          </div>
        </Link>
      ))}
      <Link to="/biens/nouveau" className="fab" aria-label="Ajouter un bien">
        <Plus size={30} />
      </Link>
    </>
  )
}

const emptyProperty = (): Property => ({
  kind: 'maison',
  deal: 'location',
  title: '',
  price: 0,
  caution: 0,
  avance: 0,
  city: 'Lomé',
  quarter: '',
  landmark: '',
  surface: 0,
  rooms: 0,
  bathrooms: 0,
  equipments: [],
  description: '',
  status: 'disponible',
  mandate: 'simple',
  photos: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

export function PropertyForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const owners = useLiveQuery(() => db.owners.orderBy('name').toArray(), [])
  const existing = useLiveQuery(() => (id ? db.properties.get(String(id)) : undefined), [id])
  const [form, setForm] = useState<Property | null>(id ? null : emptyProperty())
  const [gpsMsg, setGpsMsg] = useState('')

  if (id && existing && !form) setForm(existing)
  if (!form) return <Top title="Modifier le bien" />

  const set = <K extends keyof Property>(k: K, v: Property[K]) => setForm({ ...form, [k]: v })

  const getGps = () => {
    if (!navigator.geolocation) return setGpsMsg("Ton appareil ne gère pas la localisation.")
    setGpsMsg('Recherche de ta position…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm({ ...form, lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsMsg('Position enregistrée ✔ (reste devant le bien pour plus de précision)')
      },
      () => setGpsMsg("Impossible d'obtenir la position. Vérifie que la localisation est activée."),
      { enableHighAccuracy: true, timeout: 20000 },
    )
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files) return
    const added: string[] = []
    for (const f of Array.from(files)) added.push(await compressImage(f))
    set('photos', [...form.photos, ...added])
  }

  const toggleEquip = (e: string) =>
    set('equipments', form.equipments.includes(e) ? form.equipments.filter((x) => x !== e) : [...form.equipments, e])

  const save = async () => {
    if (!form.price) return alert('Indique le prix ou le loyer.')
    const data = { ...form, updatedAt: Date.now() }
    if (id) {
      await db.properties.put(data)
      nav(`/biens/${id}`, { replace: true })
    } else {
      const createdId = await db.properties.add({ ...data, id: newId() })
      nav(`/biens/${createdId}`, { replace: true })
    }
  }

  return (
    <>
      <Top title={id ? 'Modifier le bien' : 'Nouveau bien'} />

      <div className="chips">
        {(['location', 'vente'] as const).map((d) => (
          <span key={d} className={`chip ${form.deal === d ? 'on' : ''}`} onClick={() => set('deal', d)}>
            {d === 'location' ? 'À louer' : 'À vendre'}
          </span>
        ))}
      </div>

      <Field label="Type de bien">
        <div className="chips">
          {KINDS.map((k) => (
            <span key={k.value} className={`chip ${form.kind === k.value ? 'on' : ''}`} onClick={() => set('kind', k.value)}>
              {k.label}
            </span>
          ))}
        </div>
      </Field>

      <Field label="Propriétaire">
        <select value={form.ownerId ?? ''} onChange={(e) => set('ownerId', e.target.value || undefined)}>
          <option value="">— Aucun / à ajouter plus tard —</option>
          {(owners ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} {o.phone ? `(${o.phone})` : ''}
            </option>
          ))}
        </select>
        <Link to="/proprietaires/nouveau" className="small" style={{ color: 'var(--gold)', display: 'inline-block', marginTop: 6 }}>
          + Nouveau propriétaire
        </Link>
      </Field>

      <Field label="Titre (facultatif)">
        <input placeholder="Ex : Villa 3 chambres salon" value={form.title} onChange={(e) => set('title', e.target.value)} />
      </Field>

      <Field label={form.deal === 'vente' ? 'Prix de vente (FCFA)' : 'Loyer par mois (FCFA)'}>
        <NumInput value={form.price} onChange={(n) => set('price', n)} />
      </Field>

      {form.deal === 'location' && (
        <div className="two">
          <Field label="Caution (FCFA)">
            <NumInput value={form.caution} onChange={(n) => set('caution', n)} />
          </Field>
          <Field label="Avance (FCFA)">
            <NumInput value={form.avance} onChange={(n) => set('avance', n)} />
          </Field>
        </div>
      )}

      <h2>Où se trouve le bien ?</h2>
      <div className="two">
        <Field label="Ville">
          <input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Quartier">
          <input placeholder="Ex : Adidogomé" value={form.quarter} onChange={(e) => set('quarter', e.target.value)} />
        </Field>
      </div>
      <Field label="Repère">
        <input placeholder="Ex : derrière la pharmacie, 2e rue à droite" value={form.landmark} onChange={(e) => set('landmark', e.target.value)} />
      </Field>
      <button type="button" className="btn alt block" onClick={getGps} style={{ marginTop: 14 }}>
        <Crosshair /> Enregistrer ma position GPS ici
      </button>
      {gpsMsg && <p className="small muted">{gpsMsg}</p>}
      {form.lat != null && form.lng != null && (
        <p className="small">
          📍 {form.lat.toFixed(5)}, {form.lng.toFixed(5)} ·{' '}
          <a href={mapsLink(form.lat, form.lng)} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>
            Voir sur la carte
          </a>{' '}
          ·{' '}
          <a
            href="#"
            style={{ color: 'var(--bad)' }}
            onClick={(e) => {
              e.preventDefault()
              setForm({ ...form, lat: undefined, lng: undefined })
            }}
          >
            Effacer
          </a>
        </p>
      )}

      <h2>Détails</h2>
      <div className="two">
        <Field label="Pièces / chambres">
          <NumInput value={form.rooms} onChange={(n) => set('rooms', n)} />
        </Field>
        <Field label="Superficie (m²)">
          <NumInput value={form.surface} onChange={(n) => set('surface', n)} />
        </Field>
      </div>
      <Field label="Équipements">
        <div className="chips">
          {EQUIPMENTS.map((e) => (
            <span key={e} className={`chip ${form.equipments.includes(e) ? 'on' : ''}`} onClick={() => toggleEquip(e)}>
              {e}
            </span>
          ))}
        </div>
      </Field>
      <Field label="Description">
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
      </Field>

      <Field label="Mandat">
        <div className="chips">
          {(['simple', 'exclusif'] as const).map((m) => (
            <span key={m} className={`chip ${form.mandate === m ? 'on' : ''}`} onClick={() => set('mandate', m)}>
              {m === 'simple' ? 'Simple' : 'Exclusif'}
            </span>
          ))}
        </div>
      </Field>

      <Field label="Statut">
        <div className="chips">
          {STATUSES.map((s) => (
            <span key={s.value} className={`chip ${form.status === s.value ? 'on' : ''}`} onClick={() => set('status', s.value)}>
              {s.label}
            </span>
          ))}
        </div>
      </Field>

      <h2>Photos</h2>
      {form.photos.length > 0 && (
        <div className="photos" style={{ marginBottom: 10 }}>
          {form.photos.map((src, i) => (
            <div className="rm" key={i}>
              <img src={src} alt="" />
              <button onClick={() => set('photos', form.photos.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="row wrap">
        <label className="btn alt grow" style={{ margin: 0 }}>
          <Camera /> Prendre / choisir
          <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
        </label>
      </div>

      <button className="btn block" style={{ marginTop: 26 }} onClick={save}>
        Enregistrer le bien
      </button>
    </>
  )
}

export function PropertyDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const p = useLiveQuery(() => db.properties.get(String(id)), [id])
  const owner = useLiveQuery(async () => (p?.ownerId ? db.owners.get(p.ownerId) : undefined), [p?.ownerId])
  const visits = useLiveQuery(() => db.visits.where('propertyId').equals(String(id)).toArray(), [id])
  const [busy, setBusy] = useState(false)

  if (!p) return <Top title="Bien" />

  const me = settings.get()
  const text = propertyShareText(p)

  const shareFlyer = async () => {
    setBusy(true)
    try {
      const blob = await buildFlyer(p, me.name, me.phone)
      const file = new File([blob], 'bien.jpg', { type: 'image/jpeg' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${p.title || kindLabel(p.kind)}.jpg`
        a.click()
      }
    } catch {
      /* annulé */
    }
    setBusy(false)
  }

  const setStatus = (s: Status) => db.properties.update(p.id!, { status: s, updatedAt: Date.now() })

  const remove = async () => {
    if (!confirmDelete('ce bien')) return
    await db.visits.where('propertyId').equals(p.id!).delete()
    await db.commissions.where('propertyId').equals(p.id!).delete()
    await db.properties.delete(p.id!)
    nav('/biens', { replace: true })
  }

  return (
    <>
      <Top
        title={p.title || kindLabel(p.kind)}
        right={
          <Link to={`/biens/${p.id}/modifier`} className="btn alt sm">
            Modifier
          </Link>
        }
      />
      {p.photos.length > 0 && (
        <div className="photos" style={{ marginBottom: 12 }}>
          {p.photos.map((s, i) => (
            <img key={i} src={s} alt="" />
          ))}
        </div>
      )}
      <div className="card">
        <div className="row between">
          <span className="badge gold">{p.deal === 'vente' ? 'À vendre' : 'À louer'}</span>
          <StatusBadge s={p.status} />
        </div>
        <div className="price" style={{ fontSize: '1.6rem', margin: '8px 0' }}>
          {fcfa(p.price)}
          {p.deal === 'location' ? ' /mois' : ''}
        </div>
        {p.deal === 'location' && (p.caution > 0 || p.avance > 0) && (
          <div className="muted">
            Caution : {fcfa(p.caution)} · Avance : {fcfa(p.avance)}
          </div>
        )}
      </div>

      <div className="card">
        <div className="kv"><span>Type</span><span>{kindLabel(p.kind)}</span></div>
        <div className="kv"><span>Lieu</span><span>{[p.quarter, p.city].filter(Boolean).join(', ') || '—'}</span></div>
        {p.landmark && <div className="kv"><span>Repère</span><span>{p.landmark}</span></div>}
        {p.rooms > 0 && <div className="kv"><span>Pièces</span><span>{p.rooms}</span></div>}
        {p.surface > 0 && <div className="kv"><span>Superficie</span><span>{p.surface} m²</span></div>}
        {p.equipments.length > 0 && <div className="kv"><span>Équipements</span><span>{p.equipments.join(', ')}</span></div>}
        <div className="kv"><span>Mandat</span><span>{p.mandate === 'exclusif' ? 'Exclusif' : 'Simple'}</span></div>
        <div className="kv"><span>Ajouté le</span><span>{formatDate(new Date(p.createdAt).toISOString())}</span></div>
      </div>

      {p.description && <div className="card">{p.description}</div>}

      {p.lat != null && p.lng != null && (
        <a className="btn alt block" href={mapsLink(p.lat, p.lng)} target="_blank" rel="noreferrer" style={{ marginBottom: 12 }}>
          <MapPin /> Ouvrir sur la carte / itinéraire
        </a>
      )}

      <h2>Partager</h2>
      <div className="row wrap">
        <button className="btn grow" onClick={shareFlyer} disabled={busy}>
          <Share2 /> {busy ? 'Préparation…' : 'Fiche en image'}
        </button>
        <a className="btn wa grow" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          <MessageCircle /> WhatsApp (texte)
        </a>
      </div>

      <h2>Propriétaire</h2>
      {owner ? (
        <div className="card">
          <Link to={`/proprietaires/${owner.id}`}><strong>{owner.name}</strong></Link>
          <div className="row wrap" style={{ marginTop: 10 }}>
            {owner.phone && <a className="btn alt sm" href={`tel:${owner.phone}`}><Phone size={18} /> Appeler</a>}
            {(owner.whatsapp || owner.phone) && (
              <a className="btn wa sm" href={waLink(owner.whatsapp || owner.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
            )}
          </div>
        </div>
      ) : (
        <div className="card muted">Aucun propriétaire lié.</div>
      )}

      <h2>Changer le statut</h2>
      <div className="chips">
        {STATUSES.map((s) => (
          <span key={s.value} className={`chip ${p.status === s.value ? 'on' : ''}`} onClick={() => setStatus(s.value)}>
            {s.label}
          </span>
        ))}
      </div>
      {p.status === 'conclu' && (
        <Link to={`/commissions/nouveau?bien=${p.id}`} className="btn block" style={{ marginTop: 14 }}>
          Enregistrer ma commission
        </Link>
      )}

      <h2>Visites ({visits?.length ?? 0})</h2>
      <Link to={`/visites/nouveau?bien=${p.id}`} className="btn alt block">
        + Noter une visite
      </Link>

      <button className="btn danger block" style={{ marginTop: 28 }} onClick={remove}>
        <Trash2 size={18} /> Supprimer ce bien
      </button>
    </>
  )
}
