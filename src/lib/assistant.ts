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
}

export type AssistantCapabilities = { enabled: boolean; allowed: boolean; tools: string[] }

export const assistantApi = {
  capabilities: () => api.get<AssistantCapabilities>('/assistant/capabilities').then((r) => r.data),
  ask: (question: string, history: AssistantMessage[]) =>
    api.post<AssistantAskResponse>('/assistant/ask', { question, history: history.slice(-8) }).then((r) => r.data),
  confirm: (id: string) =>
    api.post<{ ok: boolean; message: string; pdfPath?: string }>('/assistant/confirm', { id }).then((r) => r.data),
  cancel: (id: string) => api.post<{ ok: true; message: string }>('/assistant/cancel', { id }).then((r) => r.data),
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
