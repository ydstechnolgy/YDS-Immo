import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { Building2, Home as HomeIcon, MoreHorizontal, UserSearch, CalendarCheck, Users, HandCoins, Settings } from 'lucide-react'
import { Home, More } from './pages/Home'
import { PropertyDetail, PropertyForm, PropertyList } from './pages/Properties'
import { OwnerDetail, OwnerForm, OwnerList } from './pages/Owners'
import { ClientDetail, ClientForm, ClientList } from './pages/Clients'
import { VisitForm, VisitList } from './pages/Visits'
import { CommissionForm, CommissionList } from './pages/Commissions'
import { SettingsPage } from './pages/Settings'
import { AuthScreen } from './pages/Auth'
import { LicenceScreen } from './pages/LicenceScreen'
import { checkLicence, clearLicenceCache, formatExpiry, type LicenceResult } from './licence'
import { supabase } from './supabase'
import { prepareForUser, startSync, useSyncInfo } from './sync'
import type { Session } from '@supabase/supabase-js'

function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await prepareForUser(data.session.user.id)
      if (!alive) return
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (event === 'SIGNED_IN' && sess) {
        await prepareForUser(sess.user.id)
      }
      if (event === 'SIGNED_OUT') clearLicenceCache()
      setSession(sess)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])
  return { session, ready }
}

function SyncPill() {
  const i = useSyncInfo()
  const label =
    i.state === 'syncing' ? 'Synchronisation…' : i.state === 'offline' ? 'Hors ligne' : i.state === 'error' ? 'Erreur de synchro' : 'Synchronisé'
  return (
    <div className="status-bar">
      <span className={`dot ${i.state === 'idle' || i.state === 'syncing' ? '' : 'off'}`} /> {label}
    </div>
  )
}

function Gate({ session }: { session: Session }) {
  const uid = session.user.id
  const [lic, setLic] = useState<LicenceResult | null>(null)
  const run = async () => setLic(await checkLicence(uid))

  useEffect(() => {
    void run()
    const t = setInterval(() => {
      if (navigator.onLine) void run()
    }, 30 * 60 * 1000)
    const on = () => void run()
    window.addEventListener('online', on)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', on)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  useEffect(() => {
    if (lic?.ok) startSync()
  }, [lic?.ok])

  if (!lic) return <div className="empty" style={{ paddingTop: 120 }}>Vérification de la licence…</div>
  if (!lic.ok)
    return <LicenceScreen uid={uid} email={session.user.email ?? ''} initial={lic} onDone={run} />
  return <AppShell graceUntil={lic.grace ? lic.graceUntil : undefined} expiresAt={lic.expiresAt} />
}

export default function App() {
  const { session, ready } = useSession()
  if (!ready) return <div className="empty" style={{ paddingTop: 120 }}>Chargement…</div>
  if (!session) return <AuthScreen />
  return <Gate session={session} />
}

function AppShell({ graceUntil, expiresAt }: { graceUntil?: string; expiresAt?: string }) {
  return (
    <HashRouter>
      <div className="app">
        <nav className="side">
          <div className="brand">YDS <b>Immo</b></div>
          <NavLink to="/" end><HomeIcon size={20} /> Accueil</NavLink>
          <NavLink to="/biens"><Building2 size={20} /> Biens</NavLink>
          <NavLink to="/proprietaires"><Users size={20} /> Propriétaires</NavLink>
          <NavLink to="/clients"><UserSearch size={20} /> Clients</NavLink>
          <NavLink to="/visites"><CalendarCheck size={20} /> Visites</NavLink>
          <NavLink to="/commissions"><HandCoins size={20} /> Commissions</NavLink>
          <NavLink to="/reglages"><Settings size={20} /> Réglages</NavLink>
          <div style={{ position: 'absolute', bottom: 18, left: 24 }}>
            <SyncPill />
          </div>
        </nav>

        <main className="main">
          {graceUntil && (
            <div className="banner">
              Ta licence a expiré le {formatExpiry(expiresAt)}. Renouvelle-la avant le {formatExpiry(graceUntil)}, sinon le
              logiciel sera bloqué. Contacte YDS Tech.
            </div>
          )}
          <div className="syncbar"><SyncPill /></div>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/biens" element={<PropertyList />} />
            <Route path="/biens/nouveau" element={<PropertyForm />} />
            <Route path="/biens/:id" element={<PropertyDetail />} />
            <Route path="/biens/:id/modifier" element={<PropertyForm />} />
            <Route path="/proprietaires" element={<OwnerList />} />
            <Route path="/proprietaires/nouveau" element={<OwnerForm />} />
            <Route path="/proprietaires/:id" element={<OwnerDetail />} />
            <Route path="/proprietaires/:id/modifier" element={<OwnerForm />} />
            <Route path="/clients" element={<ClientList />} />
            <Route path="/clients/nouveau" element={<ClientForm />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/clients/:id/modifier" element={<ClientForm />} />
            <Route path="/visites" element={<VisitList />} />
            <Route path="/visites/nouveau" element={<VisitForm />} />
            <Route path="/commissions" element={<CommissionList />} />
            <Route path="/commissions/nouveau" element={<CommissionForm />} />
            <Route path="/reglages" element={<SettingsPage />} />
            <Route path="/plus" element={<More />} />
          </Routes>
        </main>

        <nav className="bottom">
          <NavLink to="/" end><HomeIcon size={24} />Accueil</NavLink>
          <NavLink to="/biens"><Building2 size={24} />Biens</NavLink>
          <NavLink to="/proprietaires"><Users size={24} />Proprio</NavLink>
          <NavLink to="/clients"><UserSearch size={24} />Clients</NavLink>
          <NavLink to="/plus"><MoreHorizontal size={24} />Plus</NavLink>
        </nav>
      </div>
    </HashRouter>
  )
}
