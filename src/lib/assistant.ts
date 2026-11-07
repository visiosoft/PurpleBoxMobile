import { api } from './api'

/**
 * The Ask box's side of server/src/routes/assistant.js — the same endpoints
 * the web app's DashboardAsk uses. Chats are kept on the server, per person:
 * every ask sends `chat: true` and the chat's id, never client-side history,
 * so a conversation started here can be picked up on the web and back.
 */

export const WEB_APP_URL = 'https://office.purplebox.ae'

export type AssistantTool = { name: string; args?: Record<string, unknown>; ok: boolean }
export type AssistantLink = { label: string; path: string }
export type AssistantPending = { id: string; kind: string; summary: string[]; expiresAt: string }
export type AssistantFile = { label: string; path: string; format: 'pdf' | 'excel' }
export type AssistantSource = { label: string; url: string }
export type ChartSpec = { type: 'bar' | 'line' | 'pie'; title: string; labels: string[]; series: { name: string; values: number[] }[] }
export type AskField = {
  key: string
  label: string
  type: 'text' | 'phone' | 'email' | 'number' | 'date' | 'select' | 'textarea' | 'eid'
  options?: string[]
  value?: string
  required?: boolean
}
export type AskFormSpec = { intro?: string; title?: string; fields: AskField[]; submitLabel?: string }
export type DevRequest = { id: string; title: string; prompt: string; count: number }
/** People to email or WhatsApp as a group, picked by the server. */
export type Compose =
  | { kind: 'email_customers'; label: string; customerIds?: string[]; template?: string }
  | { kind: 'whatsapp_contracts'; label: string; template?: string; contracts?: unknown[] }

/** Which screen (and lead) the question was asked from, so "send her the
 *  quote" needs no name. The server only treats it as a pointer — its tools
 *  still look the lead up. */
export type AssistantContext = { screen?: string; leadId?: string; phone?: string; name?: string }

export type AssistantCapabilities = { enabled: boolean; allowed: boolean; tools: string[]; web?: boolean; voice?: boolean }

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

/** What /ask returns (and what a kept chat stores per assistant message). */
export type AssistantAskResponse = {
  chatId?: string
  answer?: string
  content?: string
  tools?: AssistantTool[]
  grounded?: boolean
  links?: AssistantLink[]
  files?: AssistantFile[]
  options?: string[]
  form?: AskFormSpec | null
  charts?: ChartSpec[]
  pending?: AssistantPending | null
  pendings?: AssistantPending[]
  next?: string
  devRequest?: DevRequest | null
  compose?: Compose | null
  sources?: AssistantSource[]
  setup?: string | null
  pdfPath?: string
  quoteId?: string
  contractId?: string
  card?: AssistantCard | null
}

/** One answer, with every absent part as empty — what the chat renders. */
export type Answer = {
  content: string
  tools: AssistantTool[]
  grounded: boolean
  pendings: AssistantPending[]
  next: string
  links: AssistantLink[]
  files: AssistantFile[]
  options: string[]
  form: AskFormSpec | null
  sources: AssistantSource[]
  setup: string | null
  charts: ChartSpec[]
  devRequest: DevRequest | null
  compose: Compose | null
  pdfPath?: string
  quoteId?: string
  contractId?: string
  card?: AssistantCard | null
}

export function toAnswer(d: AssistantAskResponse | null | undefined): Answer {
  const r = d || {}
  return {
    content: r.content ?? r.answer ?? '',
    tools: r.tools || [],
    grounded: r.grounded !== false,
    pendings: r.pendings?.length ? r.pendings : r.pending ? [r.pending] : [],
    next: r.next || '',
    links: r.links || [],
    files: r.files || [],
    options: r.options || [],
    form: r.form || null,
    sources: r.sources || [],
    setup: r.setup || null,
    charts: r.charts || [],
    devRequest: r.devRequest || null,
    compose: r.compose || null,
    pdfPath: r.pdfPath,
    quoteId: r.quoteId,
    contractId: r.contractId,
    card: r.card || null,
  }
}

export type ConfirmResult = { ok: boolean; message: string; pdfPath?: string; quoteId?: string; contractId?: string; links?: AssistantLink[] }
export type ChatRow = { id: string; title: string; updatedAt: string }
export type ChatMessage = { role: 'user' | 'assistant'; content: string; answer: AssistantAskResponse | null; at?: string }

export type NudgeItem = {
  name?: string; customer?: string; lead?: string; title?: string; phone?: string; quoteNo?: string; contractNo?: string
  reason?: string; lastWord?: string; waiting?: string; lastMessage?: string; due?: string; ends?: string
  send?: { kind: string; ref: string }; open?: string; notice?: { suggested: string; templateId: string }
}
export type Nudge = {
  key: string; tone: 'high' | 'medium' | 'low'; count: number; title: string; detail: string; prompt: string
  taskId?: string; from?: string; assignedTo?: string; items?: NudgeItem[]
}
export type ClientSendResult = { sent: boolean; reason?: string; waLink?: string; form?: boolean }
export type Scheduled = { id: string; runAt: string; status: string; summary: string[]; result?: string }
export type Lesson = { id: string; text: string; scope: 'company' | 'personal'; by: string; at: string; mine: boolean }
export type Skill = { id: string; name: string; description: string; enabled: boolean; files: number; by?: string }
export type DevRequestRow = {
  id: string; title: string; asked: string; count: number; status: 'open' | 'in_progress' | 'done' | 'wont_do'; prompt: string; lastAskedBy: string; at: string
}
export type PreviewMessage = { name: string; to?: string; subject?: string; text: string }

/** The Overview screen's "AI insight" card — see
 *  server/src/services/assistant/adminInsight.js. */
export type AdminInsight = {
  headline: string
  message: string
  ctaLabel: string | null
  ctaQuery: string | null
  facts: Record<string, unknown>
}

const A = '/assistant'

export const assistantApi = {
  capabilities: () => api.get<AssistantCapabilities>(`${A}/capabilities`).then((r) => r.data),
  // A booking end to end is several lookups in one answer, so this waits far
  // longer than a normal request before giving up.
  ask: (body: { question: string; chatId?: string; web?: boolean; spoken?: boolean; eid?: string; context?: AssistantContext }) =>
    api.post<AssistantAskResponse>(`${A}/ask`, {
      question: body.question,
      chatId: body.chatId || undefined,
      chat: true,
      ...(body.web ? { web: true } : {}),
      ...(body.spoken ? { spoken: true } : {}),
      ...(body.eid ? { eid: body.eid } : {}),
      ...(body.context ? { context: body.context } : {}),
    }, { timeout: 150_000 }).then((r) => r.data),
  confirm: (id: string, chatId?: string) =>
    api.post<ConfirmResult>(`${A}/confirm`, { id, chatId: chatId || undefined }, { timeout: 90_000 }).then((r) => r.data),
  cancel: (id: string, chatId?: string) =>
    api.post<{ ok: boolean; message: string }>(`${A}/cancel`, { id, chatId: chatId || undefined }).then((r) => r.data),
  previewMessages: (id: string) =>
    api.get<{ messages: PreviewMessage[] }>(`${A}/proposals/${id}/preview`).then((r) => r.data.messages),

  chats: () => api.get<{ chats: ChatRow[] }>(`${A}/chats`).then((r) => r.data.chats),
  chat: (id: string) => api.get<{ id: string; title: string; messages: ChatMessage[] }>(`${A}/chats/${id}`).then((r) => r.data),
  deleteChat: (id: string) => api.delete(`${A}/chats/${id}`).then(() => true),

  nudges: () => api.get<{ nudges: Nudge[] }>(`${A}/nudges`).then((r) => r.data.nudges),
  assignNudge: (key: string, assignedTo: string, note: string) =>
    api.post<{ to: string; notified: { browser: number; phone: number } }>(`${A}/nudges/assign`, { key, assignedTo, note }).then((r) => r.data),
  draft: (send: { kind: string; ref: string }) =>
    api.get<{ text: string; link?: string; name?: string; hasEmail?: boolean; hasPhone?: boolean }>(`${A}/client-send/draft`, { params: send }).then((r) => r.data),
  clientSend: (body: { kind: string; ref: string; via: 'whatsapp' | 'email'; text?: string; templateId?: string }) =>
    api.post<ClientSendResult>(`${A}/client-send`, body, { timeout: 60_000 }).then((r) => r.data),
  noticeTemplates: () => api.get<{ templates: { id: string; name: string }[] }>(`${A}/notice-templates`).then((r) => r.data.templates),
  scheduleNotice: (body: { contractId: string; templateId: string; kind: string; via: 'whatsapp' | 'email'; runAt: string }) =>
    api.post(`${A}/notices/schedule`, body).then((r) => r.data),

  scheduled: () => api.get<{ scheduled: Scheduled[] }>(`${A}/scheduled`).then((r) => r.data.scheduled),
  cancelScheduled: (id: string) => api.post(`${A}/scheduled/${id}/cancel`).then(() => true),

  memories: () => api.get<{ canTeachCompany: boolean; memories: Lesson[] }>(`${A}/memories`).then((r) => r.data),
  addMemory: (text: string, scope: 'personal' | 'company') => api.post(`${A}/memories`, { text, scope }).then((r) => r.data),
  deleteMemory: (id: string) => api.delete(`${A}/memories/${id}`).then(() => true),

  skills: () => api.get<{ skills: Skill[] }>(`${A}/skills`).then((r) => r.data.skills),
  importSkill: (file: { uri: string; name: string; mimeType?: string }) => {
    const form = new FormData()
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as unknown as Blob)
    return api.post(`${A}/skills`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 }).then((r) => r.data)
  },
  setSkill: (id: string, enabled: boolean) => api.patch(`${A}/skills/${id}`, { enabled }).then(() => true),
  deleteSkill: (id: string) => api.delete(`${A}/skills/${id}`).then(() => true),

  devRequests: () => api.get<{ requests: DevRequestRow[] }>(`${A}/dev-requests`).then((r) => r.data.requests),
  setDevRequest: (id: string, status: DevRequestRow['status'], note = '') =>
    api.patch(`${A}/dev-requests/${id}`, { status, note }).then(() => true),

  adminInsight: () => api.get<AdminInsight>(`${A}/admin-insight`).then((r) => r.data),
  /** `uri` is a local recording (expo-audio). Comes back as plain text; the
   *  caller puts it in the box or asks it, exactly as if it had been typed. */
  transcribe: (uri: string) => {
    const form = new FormData()
    form.append('audio', { uri, name: 'voice.m4a', type: 'audio/m4a' } as unknown as Blob)
    return api
      .post<{ text: string }>(`${A}/transcribe`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 })
      .then((r) => String(r.data.text || '').trim())
  },
}

/* What a tool is, in words a person recognises — never the tool's name.
   Same list as the web's DashboardAsk. */
const TOOL_LABEL: Record<string, string> = {
  open_booking_form: 'opened the booking form',
  nudges: 'checked what needs you today',
  schedule_card: 'scheduled it',
  general_knowledge: 'answered from general knowledge',
  calculate: 'did the sums',
  use_skill: 'used a skill',
  notices_due: 'checked the notices due',
  page_access: 'checked page access',
  propose_page_access: 'prepared the access change',
  request_developer: 'noted it for the developer',
  serve_notices: 'prepared the notices',
  propose_payment_schedule: 'prepared the payment plan',
  send_to_clients: 'prepared the messages',
  lead_file: 'read the lead file',
  whatsapp_messages: 'read the WhatsApp chat',
  propose_quotation: 'prepared the quotation',
  propose_contract: 'prepared the contract',
  propose_email: 'drafted the email',
  propose_invoice: 'prepared the invoice',
  propose_zoho_invoice: 'prepared the Zoho invoice',
  create_task: 'added the task',
  update_task: 'updated the task',
  propose_end_contract: 'prepared ending the contract',
  propose_signing_link: 'prepared the signing link',
  collections_overview: 'read Collections from Zoho',
  propose_collection_reminder: 'prepared the reminders',
  propose_collection_update: 'prepared the Collections update',
  propose_zoho_payment: 'prepared the payment in Zoho',
  propose_collection_pay_link: 'prepared the card payment link',
  propose_quote_pay_link: 'prepared the quotation payment link',
  propose_quote_status: 'prepared the quotation status change',
  propose_update_customer: 'prepared the customer update',
  update_lead: 'updated the lead',
  hand_over_lead: 'handed over the lead',
  propose_update_contract: 'prepared the contract change',
  pending_approvals: 'read the approval queue',
  propose_approval: 'prepared the approval',
  unverified_first_payments: 'read first payments to check',
  maintenance_tickets: 'read maintenance tickets',
  propose_maintenance_ticket: 'prepared the maintenance ticket',
  propose_maintenance_update: 'prepared the ticket update',
  client_requests: 'read the client requests',
  propose_client_request: 'prepared the client request action',
  remember: 'remembered it',
  forget: 'forgot it',
  create_lead: 'added the lead',
  schedule_follow_up: 'set the follow-up',
  units_available: 'checked unit availability',
  price_booking: 'priced it with the quote maths',
  find_customer: 'looked up the customer',
  find_contract: 'looked up the contract',
  documents_for: 'checked documents on file',
  tasks_due: 'read the task board',
  whatsapp_activity: 'read WhatsApp activity',
  leads_recent: 'counted leads',
  contracts_expiring: 'checked which contracts are expiring',
  compose_email: 'worked out who to email',
  compose_whatsapp: 'worked out who to WhatsApp',
  export_file: 'made the file',
  ask_details: 'asked for the details',
  web_search: 'searched the web',
  past_checkout: 'checked who is past check-out',
  conversion_review: 'reviewed why leads convert or not',
  rep_scorecard: 'scored each sales rep',
  meta_ads_review: 'reviewed the Meta ads',
  email_inbox: 'read the inbox',
  read_email: 'read an email',
  propose_sms: 'prepared a text',
  make_chart: 'drew a chart',
  make_file: 'made the file',
  create_bot: 'set up a bot',
  pricing_review: 'reviewed prices against demand',
  propose_price_change: 'prepared a price change',
  stripe_payments: 'read Stripe payments',
  website_traffic: 'read website traffic',
  drive_files: 'searched Google Drive',
  propose_whatsapp_message: 'prepared a WhatsApp',
  leads_list: 'listed the leads',
  sales_summary: 'read sales from Zoho',
  receivables: 'read receivables from Zoho',
  calls_summary: 'counted the calls',
  follow_ups_due: 'checked follow-ups due',
  door_activity: 'read the door log',
  roster_now: 'checked the roster',
}

/** A tool's name as words a person recognises. */
export function toolLabel(name: string): string {
  return TOOL_LABEL[name] || `read the ${name.replace(/^report_/, '').replace(/_/g, ' ')} report`
}

/**
 * Turns a link the assistant sent back (`{ label, path }`, a web route) into
 * an in-app route for the destinations this app has a screen for. Anything
 * else returns null and opens on the web app instead (see `webUrlFor`).
 */
export function assistantLinkRoute(
  link: AssistantLink,
): { pathname: string; params?: Record<string, string> } | null {
  const leadMatch = link.path.match(/^\/leads\/([a-f0-9]{24})/i)
  if (leadMatch) return { pathname: `/leads/${leadMatch[1]}` }

  const customerMatch = link.path.match(/^\/customers\/([a-f0-9]{24})\/?$/i)
  if (customerMatch) return { pathname: '/person', params: { customerId: customerMatch[1] } }

  const chatMatch = link.path.match(/^\/whatsapp\/([^/?]+)/i)
  if (chatMatch) {
    const name = link.label.replace(/^chat with\s*/i, '').trim()
    return { pathname: '/whatsapp/[phone]', params: { phone: decodeURIComponent(chatMatch[1]), name } }
  }

  // The older tools link a chat as /whatsapp?phone=971…
  const chatQuery = link.path.match(/^\/whatsapp\/?\?phone=([^&]+)/i)
  if (chatQuery) {
    const name = link.label.replace(/^chat with\s*/i, '').trim()
    return { pathname: '/whatsapp/[phone]', params: { phone: decodeURIComponent(chatQuery[1]), name } }
  }

  if (/^\/whatsapp\/?$/i.test(link.path)) return { pathname: '/whatsapp' }
  if (/^\/leads\/?$/i.test(link.path)) return { pathname: '/leads' }
  if (/^\/units\/?$/i.test(link.path)) return { pathname: '/units' }
  if (/^\/customers\/?$/i.test(link.path)) return { pathname: '/customers' }

  return null
}

/** A link with no screen in this app, as a page on the web app. */
export function webUrlFor(path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${WEB_APP_URL}${path.startsWith('/') ? '' : '/'}${path}`
}
