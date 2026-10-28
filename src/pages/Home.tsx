import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Building2, CalendarCheck, HandCoins, Users, UserSearch, Settings, ChevronRight } from 'lucide-react'
import { db } from '../db'
import { Top, settings } from '../ui'
import { fcfa, formatDate, today } from '../utils'
import { kindLabel } from '../types'

export function Home() {
  const props = useLiveQuery(() => db.properties.toArray(), [])
  const visits = useLiveQuery(() => db.visits.toArray(), [])
  const comms = useLiveQuery(() => db.commissions.toArray(), [])
  const me = settings.get()

  const p = props ?? []
  const dispo = p.filter((x) => x.status === 'disponible')
  const month = today().slice(0, 7)
  const monthComm = (comms ?? []).filter((c) => c.date.startsWith(month)).reduce((s, c) => s + c.total, 0)
  const toReceive = (comms ?? []).reduce((s, c) => s + (c.total - c.received), 0)
  const next = (visits ?? []).filter((v) => v.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3)
  const limit = Date.now() - 30 * 24 * 3600 * 1000
  const stale = dispo.filter(
    (x) => x.createdAt < limit && !(visits ?? []).some((v) => v.propertyId === x.id),
  )

  return (
    <>
      <Top title={me.name ? `Bonjour ${me.name.split(' ')[0]} 👋` : 'Bonjour 👋'} back={false} />
      <p className="muted" style={{ marginTop: 0 }}>Voici où tu en es aujourd'hui.</p>

      <div className="grid">
        <div className="stat"><div className="n">{dispo.length}</div><div className="l">Biens disponibles</div></div>
        <div className="stat"><div className="n">{p.filter((x) => x.status === 'reserve').length}</div><div className="l">Réservés</div></div>
        <div className="stat"><div className="n">{p.filter((x) => x.status === 'conclu').length}</div><div className="l">Loués / vendus</div></div>
        <div className="stat"><div className="n" style={{ fontSize: '1.2rem' }}>{fcfa(monthComm)}</div><div className="l">Commissions du mois</div></div>
      </div>

      {toReceive > 0 && (
        <Link to="/commissions" className="card click row" style={{ display: 'flex', marginTop: 12 }}>
          <HandCoins color="var(--gold)" />
          <div className="grow"><strong>{fcfa(toReceive)}</strong><div className="muted small">à encaisser</div></div>
          <ChevronRight />
        </Link>
      )}

      <h2>Prochaines visites</h2>
      {next.length === 0 && <div className="card muted">Aucune visite prévue.</div>}
      {next.map((v) => {
        const bien = p.find((x) => x.id === v.propertyId)
        return (
          <Link key={v.id} to={`/biens/${v.propertyId}`} className="card click" style={{ display: 'block' }}>
            <strong>{formatDate(v.date)}</strong>
            <div className="muted small">{bien ? bien.title || `${kindLabel(bien.kind)} ${bien.quarter}` : 'Bien supprimé'}</div>
          </Link>
        )
      })}

      {stale.length > 0 && (
        <>
          <h2>Biens qui traînent</h2>
          <div className="muted small" style={{ marginBottom: 8 }}>Plus de 30 jours sans aucune visite : pense à relancer ou à baisser le prix.</div>
          {stale.slice(0, 5).map((x) => (
            <Link key={x.id} to={`/biens/${x.id}`} className="card click" style={{ display: 'block' }}>
              <strong>{x.title || kindLabel(x.kind)}</strong>
              <div className="muted small">{x.quarter} · {fcfa(x.price)}</div>
            </Link>
          ))}
        </>
      )}

      <Link to="/biens/nouveau" className="btn block" style={{ marginTop: 22 }}>
        <Building2 /> Ajouter un nouveau bien
      </Link>
    </>
  )
}

export function More() {
  const items = [
    { to: '/proprietaires', icon: <Users />, label: 'Propriétaires' },
    { to: '/commissions', icon: <HandCoins />, label: 'Commissions' },
    { to: '/visites', icon: <CalendarCheck />, label: 'Visites' },
    { to: '/clients', icon: <UserSearch />, label: 'Clients' },
    { to: '/reglages', icon: <Settings />, label: 'Réglages et sauvegarde' },
  ]
  return (
    <>
      <Top title="Plus" back={false} />
      {items.map((i) => (
        <Link key={i.to} to={i.to} className="card click row" style={{ display: 'flex' }}>
          <span style={{ color: 'var(--gold)' }}>{i.icon}</span>
          <strong className="grow">{i.label}</strong>
          <ChevronRight />
        </Link>
      ))}
    </>
  )
}
