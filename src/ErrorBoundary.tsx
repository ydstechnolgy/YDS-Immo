import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

// Si une page plante, on affiche un message au lieu d'un écran bleu vide
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card" style={{ margin: 20 }}>
        <strong>Oups, cette page a rencontré un problème.</strong>
        <p className="muted small">Tes données ne sont pas perdues. Reviens à l'accueil et réessaie.</p>
        <p className="muted small" style={{ wordBreak: 'break-word' }}>
          Détail : {this.state.error.message}
        </p>
        <a className="btn block" href="#/">
          Retour à l'accueil
        </a>
      </div>
    )
  }
}

// Une nouvelle page remet le garde à zéro
export function RouteGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <Boundary key={pathname}>{children}</Boundary>
}
