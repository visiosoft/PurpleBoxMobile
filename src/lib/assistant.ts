import { api } from './api'

/**
 * Mirrors server/src/routes/assistant.js and the request/response shapes
 * client/src/components/AssistantWidget.tsx builds around. Stateless on the
 * server — there's no conversation id, the client resends recent turns as
 * `history` on every call — and the reply is a single JSON object, not a
 * stream, so a plain axios POST is all this needs.
 */

export type AssistantRole = 'user' | 'assistant'
export type AssistantMessage = { role: AssistantRole; content: string }

export type AssistantTool = { name: string; args: Record<string, unknown>; ok: boolean }
export type AssistantLink = { label: string; path: string }
export type AssistantPending = { id: string; kind: string; summary: string[]; expiresAt: string }

export type AssistantAskResponse = {
  answer: string
  tools: AssistantTool[]
  model: string
  rounds: number
  grounded: boolean
  pending?: AssistantPending | null
  links?: AssistantLink[]
  card?: AssistantCard | null
}

export type AssistantCapabilities = { enabled: boolean; allowed: boolean; tools: string[] }

/** The Overview screen's "AI insight" card — see
 *  server/src/services/assistant/adminInsight.js. `facts` are the real
 *  numbers the headline/message are grounded in, for anyone who wants to
 *  double-check rather than just trust the sentence. */
export type AdminInsight = {
  headline: string
  message: string
  ctaLabel: string | null
  ctaQuery: string | null
  facts: Record<string, unknown>
}

/** Structured data for the couple of answers worth a real layout instead of
 *  a sentence — built server-side from the actual tool result (see
 *  services/assistant/index.js's CARD_TOOLS), never invented by the model. */
export type InventoryCardData = {
  count: number
  period: string | { from: string; to: string }
  bySize: Record<string, number>
  units: { unitNumber: string; floor: string; sizeSqf: number; monthlyPrice: number; status: string }[]
  truncated?: boolean
}
export type ContactsCardData = {
  matches: number
  people: {
    kind: 'customer' | 'lead'
    name: string
    phone?: string
    email?: string
    status?: string
    owner?: string | null
    since?: string | null
    storageSizeSqf?: number | null
    contracts?: { contractNo: string; status: string; unit?: string; sizeSqf?: number; start?: string; end?: string; monthly?: number }[]
  }[]
}
export type PriceCardData = {
  unit: { unitNumber: string; floor: string; sizeSqf: number; monthlyPrice: number }
  period: { startDate: string; endDate: string; weeks: number }
  weeklyRate: number
  discountPct: number
  lines: { title: string; qty?: number; rate?: number; amount: number; taxable?: boolean }[]
  total: number
  vatAmount: number
  note?: string
}
export type AssistantCard =
  | { type: 'inventory'; data: InventoryCardData }
  | { type: 'contacts'; data: ContactsCardData }
  | { type: 'price'; data: PriceCardData }

export const assistantApi = {
  capabilities: () => api.get<AssistantCapabilities>('/assistant/capabilities').then((r) => r.data),
  ask: (question: string, history: AssistantMessage[]) =>
    api.post<AssistantAskResponse>('/assistant/ask', { question, history: history.slice(-8) }).then((r) => r.data),
  confirm: (id: string) =>
    api.post<{ ok: boolean; message: string; pdfPath?: string }>('/assistant/confirm', { id }).then((r) => r.data),
  cancel: (id: string) => api.post<{ ok: true; message: string }>('/assistant/cancel', { id }).then((r) => r.data),
  adminInsight: () => api.get<AdminInsight>('/assistant/admin-insight').then((r) => r.data),
  /** `uri` is a local recording (e.g. from expo-audio) — sent the same
   *  multipart way whatsapp.ts's sendMedia sends a voice note, just to a
   *  different endpoint. Comes back as plain text; the caller runs it
   *  through `ask` itself, exactly as if it had been typed. */
  transcribe: (uri: string) => {
    const form = new FormData()
    form.append('audio', { uri, name: 'command.m4a', type: 'audio/m4a' } as unknown as Blob)
    return api
      .post<{ text: string }>('/assistant/transcribe', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data.text)
  },
}

export const EXAMPLE_PROMPTS = [
  'How many 10 sq ft units are free?',
  'Which contracts end this month?',
  "Who's still waiting for a WhatsApp reply?",
  'Quote Ahmed Ali, 050 123 4567, a 50 sq ft unit from the 15th for 3 months, and send it on WhatsApp',
]

/** Tool names come back as raw identifiers (e.g. "search_units") — humanize
 *  rather than hardcoding a label per tool, since the server's tool set can
 *  grow independently of this app. */
export function toolLabel(name: string): string {
  return name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** Turns a link the assistant sent back (`{ label, path }`) into an in-app
 *  route, for the couple of destinations this app actually has a screen
 *  for. Shared by AssistantResultCard and the Assistant tab so the two
 *  chat surfaces don't drift — anything not matched here falls back to
 *  the caller's "open this on the web" notice. */
export function assistantLinkRoute(
  link: AssistantLink,
): { pathname: string; params?: Record<string, string> } | null {
  const leadMatch = link.path.match(/^\/leads\/([a-f0-9]{24})/i)
  if (leadMatch) return { pathname: `/leads/${leadMatch[1]}` }

  const chatMatch = link.path.match(/^\/whatsapp\/([^/?]+)/i)
  if (chatMatch) {
    const name = link.label.replace(/^chat with\s*/i, '').trim()
    return { pathname: '/whatsapp/[phone]', params: { phone: decodeURIComponent(chatMatch[1]), name } }
  }

  if (/^\/whatsapp\/?$/i.test(link.path)) return { pathname: '/whatsapp' }

  return null
}
