import { api } from './api'

/**
 * The admin's Today and Team screens and the one-person profile —
 * server/src/routes/staffApp.js. Counted the same way the web pages count
 * them, so the phone and the desk never disagree on a number.
 */

export type BookedContract = {
  _id: string
  contractNo: string
  customer: string
  unitNumber: string
  sizeSqf: number | null
  units: number
  rep: string
  status: string
  value: number
  startDate: string
  endDate: string
}

export type AdminToday = {
  date: string
  leads: { today: number; yesterday: number; bySource: { source: string; n: number }[] }
  booked: { today: number; yesterday: number; unitsToday: number; list: BookedContract[] }
  collected: { today: number; yesterday: number }
  moveIns: number
  moveOuts: number
  occupancy: { pct: number; available: number; occupied: number; reserved: number; maintenance?: number; rentable?: number }
  unassigned: number
  missedFollowUps: number
  visitsToday: number
  waitingForReply: number
}

export type TeamPeriod = 'today' | 'week' | 'month'

export type TeamRow = {
  userId: string
  name: string
  role: string
  openLeads: number
  given: number
  answered: number
  notAnswered: number
  medianReplyMins: number | null
  dueToday: number
  missedFollowUps: number
  waitingForReply: number
  visits: number
  booked: number
  bookedValue: number
  calls: number
}

export type TeamReport = {
  period: TeamPeriod
  label: string
  rows: TeamRow[]
  totals: { given: number; missedFollowUps: number; booked: number; waitingForReply: number }
}

export type TimelineItem = {
  at: string
  kind: 'whatsapp' | 'call' | 'email' | 'note' | 'attempt' | 'event'
  direction?: 'in' | 'out'
  text: string
  by: string
}

export type PersonLead = {
  _id: string
  fullName: string
  phone: string
  phoneNormalized: string
  status: string
  temperature?: string
  source?: string
  owner: { _id: string; name: string } | null
  followUpAt?: string | null
  siteVisitAt?: string | null
  storageSizeValue?: number
  durationValue?: number
  durationUnit?: string
  createdAt: string
}

export type PersonContract = {
  _id: string
  contractNo: string
  status: string
  unitNumber: string
  sizeSqf: number | null
  units: number
  startDate: string
  endDate: string
  rate: number
  billingPeriod: string
  value: number
  rep: string
}

export type PersonInvoice = {
  _id: string
  invoiceNo: string
  status: string
  dueDate: string
  invoiceDate: string
  total: number
  paymentMade: number
}

export type Person = {
  name: string
  phone: string
  email: string
  leads: PersonLead[]
  customer: { _id: string; fullName: string; clientId?: string; email?: string; company?: string; stage?: string } | null
  contracts: PersonContract[]
  invoices: PersonInvoice[]
  money: { paid: number; owed: number; overdue: number }
  lastMessage: { at: string; mine: boolean } | null
  timeline: TimelineItem[]
}

export type CustomerHit = { _id: string; fullName: string; phone?: string; email?: string; clientId?: string; company?: string; stage?: string }

export const staffAppApi = {
  today: () => api.get<AdminToday>('/staff-app/admin/today').then((r) => r.data),
  team: (period: TeamPeriod) => api.get<TeamReport>('/staff-app/admin/team', { params: { period } }).then((r) => r.data),
  person: (by: { phone?: string; leadId?: string; customerId?: string }) =>
    api.get<Person>('/staff-app/person', { params: by }).then((r) => r.data),
  /** Tenants and quoted prospects, the same search the web's customer pickers use. */
  searchCustomers: (search: string) =>
    api.get<{ data?: CustomerHit[]; customers?: CustomerHit[] }>('/customers', { params: { search, limit: 30 } })
      .then((r) => r.data.data ?? r.data.customers ?? []),
}

export const AED = (n: number) => `AED ${Math.round(n).toLocaleString()}`

/** "+3 vs yesterday", "same as yesterday". */
export function versus(now: number, before: number, unit = ''): string {
  const d = now - before
  if (d === 0) return 'Same as yesterday'
  return `${d > 0 ? '+' : '−'}${unit}${Math.abs(d).toLocaleString()} vs yesterday`
}

export function minsText(m: number | null): string {
  if (m == null) return '—'
  if (m < 60) return `${m} min`
  if (m < 48 * 60) return `${(m / 60).toFixed(1)} h`
  return `${Math.round(m / 1440)} d`
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'Added by staff', whatsapp: 'WhatsApp', referral: 'Referral', walk_in: 'Walk-in',
  website: 'Website', meta_ads: 'Meta ads', mobile_app: 'Customer app', other: 'Other',
}
