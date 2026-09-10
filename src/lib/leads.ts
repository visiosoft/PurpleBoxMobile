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
  addComment: (id: string, text: string) => api.post<Lead>(`/leads/${id}/comments`, { text }).then((r) => r.data),
  /** `PUT /leads/:id` merges the sent fields onto the stored lead server-side
   *  (`cleanBody({...lead.toObject(), ...req.body})`), so a follow-up-only
   *  patch like this never needs to resend the rest of the record. */
  scheduleFollowUp: (id: string, followUpAt: string | null) =>
    api.put<Lead>(`/leads/${id}`, { followUpAt }).then((r) => r.data),
  scheduleSiteVisit: (id: string, siteVisitAt: string | null) =>
    api.put<Lead>(`/leads/${id}`, { siteVisitAt }).then((r) => r.data),
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
  convertToCustomer: (id: string) =>
    api.post<{ ok: true; created: boolean; customer: { _id: string; fullName: string }; stage: 'prospect' | 'customer' }>(
      `/leads/${id}/convert`,
    ).then((r) => r.data),
}
