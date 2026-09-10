import { COLORS } from './theme'
import type { LeadStatus } from './leads'

/** Same pipeline, same order, same wording as the web app's LEAD_STATUS_FLOW
 *  (client/src/components/ui.tsx) — a rep moving between web and mobile
 *  should never see a different name for the same stage. */
export const LEAD_STATUS_FLOW: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New Lead' },
  { value: 'contact_attempted', label: 'Contact Attempted' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'site_visit_scheduled', label: 'Site Visit Scheduled' },
  { value: 'follow_up_scheduled', label: 'Follow-Up Scheduled' },
  { value: 'quotation_sent', label: 'Quotation Sent' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

const TONE: Record<string, { bg: string; fg: string }> = {
  blue: { bg: '#DBEAFE', fg: '#1D4ED8' },
  amber: { bg: COLORS.warnBg, fg: COLORS.warn },
  purple: { bg: COLORS.brandTint, fg: COLORS.brandDark },
  gray: { bg: '#F3F4F6', fg: '#6B7280' },
  green: { bg: COLORS.goodBg, fg: COLORS.good },
  red: { bg: COLORS.badBg, fg: COLORS.bad },
}

const STATUS_TONE: Record<string, keyof typeof TONE> = {
  new: 'blue',
  contact_attempted: 'amber',
  contacted: 'purple',
  site_visit_scheduled: 'blue',
  follow_up_scheduled: 'amber',
  quotation_sent: 'gray',
  won: 'green',
  lost: 'red',
  already_customer: 'gray',
}

export function statusLabel(s: string): string {
  const found = LEAD_STATUS_FLOW.find((x) => x.value === s)
  if (found) return found.label
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function statusTone(s: string): { bg: string; fg: string } {
  return TONE[STATUS_TONE[s] ?? 'gray']
}

/** Design-handoff status badge look (pastel bg / dark text / saturated
 *  dot) re-keyed onto the real 9 backend statuses — the handoff's own
 *  7-stage demo pipeline ('interested', 'negotiating', ...) doesn't exist
 *  server-side, so its hex values are kept but mapped onto LEAD_STATUS_FLOW
 *  instead of the prototype's fictional keys. */
const STATUS_META: Record<string, { bg: string; text: string; dot: string }> = {
  new: { bg: '#E8EEFF', text: '#2947C9', dot: '#3B5BFF' },
  contact_attempted: { bg: '#FFEEDD', text: '#B45309', dot: '#F97316' },
  contacted: { bg: '#F3EAFF', text: '#6B2BC9', dot: '#8B5CF6' },
  site_visit_scheduled: { bg: '#E9EAFF', text: '#3A2BC9', dot: '#4F46E5' },
  follow_up_scheduled: { bg: '#FFEEDD', text: '#B45309', dot: '#F97316' },
  quotation_sent: { bg: '#FFF7D6', text: '#8A6D00', dot: '#EAB308' },
  won: { bg: '#DEF7E6', text: '#0F7A4A', dot: '#22C55E' },
  lost: { bg: '#F1EFF3', text: '#6B6473', dot: '#9CA3AF' },
  already_customer: { bg: '#DDF4F7', text: '#0E7490', dot: '#22D3EE' },
}

export function statusMeta(s: string): { label: string; bg: string; text: string; dot: string } {
  const meta = STATUS_META[s] ?? STATUS_META.lost
  return { label: statusLabel(s), ...meta }
}

export const TEMPERATURE_LABEL: Record<string, string> = { hot: '🔥 Hot', warm: '🌤️ Warm', cold: '❄️ Cold' }
