export type Deal = 'location' | 'vente'
export type Kind =
  | 'maison'
  | 'appartement'
  | 'terrain'
  | 'boutique'
  | 'bureau'
  | 'chambre'
  | 'entrepot'
export type Status = 'disponible' | 'reserve' | 'conclu' | 'retire'
export type Mandate = 'simple' | 'exclusif'
export type Feedback = 'en_attente' | 'interesse' | 'a_rappeler' | 'pas_interesse'

export interface Owner {
  id?: number
  name: string
  phone: string
  whatsapp: string
  note: string
  createdAt: number
}

export interface Property {
  id?: number
  ownerId?: number
  kind: Kind
  deal: Deal
  title: string
  price: number
  caution: number
  avance: number
  city: string
  quarter: string
  landmark: string
  lat?: number
  lng?: number
  surface: number
  rooms: number
  bathrooms: number
  equipments: string[]
  description: string
  status: Status
  mandate: Mandate
  photos: string[]
  createdAt: number
  updatedAt: number
}

export interface Client {
  id?: number
  name: string
  phone: string
  deal: Deal
  kind: Kind | ''
  budgetMax: number
  quarter: string
  note: string
  createdAt: number
}

export interface Visit {
  id?: number
  propertyId: number
  clientId?: number
  date: string
  feedback: Feedback
  note: string
  createdAt: number
}

export interface Commission {
  id?: number
  propertyId: number
  clientId?: number
  total: number
  received: number
  note: string
  date: string
  createdAt: number
}

export const KINDS: { value: Kind; label: string }[] = [
  { value: 'maison', label: 'Maison' },
  { value: 'appartement', label: 'Appartement' },
  { value: 'chambre', label: 'Chambre' },
  { value: 'terrain', label: 'Terrain' },
  { value: 'boutique', label: 'Boutique' },
  { value: 'bureau', label: 'Bureau' },
  { value: 'entrepot', label: 'Entrepôt' },
]

export const STATUSES: { value: Status; label: string }[] = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'reserve', label: 'Réservé' },
  { value: 'conclu', label: 'Loué / Vendu' },
  { value: 'retire', label: 'Retiré' },
]

export const FEEDBACKS: { value: Feedback; label: string }[] = [
  { value: 'en_attente', label: 'En attente' },
  { value: 'interesse', label: 'Intéressé' },
  { value: 'a_rappeler', label: 'À rappeler' },
  { value: 'pas_interesse', label: 'Pas intéressé' },
]

export const EQUIPMENTS = [
  'Eau (CDE)',
  'Électricité (CEET)',
  'Clôture',
  'Carrelage',
  'Parking',
  'Gardien',
  'Climatisation',
  'Forage / puits',
  'Cour',
  'Étage',
]

export const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k
export const statusLabel = (s: string) => STATUSES.find((x) => x.value === s)?.label ?? s
export const feedbackLabel = (s: string) => FEEDBACKS.find((x) => x.value === s)?.label ?? s
