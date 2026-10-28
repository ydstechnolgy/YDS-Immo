import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { statusLabel } from './types'

export function Top({ title, back = true, right }: { title: string; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="topbar">
      {back && (
        <button className="back" onClick={() => nav(-1)} aria-label="Retour">
          <ChevronLeft />
        </button>
      )}
      <h1 className="grow" style={{ margin: 0 }}>
        {title}
      </h1>
      {right}
    </div>
  )
}

export function StatusBadge({ s }: { s: string }) {
  const cls = s === 'disponible' ? 'ok' : s === 'reserve' ? 'warn' : s === 'conclu' ? 'gold' : 'bad'
  return <span className={`badge ${cls}`}>{statusLabel(s)}</span>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label>{label}</label>
      {children}
    </div>
  )
}

export function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: number
  onChange: (n: number) => void
  placeholder?: string
}) {
  return (
    <input
      inputMode="numeric"
      placeholder={placeholder}
      value={value ? String(value) : ''}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
    />
  )
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>
}

export function confirmDelete(what: string) {
  return window.confirm(`Supprimer ${what} ? Cette action est définitive.`)
}

export const settings = {
  get: () => ({
    name: localStorage.getItem('yds.agentName') || '',
    phone: localStorage.getItem('yds.agentPhone') || '',
    rate: Number(localStorage.getItem('yds.rate') || '0'),
  }),
  set: (k: 'agentName' | 'agentPhone' | 'rate', v: string) => localStorage.setItem(`yds.${k}`, v),
}
