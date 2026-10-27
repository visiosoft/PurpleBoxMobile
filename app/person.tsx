import { useMemo, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, Linking, Pressable, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { staffAppApi, AED, type TimelineItem } from '../src/lib/staffApp'
import { statusLabel, statusTone } from '../src/lib/leadStatus'
import { useAuth } from '../src/lib/auth'
import { apiError } from '../src/lib/api'
import { COLORS, FONTS, SHADOWS } from '../src/lib/theme'
import PressableScale from '../src/components/PressableScale'
import { AiSheet } from '../src/components/AskAiBar'
import BookUnitSheet from '../src/components/BookUnitSheet'

/**
 * One person, whatever they are to us: the lead, the tenant, or both — and
 * every WhatsApp, call, email and note with them in one timeline, newest
 * first. Opened from a lead, a chat, the customer search or the admin's
 * screens; reached by phone, lead id or customer id (GET /staff-app/person).
 */

type Filter = 'all' | 'whatsapp' | 'call' | 'notes'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'call', label: 'Calls' }, { value: 'notes', label: 'Notes & email' },
]

const KIND_META: Record<TimelineItem['kind'], { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  whatsapp: { icon: 'logo-whatsapp', color: COLORS.success, bg: COLORS.successTint },
  call: { icon: 'call-outline', color: COLORS.purple600, bg: COLORS.purple50 },
  email: { icon: 'mail-outline', color: '#2947C9', bg: '#E8EEFF' },
  note: { icon: 'document-text-outline', color: COLORS.noteLabel, bg: COLORS.noteSurface },
  attempt: { icon: 'flag-outline', color: COLORS.warnInk, bg: COLORS.warnTint },
  event: { icon: 'git-commit-outline', color: COLORS.ink3, bg: COLORS.surfaceAlt },
}

const fmtDay = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const fmtWhen = (iso: string) => {
  const d = new Date(iso)
  const today = d.toDateString() === new Date().toDateString()
  return `${today ? 'Today' : d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

export default function PersonScreen() {
  const params = useLocalSearchParams<{ phone?: string; leadId?: string; customerId?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [filter, setFilter] = useState<Filter>('all')
  const [aiOpen, setAiOpen] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)

  const by = { phone: params.phone || undefined, leadId: params.leadId || undefined, customerId: params.customerId || undefined }
  const { data: p, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['person', by.phone, by.leadId, by.customerId],
    queryFn: () => staffAppApi.person(by),
  })

  const timeline = useMemo(() => (p?.timeline ?? []).filter((t) => {
    if (filter === 'all') return true
    if (filter === 'notes') return t.kind === 'note' || t.kind === 'email' || t.kind === 'attempt'
    return t.kind === filter
  }), [p, filter])

  const lead = p?.leads[0]
  const canOpenLead = (l: { owner: { _id: string } | null }) => isAdmin || l.owner?._id === user?.id
  const activeContracts = (p?.contracts ?? []).filter((c) => c.status === 'active' || c.status === 'pending_signature')

  const openChat = () => p && router.push({ pathname: '/whatsapp/[phone]', params: { phone: p.phone, name: p.name, leadId: lead?._id ?? '' } })

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
            <Ionicons name="chevron-back" size={24} color={COLORS.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink }}>{p?.name || 'Profile'}</Text>
            {!!p && (
              <Text numberOfLines={1} style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3, marginTop: 1 }}>
                {[p.phone ? `+${p.phone}` : '', p.customer ? (activeContracts.length ? 'Tenant' : 'Customer') : '', lead ? `Lead · ${statusLabel(lead.status)}` : ''].filter(Boolean).join('  ·  ')}
              </Text>
            )}
          </View>
        </View>
        {!!p && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Action icon="logo-whatsapp" label="Chat" tint={COLORS.success} onPress={openChat} />
            <Action icon="call-outline" label="Call" tint={COLORS.purple600} onPress={() => Linking.openURL(`tel:+${p.phone}`)} />
            <Action icon="sparkles-outline" label="Ask AI" tint={COLORS.purple600} onPress={() => setAiOpen(true)} />
            <Action icon="key-outline" label="Book" tint={COLORS.purple600} onPress={() => setBookOpen(true)} />
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.purple600} /></View>
      ) : isError || !p ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.danger, textAlign: 'center' }}>{apiError(error)}</Text>
          <Pressable onPress={() => refetch()}><Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.purple600 }}>Try again</Text></Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[COLORS.purple600]} />}
        >
          {p.lastMessage && !p.lastMessage.mine && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: COLORS.warnTint }}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={COLORS.warnInk} />
              <Text style={{ flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.warnInk }}>
                They wrote last ({fmtWhen(p.lastMessage.at)}) — waiting for a reply
              </Text>
            </View>
          )}

          {p.leads.map((l) => {
            const tone = statusTone(l.status)
            return (
              <Card key={l._id} title="Lead">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11.5, color: tone.fg }}>{statusLabel(l.status)}</Text>
                  </View>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>Owner: {l.owner?.name || 'Unassigned'}</Text>
                </View>
                <Row label="Follow-up" value={l.followUpAt ? fmtWhen(l.followUpAt) : 'None set'} />
                {!!l.siteVisitAt && <Row label="Site visit" value={fmtWhen(l.siteVisitAt)} />}
                {!!l.storageSizeValue && l.storageSizeValue > 0 && (
                  <Row label="Wants" value={`${l.storageSizeValue} sq ft${l.durationValue ? ` for ${l.durationValue} ${l.durationUnit}${l.durationValue > 1 ? 's' : ''}` : ''}`} />
                )}
                <Row label="Came in" value={fmtDay(l.createdAt)} />
                {canOpenLead(l) && (
                  <PressableScale onPress={() => router.push(`/leads/${l._id}`)} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.purple600 }}>Open lead</Text>
                    <Ionicons name="arrow-forward" size={14} color={COLORS.purple600} />
                  </PressableScale>
                )}
              </Card>
            )
          })}

          {p.customer && (
            <Card title={p.customer.clientId ? `Customer · ${p.customer.clientId}` : 'Customer'}>
              {!!p.customer.company && <Row label="Company" value={p.customer.company} />}
              {!!p.email && <Row label="Email" value={p.email} />}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Money label="Paid" value={p.money.paid} color={COLORS.success} />
                <Money label="Still to pay" value={p.money.owed} color={COLORS.ink} />
                <Money label="Overdue" value={p.money.overdue} color={p.money.overdue > 0 ? COLORS.danger : COLORS.ink4} />
              </View>
              {p.contracts.length > 0 && (
                <View style={{ marginTop: 12, gap: 8 }}>
                  {p.contracts.map((c) => (
                    <View key={c._id} style={{ padding: 12, borderRadius: 12, backgroundColor: COLORS.surfaceAlt }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: COLORS.ink }}>
                          Unit {c.unitNumber || '—'}{c.units > 1 ? ` +${c.units - 1}` : ''}{c.sizeSqf ? ` · ${c.sizeSqf} sq ft` : ''}
                        </Text>
                        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: c.status === 'active' ? COLORS.success : COLORS.ink3, textTransform: 'uppercase' }}>
                          {c.status.replace(/_/g, ' ')}
                        </Text>
                      </View>
                      <Text style={{ marginTop: 3, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>
                        {c.contractNo} · {fmtDay(c.startDate)} → {fmtDay(c.endDate)} · {AED(c.rate)}/{c.billingPeriod === 'weekly' ? 'wk' : 'mo'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {p.invoices.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink4, marginBottom: 6 }}>Invoices</Text>
                  {p.invoices.slice(0, 5).map((i) => (
                    <View key={i._id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.lineSoft }}>
                      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink }}>{i.invoiceNo} · {fmtDay(i.invoiceDate)}</Text>
                      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: i.status === 'paid' ? COLORS.success : i.status === 'overdue' ? COLORS.danger : COLORS.ink3 }}>
                        {AED(i.total)} · {i.status}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          )}

          <View>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink3, marginBottom: 10 }}>History</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
              {FILTERS.map((f) => {
                const on = filter === f.value
                return (
                  <PressableScale
                    key={f.value}
                    onPress={() => setFilter(f.value)}
                    style={{ paddingHorizontal: 14, height: 32, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? COLORS.purple600 : '#fff', borderWidth: 1, borderColor: on ? COLORS.purple600 : COLORS.line }}
                  >
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: on ? '#fff' : COLORS.ink2 }}>{f.label}</Text>
                  </PressableScale>
                )
              })}
            </ScrollView>
            {timeline.length === 0 ? (
              <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3 }}>Nothing here yet.</Text>
            ) : (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, ...SHADOWS.card }}>
                {timeline.map((t, i) => {
                  const m = KIND_META[t.kind]
                  return (
                    <View key={`${t.at}-${i}`} style={{ flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.lineSoft }}>
                      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: m.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={m.icon} size={15} color={m.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 19, color: COLORS.ink }} numberOfLines={6}>
                          {t.kind === 'whatsapp' ? (t.direction === 'out' ? 'You: ' : 'Them: ') : ''}{t.text}
                        </Text>
                        <Text style={{ marginTop: 3, fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink4 }}>
                          {fmtWhen(t.at)}{t.by ? ` · ${t.by}` : ''}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <AiSheet
        visible={aiOpen}
        onClose={() => setAiOpen(false)}
        context={{ screen: 'Customer profile', leadId: lead?._id, phone: p?.phone, name: p?.name }}
        suggestions={[
          'Summarise everything with them so far',
          'Reply to their last message',
          'Set a follow-up for tomorrow at 11',
          ...(p?.customer ? ['What do they owe, and send them the invoice'] : ['Quote them for what they asked']),
        ]}
      />
      <BookUnitSheet visible={bookOpen} onClose={() => setBookOpen(false)} customer={p ? { name: p.name, phone: p.phone, leadId: lead?._id } : undefined} />
    </View>
  )
}

function Action({ icon, label, tint, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; tint: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 9, borderRadius: 14, backgroundColor: COLORS.purple50 }}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11.5, color: COLORS.ink }}>{label}</Text>
    </PressableScale>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 14, ...SHADOWS.card }}>
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink4, marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
      <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>{label}</Text>
      <Text style={{ flexShrink: 1, textAlign: 'right', fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink }}>{value}</Text>
    </View>
  )
}

function Money({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: COLORS.surfaceAlt }}>
      <Text style={{ fontFamily: FONTS.display, fontSize: 15, color }}>{AED(value)}</Text>
      <Text style={{ marginTop: 2, fontFamily: FONTS.body, fontSize: 11, color: COLORS.ink3 }}>{label}</Text>
    </View>
  )
}
