import { api } from './api'

/**
 * Types and calls mirrored from client/src/lib/api.ts's whatsappApi/leadApi
 * — the same fields, same endpoints, same server. Kept in a dedicated file
 * (the web app keeps them in one big api.ts) because the mobile app splits
 * its API surface by feature as each one gets built.
 */

export type WaMediaKind = 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker'
export type WaMedia = {
  kind: WaMediaKind
  mimeType: string
  filename: string
  caption: string
  /** A file we serve ourselves rather than one to fetch back from Meta. */
  link?: string
}

export type WhatsAppMsg = {
  _id: string
  messageId: string
  phone: string
  phoneNormalized: string
  direction: 'inbound' | 'outbound'
  type: string
  text: string
  status: string
  errorCode?: number | null
  errorTitle?: string
  errorDetail?: string
  occurredAt: string
  sentByAi?: boolean
  editedAt?: string | null
  deletedAt?: string | null
  reaction?: string
  correctedAt?: string | null
  replyToMessageId?: string
  media?: WaMedia
}

export type WhatsAppLeadRef = {
  _id: string
  fullName: string
  status: string
  ownerName?: string
  ownerId?: string | null
  assigned?: boolean
  autoAssigned?: boolean
  assignedByName?: string
  profileName?: string
  followUpAt?: string | null
}

export type WhatsAppLabel = {
  _id: string
  name: string
  color: string
  sortOrder?: number
  chatCount?: number
}

export type OwnerCounts = {
  all: number
  mine: number
  unassigned: number
  tenants: number
  waiting: number
  quiet: number
}

export type WhatsAppConversation = {
  phoneNormalized: string
  phone: string
  count: number
  lastAt: string
  lastMessage: string
  lastMessageMine: boolean
  /** The name to show, already resolved server-side: a person here decided
   *  on it first, then their own WhatsApp profile name, then the number —
   *  never the auto-generated "WhatsApp Contact ####" placeholder a lead
   *  gets at birth. Same field the web console reads. */
  displayName: string
  lastInboundAt?: string | null
  lastOutboundAt?: string | null
  waitingSince?: string | null
  quietSince?: string | null
  lead: WhatsAppLeadRef | null
  customer: { _id: string; fullName: string; stage?: 'prospect' | 'customer' } | null
  labels: WhatsAppLabel[]
  botStatus?: '' | 'bot' | 'escalated' | 'paused'
  botDraft?: string
  botEscalationReason?: string
}

export type OwnerTab = 'all' | 'mine' | 'tenants' | 'unassigned' | 'waiting' | 'quiet'

export const whatsappApi = {
  conversations: (opts: { q?: string; phone?: string; limit?: number; owner?: string } = {}) =>
    api
      .get<
        | WhatsAppConversation[]
        | { list: WhatsAppConversation[]; total: number; matched: number; ownerCounts: OwnerCounts | null; pinned: WhatsAppConversation | null }
      >('/whatsapp/conversations', {
        params: {
          ...(opts.q ? { q: opts.q } : {}),
          ...(opts.phone ? { phone: opts.phone } : {}),
          ...(opts.limit ? { limit: opts.limit } : {}),
          ...(opts.owner && opts.owner !== 'all' ? { owner: opts.owner } : {}),
        },
      })
      .then((r) => {
        if (Array.isArray(r.data)) {
          return { list: r.data, total: r.data.length, matched: r.data.length, ownerCounts: null, pinned: null }
        }
        return {
          list: r.data.list,
          total: r.data.total,
          matched: r.data.matched,
          ownerCounts: r.data.ownerCounts ?? null,
          pinned: r.data.pinned ?? null,
        }
      }),
  /** Server default for a single thread is up to 2000 messages — fine for
   *  the web console's one-time load, but this app refetches on every poll,
   *  so a busy thread's whole history was going over the wire every 3s just
   *  to open a chat. `limit` lets the screen ask for a small recent window
   *  first and grow it only if the rep actually scrolls up for history. */
  messages: (phone?: string, limit?: number) =>
    api.get<WhatsAppMsg[]>('/whatsapp/messages', { params: { ...(phone ? { phone } : {}), ...(limit ? { limit } : {}) } }).then((r) => r.data),
  send: (to: string, body: string) => api.post<{ ok: boolean }>('/whatsapp/send', { to, body }).then((r) => r.data),
  /** `uri` is a local file:// picked from the camera roll or camera. */
  sendMedia: (
    to: string,
    file: { uri: string; name: string; mimeType: string },
    caption: string,
    onUploadProgress?: (pct: number) => void,
  ) => {
    const form = new FormData()
    form.append('to', to)
    // React Native's FormData accepts this shape for a file part; axios
    // ships it as multipart/form-data the same way a web <input> would.
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob)
    if (caption) form.append('caption', caption)
    return api
      .post('/whatsapp/send-media', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (!e.total || !onUploadProgress) return
          onUploadProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
        },
      })
      .then((r) => r.data)
  },
  /** `templateId` is a MessageTemplate _id — the server resolves its body
   *  (or its location/media, for a location or video quick reply) and sends
   *  it, exactly like the web console's send-quick-reply button. */
  sendQuickReply: (to: string, templateId: string) =>
    api.post('/whatsapp/send-quick-reply', { to, templateId }).then((r) => r.data),
}

/** Settings → Message Templates, reused as the quick-reply library — same
 *  shape the web console reads (client/src/pages/WhatsApp.tsx). */
export type MessageTemplate = {
  _id: string
  key: string
  label: string
  whatsappBody: string
  category?: string
  sortOrder?: number
  mediaKind?: '' | 'image' | 'video' | 'audio' | 'document' | 'location'
}

export const messageTemplateApi = {
  quickReplies: () =>
    api.get<MessageTemplate[]>('/message-templates', { params: { kind: 'quick_reply' } }).then((r) => r.data ?? []),
}

export type LeadScoreBand = 'high' | 'medium' | 'low'
export interface LeadScoreSignals {
  leadType?: string
  temperature?: string | null
  specific?: boolean
  turnCount?: number
  medianReplyMinutes?: number | null
  override?: string
  intendedStartDate?: string | null
  daysUntilNeeded?: number | null
}
export interface LeadScore {
  score: number | null
  band: LeadScoreBand | null
  reason: string
  signals: LeadScoreSignals
  needsConfirmation: boolean
  staleOverride?: boolean
  override: '' | 'qualifying' | 'not_interested'
  overrideByName: string
  overrideAt: string | null
  aiSummary: {
    headline?: string
    nextAction?: string
    temperature?: string
    leadType?: string
    reason?: string
  } | null
}

export const leadScoreApi = {
  score: (id: string) => api.get<LeadScore>(`/leads/${id}/score`).then((r) => r.data),
  confirm: (id: string, decision: 'qualifying' | 'not_interested' | '') =>
    api.post<LeadScore>(`/leads/${id}/score-confirm`, { decision }).then((r) => r.data),
  setIntendedDate: (id: string, date: string) =>
    api.post<LeadScore>(`/leads/${id}/intended-date`, { intendedStartDate: date || null }).then((r) => r.data),
}
