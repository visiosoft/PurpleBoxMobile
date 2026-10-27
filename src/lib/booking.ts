import { api } from './api'

/**
 * The web's Book Unit wizard (client/src/pages/NewQuote.tsx) on the phone:
 * Customer → Units → Quotation → Contract, against the same endpoints, and
 * resumable from either side because the step is saved on the quote the way
 * the web saves it. Only ever started from a lead, as on the web's Leads page.
 *
 * The maths below is copied from NewQuote.tsx and client/src/lib/quoteVat.ts
 * so the totals move while the rep edits; the server recomputes and stores
 * the real figure on save. Change one, change all three.
 */

export const STEPS = ['Customer', 'Units', 'Quotation', 'Contract'] as const

export type BookingCustomer = { _id: string; fullName: string; phone?: string; email?: string }

export type AvailableUnit = {
  _id: string
  unitNumber: string
  floor: string
  sizeSqf: number
  price: number
  status: string
  discountPct: number
  bookedInPeriod?: boolean
  bookings?: { ref: string; customer: string; startDate?: string; endDate?: string; kind?: string }[]
}

export type UnitRow = {
  unitId: string
  unitNumber: string
  sizeSqf: number
  floor: string
  startDate: string
  endDate: string
  rate: number
  discountPct: number
}

export type AddOnRow = { name: string; description: string; quantity: number; rate: number }

export type Quote = {
  _id: string
  quoteNo: string
  status: string
  total: number
  customer?: BookingCustomer | null
  units: (Omit<UnitRow, 'unitId' | 'startDate' | 'endDate'> & { unit: string | { _id: string }; startDate?: string; endDate?: string })[]
  addOns?: AddOnRow[]
  deposit?: number
  holdAdvance?: boolean
  vatEnabled?: boolean
  cardFeeEnabled?: boolean
  cardFeePct?: number
  adjustment?: number
  notes?: string
  termsAndConditions?: string
  contract?: { _id: string; contractNo: string; status: string } | string | null
  flowStep?: number
}

export type CustomerDoc = { _id: string; name: string; type: string; url: string }
export type AccessPerson = { name: string; phone?: string; relation?: string; idType?: string; idNumber?: string }
export type FlowContract = {
  _id: string
  contractNo: string
  status: string
  startDate: string
  endDate: string
  authorizedPersons?: AccessPerson[]
}
export type ContractTask = { _id: string; title: string; status: string; createdAt: string; assignedTo?: { name?: string } | null }

/** ID_DOC_TYPES on the web — one of these must be on file before a contract. */
export const ID_DOC_TYPES = ['emirates_id', 'passport', 'id_proof']
export const DOC_TYPE_LABELS: Record<string, string> = {
  emirates_id: 'Emirates ID', passport: 'Passport', visa: 'Visa',
  trade_license: 'Trade License', id_proof: 'ID Proof', contract: 'Contract', other: 'Other',
}
export const WEEK_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 20, 24, 36, 52]
export const DEFAULT_ADDONS = [{ name: 'Lock', description: 'Padlock for storage unit', rate: 80 }]

export const bookingApi = {
  /** Already a customer under the lead's number? The web picks the first match the same way. */
  findCustomer: (phone: string) =>
    api.get<{ data: BookingCustomer[] }>('/customers', { params: { search: phone, limit: 3 } }).then((r) => r.data.data?.[0] ?? null),
  /** Somebody being quoted is a prospect; the server promotes them when a contract exists. */
  createCustomer: (body: { fullName: string; phone: string; email?: string; notes?: string }) =>
    api.post<BookingCustomer>('/customers', { stage: 'prospect', tenantType: 'individual', ...body }).then((r) => r.data),
  quotesForLead: (leadId: string) => api.get<Quote[]>('/quotes', { params: { lead: leadId } }).then((r) => r.data),
  getQuote: (id: string) => api.get<Quote>(`/quotes/${id}`).then((r) => r.data),
  saveQuote: (id: string | null, body: Record<string, unknown>) =>
    (id ? api.put<Quote>(`/quotes/${id}`, body) : api.post<Quote>('/quotes', body)).then((r) => r.data),
  setStep: (id: string, step: number, stepsDone: boolean[]) => api.patch(`/quotes/${id}/flow-step`, { step, stepsDone }),
  share: (id: string, channel: 'whatsapp' | 'email') =>
    api.post<{ token: string; url: string }>(`/quotes/${id}/share`, { channel }).then((r) => r.data),
  availableUnits: (from: string, to: string) =>
    api.get<AvailableUnit[]>('/quotes/available-units', { params: { from, to, all: 'true' } }).then((r) => r.data),
  documents: (customerId: string) => api.get<CustomerDoc[]>('/documents', { params: { customer: customerId } }).then((r) => r.data),
  uploadDocument: (customerId: string, file: { uri: string; name: string; mimeType: string }, type: string) => {
    const form = new FormData()
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob)
    form.append('customer', customerId)
    form.append('type', type)
    form.append('name', file.name)
    return api.post<CustomerDoc>('/documents', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }).then((r) => r.data)
  },
  removeDocument: (id: string) => api.delete(`/documents/${id}`),
  /** The WhatsApp form that collects their ID and details. */
  requestId: (phone: string, name: string) => api.post('/client-info/send', { phone, name }).then((r) => r.data),
  /** Accept the quote, then turn it into a draft contract with its first invoice. */
  createContract: async (quoteId: string, authorizedPersons: AccessPerson[]) => {
    await api.patch(`/quotes/${quoteId}/status`, { status: 'accepted' })
    return api.post<{ contractId: string; contractNo: string }>(`/quotes/${quoteId}/convert-to-contract`, { authorizedPersons }).then((r) => r.data)
  },
  contract: (id: string) => api.get<{ contract: FlowContract }>(`/contracts/${id}`).then((r) => r.data.contract),
  signingLink: (id: string) => api.post<{ signingUrl: string }>(`/contracts/${id}/create-signing-link`).then((r) => r.data.signingUrl),
  cancelContract: (id: string) => api.post(`/contracts/${id}/cancel`),
  accountsUsers: () =>
    api.get<{ _id: string; name: string; role?: string }[]>('/users/assignable').then((r) => r.data.filter((u) => u.role === 'accounts')),
  contractTasks: (contractId: string) =>
    api.get<ContractTask[]>('/tasks', { params: { leadId: contractId, leadType: 'contract' } }).then((r) => r.data ?? []),
  /** The hand-over to accounts at the end of a booking, due today, tied to the contract. */
  addTask: (body: { title: string; assignedTo: string; contractId: string; contractNo: string; notes: string; customerName: string }) =>
    api.post('/tasks', {
      title: body.title,
      assignedTo: body.assignedTo,
      dueDate: isoDay(new Date()),
      leadId: body.contractId,
      leadType: 'contract',
      leadName: body.contractNo,
      description: [body.notes.trim(), body.contractNo ? `Contract: ${body.contractNo}` : '', body.customerName ? `Tenant: ${body.customerName}` : '']
        .filter(Boolean).join('\n'),
      priority: 'medium',
    }),
}

/** YYYY-MM-DD in the phone's own day, which is Dubai for every rep. */
export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function addWeeksISO(iso: string, weeks: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + weeks * 7)).toISOString().slice(0, 10)
}
export function daysBetween(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)
}

/** First four weeks at the discount, the rest at full rate; `rate` is per 4 weeks. */
export function unitPeriodTotal(rate: number, discountPct: number, start: string, end: string) {
  const days = daysBetween(start, end)
  if (days <= 0) return 0
  const totalWeeks = Math.ceil(days / 7)
  const weeklyFull = rate / 4
  const weeklyDisc = weeklyFull - (weeklyFull * discountPct) / 100
  const discWeeks = Math.min(4, totalWeeks)
  const fullWeeks = Math.max(0, totalWeeks - 4)
  return Math.round((discWeeks * weeklyDisc + fullWeeks * weeklyFull) * 100) / 100
}

/** The refundable advance: four weeks, or the whole term if shorter. */
export function unitAdvance(rate: number, start: string, end: string) {
  const days = daysBetween(start, end)
  if (days <= 0) return 0
  return Math.round((rate / 4) * Math.min(4, Math.ceil(days / 7)) * 100) / 100
}

const REFUNDABLE = /\brefundable\b|\bdeposit\b|\bsecurity\s+deposit\b|\badvance\b/i
const NOT_REFUNDABLE = /\bdeposit\s*box\b|\bsafe\s*deposit\b/i
function isRefundableRow(name: string) {
  if (!name.trim() || NOT_REFUNDABLE.test(name)) return false
  return REFUNDABLE.test(name)
}

export function quoteTotals(o: {
  units: UnitRow[]; addOns: AddOnRow[]; adjustment: number; deposit: number
  holdAdvance: boolean; vatEnabled: boolean; cardFeeEnabled: boolean; cardFeePct: number
}) {
  const unitsTotal = o.units.reduce((s, u) => s + unitPeriodTotal(u.rate, u.discountPct, u.startDate, u.endDate), 0)
  const advance = o.units.reduce((s, u) => s + unitAdvance(u.rate, u.startDate, u.endDate), 0)
  const addOnsTotal = o.addOns.reduce((s, a) => s + a.quantity * a.rate, 0)
  const taxableAddOns = o.addOns.filter((a) => !isRefundableRow(a.name)).reduce((s, a) => s + a.quantity * a.rate, 0)
  const base = Math.max(0, Number((unitsTotal + taxableAddOns + o.adjustment).toFixed(2)))
  const vat = o.vatEnabled ? Number((base * 0.05).toFixed(2)) : 0
  const total = unitsTotal + addOnsTotal + o.adjustment + vat + (o.holdAdvance ? advance : 0) + o.deposit
  const cardFee = o.cardFeeEnabled ? Number((total * (o.cardFeePct / 100)).toFixed(2)) : 0
  return { unitsTotal, advance, addOnsTotal, vat, total, cardFee }
}

/** 050… is a UAE mobile; WhatsApp wants 971…. */
export function waPhone(phone: string) {
  const d = phone.replace(/\D/g, '').replace(/^00/, '')
  return /^0\d{9}$/.test(d) ? `971${d.slice(1)}` : d
}
