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

function useOnline() {
  const [on, setOn] = useState(navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true)
    const b = () => setOn(false)
    window.addEventListener('online', a)
    window.addEventListener('offline', b)
    return () => {
      window.removeEventListener('online', a)
      window.removeEventListener('offline', b)
    }
  }, [])
  return on
}

export default function App() {
  const online = useOnline()
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
          <div className="status-bar" style={{ position: 'absolute', bottom: 18, left: 24 }}>
            <span className={`dot ${online ? '' : 'off'}`} /> {online ? 'En ligne' : 'Hors ligne'}
          </div>
        </nav>

        <main className="main">
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
