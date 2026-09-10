import { api } from './api'

/**
 * Types and calls mirrored from server/src/models/index.js's Unit schema and
 * the routes/units.js + routes/quotes.js handlers — same fields, same
 * server. No mobile-specific search endpoint exists, so filtering by unit
 * number/size happens client-side over whichever list the server hands
 * back, the same way the web app's Units.tsx does for its free-text box.
 */

export type UnitStatus = 'available' | 'occupied' | 'reserved' | 'maintenance'

export type UnitBooking = {
  kind: 'contract' | 'quote' | 'current'
  ref: string
  customer: string
  startDate: string
  endDate: string
  status: string
  quotedAt?: string
}

export interface Unit {
  _id: string
  unitNumber: string
  site?: string | null
  floor: string
  sizeSqf: number | null
  price: number | null
  lengthFt: number | null
  widthFt: number | null
  status: UnitStatus
  discountPct: number
  shared: boolean
  notes: string
  createdAt?: string
  /** Only present when fetched through availableInPeriod. */
  bookedInPeriod?: boolean
  bookings?: UnitBooking[]
}

export interface UnitContract {
  _id: string
  contractNo?: string
  customerName?: string
  startDate?: string
  endDate?: string
  status?: string
}

export const unitApi = {
  /** Every unit with today's raw `status` — no date window applied. */
  list: () => api.get<Unit[]>('/units').then((r) => r.data),
  /** Every unit, each carrying whether it's free across [from, to]. */
  availableInPeriod: (from: string, to: string) =>
    api.get<Unit[]>('/quotes/available-units', { params: { from, to, all: 'true' } }).then((r) => r.data),
  get: (id: string) => api.get<{ unit: Unit; contracts: UnitContract[] }>(`/units/${id}`).then((r) => r.data),
}
