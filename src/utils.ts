import type { Client, Property } from './types'
import { kindLabel } from './types'

export const fcfa = (n: number) =>
  `${Math.round(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA`

export const today = () => new Date().toISOString().slice(0, 10)

export const formatDate = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const cleanPhone = (p: string) => p.replace(/[^\d+]/g, '')

// Togo : on ajoute l'indicatif 228 si le numéro n'en a pas
export const waLink = (phone: string, text = '') => {
  let n = cleanPhone(phone).replace(/^\+/, '')
  if (n.length <= 8) n = '228' + n
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export const mapsLink = (lat?: number, lng?: number) =>
  lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : ''

export const propertyShareText = (p: Property) => {
  const lines = [
    `${p.deal === 'vente' ? 'À VENDRE' : 'À LOUER'} : ${p.title || kindLabel(p.kind)}`,
    `Prix : ${fcfa(p.price)}${p.deal === 'location' ? ' / mois' : ''}`,
  ]
  if (p.deal === 'location' && (p.caution || p.avance)) {
    lines.push(`Caution : ${fcfa(p.caution)} · Avance : ${fcfa(p.avance)}`)
  }
  const place = [p.quarter, p.city].filter(Boolean).join(', ')
  if (place) lines.push(`Lieu : ${place}${p.landmark ? ` (${p.landmark})` : ''}`)
  if (p.rooms) lines.push(`Pièces : ${p.rooms}`)
  if (p.surface) lines.push(`Superficie : ${p.surface} m²`)
  if (p.equipments.length) lines.push(`Équipements : ${p.equipments.join(', ')}`)
  if (p.description) lines.push('', p.description)
  const m = mapsLink(p.lat, p.lng)
  if (m) lines.push('', `Position : ${m}`)
  return lines.join('\n')
}

// Biens qui correspondent à ce que cherche un client
export const matchScore = (c: Client, p: Property) => {
  if (p.status !== 'disponible') return false
  if (p.deal !== c.deal) return false
  if (c.kind && p.kind !== c.kind) return false
  if (c.budgetMax && p.price > c.budgetMax) return false
  if (c.quarter && !p.quarter.toLowerCase().includes(c.quarter.toLowerCase())) return false
  return true
}

// Réduit une photo pour garder le téléphone léger
export const compressImage = (file: File, maxSide = 1200, quality = 0.72): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = url
  })

// Fiche du bien en image, prête pour WhatsApp
export const buildFlyer = async (p: Property, agentName: string, agentPhone: string) => {
  const W = 1080
  const H = 1350
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#0f1b33'
  g.fillRect(0, 0, W, H)

  if (p.photos[0]) {
    await new Promise<void>((res) => {
      const im = new Image()
      im.onload = () => {
        const r = Math.max(W / im.width, 700 / im.height)
        const w = im.width * r
        const h = im.height * r
        g.save()
        g.beginPath()
        g.rect(0, 0, W, 700)
        g.clip()
        g.drawImage(im, (W - w) / 2, (700 - h) / 2, w, h)
        g.restore()
        res()
      }
      im.onerror = () => res()
      im.src = p.photos[0]
    })
  } else {
    g.fillStyle = '#1a2b4d'
    g.fillRect(0, 0, W, 700)
  }

  g.fillStyle = '#d4a843'
  g.fillRect(40, 40, 230, 70)
  g.fillStyle = '#0f1b33'
  g.font = 'bold 38px sans-serif'
  g.fillText(p.deal === 'vente' ? 'À VENDRE' : 'À LOUER', 62, 90)

  g.fillStyle = '#ffffff'
  g.font = 'bold 54px sans-serif'
  wrap(g, p.title || kindLabel(p.kind), 50, 790, W - 100, 62, 2)

  g.fillStyle = '#d4a843'
  g.font = 'bold 64px sans-serif'
  g.fillText(`${fcfa(p.price)}${p.deal === 'location' ? ' /mois' : ''}`, 50, 960)

  g.fillStyle = '#c8d3e8'
  g.font = '36px sans-serif'
  const place = [p.quarter, p.city].filter(Boolean).join(', ')
  if (place) g.fillText(`📍 ${place}`, 50, 1030)
  const info = [
    p.rooms ? `${p.rooms} pièces` : '',
    p.surface ? `${p.surface} m²` : '',
    p.deal === 'location' && p.caution ? `Caution ${fcfa(p.caution)}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ')
  if (info) g.fillText(info, 50, 1090)

  g.fillStyle = '#d4a843'
  g.fillRect(0, 1190, W, 160)
  g.fillStyle = '#0f1b33'
  g.font = 'bold 44px sans-serif'
  g.fillText(agentName || 'Démarcheur', 50, 1255)
  g.font = '40px sans-serif'
  g.fillText(agentPhone ? `📞 ${agentPhone}` : '', 50, 1315)

  return new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), 'image/jpeg', 0.9))
}

function wrap(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  maxLines: number,
) {
  const words = text.split(' ')
  let line = ''
  let n = 0
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y + n * lh)
      line = w
      n++
      if (n >= maxLines) return
    } else line = test
  }
  g.fillText(line, x, y + n * lh)
}
