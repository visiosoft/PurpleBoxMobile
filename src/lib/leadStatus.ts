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

export const TEMPERATURE_LABEL: Record<string, string> = { hot: '🔥 Hot', warm: '🌤️ Warm', cold: '❄️ Cold' }
