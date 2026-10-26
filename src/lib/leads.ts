import { api } from './api'

/**
 * Types and calls mirrored from client/src/lib/api.ts's Lead/LeadQuery/
 * LeadPage/leadApi and server/src/routes/leads.js — same fields, same
 * endpoints, same server-side role scoping (a sales_rep/accounts user is
 * force-filtered to their own leads there; nothing extra to do here).
 */

export type LeadStatus =
  | 'new' | 'contact_attempted' | 'contacted' | 'site_visit_scheduled'
  | 'follow_up_scheduled' | 'quotation_sent' | 'won' | 'lost' | 'already_customer'
export type LeadSource = 'manual' | 'whatsapp' | 'referral' | 'walk_in' | 'other'
export type AttemptOutcome = 'no_answer' | 'no_reply' | 'reached' | 'call_back' | 'not_interested' | 'wrong_number'
export type AttemptChannel = 'call' | 'whatsapp' | 'voice_note' | 'email' | 'sms' | 'walk_in' | 'other'

export type LeadAttempt = {
  no: number
  at: string
  channel: AttemptChannel
  outcome: AttemptOutcome
  note?: string
  user?: { name: string } | null
}

export type LeadComment = {
  _id: string
  user: { _id: string; name: string; email: string } | null
  userName: string
  text: string
  createdAt: string
}

export type LeadTimelineEntry = {
  _id?: string
  at: string
  type: string
  text: string
  user?: { name: string } | null
}

export interface Lead {
  _id: string
  firstName?: string
  lastName?: string
  fullName: string
  /** The name they set on their own WhatsApp profile — real leads.js selects
   *  it, but a caller with its own narrower .select() (leadApi.followUps())
   *  must list it explicitly or this comes back undefined. */
  whatsappProfileName?: string
  email?: string
  phone: string
  whatsappNo?: string
  phoneNormalized: string
  preferredContact?: 'email' | 'whatsapp'
  status: LeadStatus
  source: LeadSource
  leadDateTime: string
  storageSizeValue: number
  storageSizeUnit: 'sqft'
  durationValue: number
  durationUnit: 'week' | 'month'
  owner: { _id: string; name: string; email: string } | null
  unitsNeeded: number
  notes?: string
  labels?: string[]
  temperature?: '' | 'hot' | 'warm' | 'cold'
  tags?: string[]
  followUpAt?: string | null
  followUpKind?: 'date' | 'week' | 'month'
  siteVisitAt?: string | null
  ownerSeenAt?: string | null
  attempts?: LeadAttempt[]
  sequenceExhaustedAt?: string | null
  comments?: LeadComment[]
  timeline?: LeadTimelineEntry[]
  createdAt?: string
}

export type LeadQuery = {
  search?: string
  status?: string
  source?: string
  owner?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}
export type LeadPage = { data: Lead[]; total: number; page: number; pages: number; limit: number }

export type LeadStats = {
  total: number
  byStatus: Record<string, number>
  unassigned: number
  byOwner: { _id: string; name: string; count: number }[]
}

export type FollowUpLeadRow = {
  _id: string
  fullName: string
  whatsappProfileName?: string
  phone: string
  status: LeadStatus
  followUpAt: string | null
  owner?: { _id: string; name: string } | null
}
export type QuotePreview = { ok: true; proposalId: string; summary: string[]; total: number; unit: string }
export type FollowUps = { overdue: FollowUpLeadRow[]; today: FollowUpLeadRow[]; upcoming: FollowUpLeadRow[]; days: number }

export const leadApi = {
  list: (params: LeadQuery) => api.get<LeadPage>('/leads', { params }).then((r) => r.data),
  stats: () => api.get<LeadStats>('/leads/stats').then((r) => r.data),
  /** Own leads only, per the server's own role scoping — what the
   *  notification bell counts against. */
  followUps: () => api.get<FollowUps>('/leads/follow-ups').then((r) => r.data),
  get: (id: string) => api.get<Lead>(`/leads/${id}`).then((r) => r.data),
  updateStatus: (id: string, status: LeadStatus, comment?: string) =>
    api.patch<Lead>(`/leads/${id}/status`, { status, comment }).then((r) => r.data),
  /** Closing as lost needs one of LOST_REASONS (src/lib/leadStatus.ts) — the server refuses it otherwise. */
  markLost: (id: string, lostReason: string) =>
    api.patch<Lead>(`/leads/${id}/status`, { status: 'lost', lostReason }).then((r) => r.data),
  /** Claude's read of why this lead is being lost, from the chat — a suggestion only. */
  suggestLostReason: (id: string) =>
    api.post<{ ok: true; reason: string | null; why: string }>(`/leads/${id}/suggest-lost-reason`, {}, { timeout: 40000 }).then((r) => r.data),
  addComment: (id: string, text: string) => api.post<Lead>(`/leads/${id}/comments`, { text }).then((r) => r.data),
  /** `PUT /leads/:id` merges the sent fields onto the stored lead server-side
   *  (`cleanBody({...lead.toObject(), ...req.body})`), so a follow-up-only
   *  patch like this never needs to resend the rest of the record. */
  scheduleFollowUp: (id: string, followUpAt: string | null) =>
    api.put<Lead>(`/leads/${id}`, { followUpAt }).then((r) => r.data),
  scheduleSiteVisit: (id: string, siteVisitAt: string | null) =>
    api.put<Lead>(`/leads/${id}`, { siteVisitAt }).then((r) => r.data),
  /** Admin only — PUT /leads/:id treats a sales rep's own owner field as
   *  always themselves (server/src/routes/leads.js), so this only ever
   *  actually reassigns when the caller isn't one. `ownerId: null` hands
   *  the lead back to Unassigned. */
  reassign: (id: string, ownerId: string | null) =>
    api.put<Lead>(`/leads/${id}`, { owner: ownerId }).then((r) => r.data),
  /** How much storage they need, and for how long — set right from the
   *  WhatsApp chat while it's actually being discussed, instead of only
   *  from the lead's own detail screen. */
  updateUnitSize: (id: string, body: { storageSizeValue: number; durationValue: number; durationUnit: 'week' | 'month' }) =>
    api.put<Lead>(`/leads/${id}`, body).then((r) => r.data),
  addAttempt: (id: string, body: { outcome: AttemptOutcome; channel?: AttemptChannel; note?: string }) =>
    api
      .post<{ attempt: LeadAttempt; exhausted: boolean; suggestStatus: LeadStatus | null; sequence: number; followUpAt: string | null }>(
        `/leads/${id}/attempts`, body,
      )
      .then((r) => r.data),
  /** The next WhatsApp message to send this lead, written by Claude from the
   *  conversation and notes. Nothing is sent or saved by asking. */
  suggestMessage: (id: string) =>
    api.post<{ ok: true; message: string }>(`/leads/${id}/suggest-message`, {}, { timeout: 70000 }).then((r) => r.data.message),
  /** Price the cheapest free unit of that size for those dates. Creates
   *  nothing — it returns a proposal that quoteConfirm acts on. */
  quotePreview: (id: string, body: { sizeSqf: number; startDate: string; endDate: string }) =>
    api.post<QuotePreview>(`/leads/${id}/quote/preview`, body).then((r) => r.data),
  /** Create the quote (holding the unit) and send the PDF to the customer. */
  quoteConfirm: (id: string, proposalId: string) =>
    api.post<{ ok: true; quoteNo: string; message: string; sent: boolean }>(`/leads/${id}/quote/confirm`, { proposalId }, { timeout: 60000 })
      .then((r) => r.data),
  convertToCustomer: (id: string) =>
    api.post<{ ok: true; created: boolean; customer: { _id: string; fullName: string }; stage: 'prospect' | 'customer' }>(
      `/leads/${id}/convert`,
    ).then((r) => r.data),
  /** Admin only — the server refuses this for a sales rep. Deletes the lead
   *  itself; the WhatsApp conversation is untouched (its messages just stop
   *  pointing at a lead), same as the web console. */
  remove: (id: string) => api.delete<{ ok: true }>(`/leads/${id}`).then((r) => r.data),
}

/** What reaching out to a lead resolves, wherever the message went from: a
 *  follow-up due today or earlier is done, and a "New" lead has now been
 *  contacted. A follow-up set for a later day is a deliberate future
 *  reminder and is left alone. Sequential, since PUT /leads/:id rewrites the
 *  whole stored lead and would race the status change. */
export async function markContacted(lead: { id: string; status: LeadStatus; followUpAt?: string | null }) {
  const startOfTomorrow = new Date()
  startOfTomorrow.setHours(24, 0, 0, 0)
  if (lead.followUpAt && new Date(lead.followUpAt).getTime() < startOfTomorrow.getTime()) {
    await leadApi.scheduleFollowUp(lead.id, null)
  }
  if (lead.status === 'new') await leadApi.updateStatus(lead.id, 'contact_attempted')
}
