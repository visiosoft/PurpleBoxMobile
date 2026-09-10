import { View, Text, ScrollView, Linking, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../src/lib/auth'
import { useNotifications } from '../../src/lib/notifications'
import { leadApi, type FollowUpLeadRow, type Lead } from '../../src/lib/leads'
import { statusMeta } from '../../src/lib/leadStatus'
import { COLORS, FONTS, GRADIENT_PRIMARY, GRADIENT_PRIMARY_LOCATIONS, RADII, SHADOWS, avatarStyle } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'

const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'site_visit_scheduled', label: 'Site visit' },
  { key: 'follow_up_scheduled', label: 'Follow-up' },
  { key: 'won', label: 'Won' },
]

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function HomeTab() {
  const router = useRouter()
  const { user } = useAuth()
  const { waiting } = useNotifications()

  const { data: stats } = useQuery({ queryKey: ['lead-stats'], queryFn: leadApi.stats, staleTime: 30_000 })
  const { data: followUps } = useQuery({ queryKey: ['follow-ups'], queryFn: leadApi.followUps, staleTime: 30_000 })
  const { data: attentionPage } = useQuery({
    queryKey: ['leads-attention'],
    queryFn: () => leadApi.list({ status: 'new', limit: 3 }),
    staleTime: 30_000,
  })

  const attention = attentionPage?.data ?? []
  const todayFu = (followUps?.today ?? []).slice(0, 3)
  const overdueCount = followUps?.overdue.length ?? 0

  const tiles = [
    { label: 'New leads', value: stats?.byStatus?.new ?? 0, icon: 'people-outline' as const, color: '#2947C9', chip: '#E8EEFF' },
    { label: 'Follow-ups', value: (followUps?.today.length ?? 0) + overdueCount, icon: 'time-outline' as const, color: '#B45309', chip: '#FFEEDD' },
    { label: 'WhatsApp waiting', value: waiting, icon: 'chatbubbles-outline' as const, color: '#0F7A4A', chip: '#DEF7E6' },
    { label: 'Won', value: stats?.byStatus?.won ?? 0, icon: 'trending-up-outline' as const, color: COLORS.purple600, chip: COLORS.purple50 },
  ]

  const maxPipeline = Math.max(1, ...PIPELINE_STAGES.map((p) => stats?.byStatus?.[p.key] ?? 0))

  function openLead(id: string) {
    router.push(`/leads/${id}`)
  }
  function openChat(phone: string, name: string, leadId?: string) {
    router.push({ pathname: '/whatsapp/[phone]', params: { phone, name, leadId: leadId ?? '' } })
  }
  function call(phone: string) {
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Could not start a call'))
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <LinearGradient
        colors={GRADIENT_PRIMARY}
        locations={GRADIENT_PRIMARY_LOCATIONS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 62, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.4, color: '#fff' }}>
                {greeting()}, {(user?.name || '').split(' ')[0] || 'there'} 👋
              </Text>
              <Text style={{ marginTop: 7, fontFamily: FONTS.body, fontSize: 13.5, color: 'rgba(255,255,255,0.82)' }}>
                Here's what needs your attention today.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PressableScale
                onPress={() => Alert.alert('Notifications', 'Your notification feed is coming soon.')}
                style={{ width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="notifications-outline" size={19} color="#fff" />
                {waiting + overdueCount > 0 && (
                  <View style={{ position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cyan, borderWidth: 2, borderColor: COLORS.purple600 }} />
                )}
              </PressableScale>
              <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: FONTS.display, fontSize: 15, color: COLORS.purple600 }}>
                  {(user?.name || '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={{ flex: 1, marginTop: -44 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: '#fff', borderRadius: RADII.card + 2, padding: 14, ...SHADOWS.floating }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 12 }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: COLORS.ink3 }}>Today's performance</Text>
            <View style={{ backgroundColor: COLORS.successTint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.success }}>Live</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {tiles.map((t) => (
              <View key={t.label} style={{ width: '47%', borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, padding: 12, backgroundColor: COLORS.paper }}>
                <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={t.icon} size={14} color={t.color} />
                </View>
                <Text style={{ marginTop: 9, fontFamily: FONTS.display, fontSize: 26, letterSpacing: -0.5, color: COLORS.ink }}>{t.value}</Text>
                <Text style={{ marginTop: 3, fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink3 }}>{t.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26, marginBottom: 12, paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.3, color: COLORS.ink }}>Needs attention</Text>
          <PressableScale onPress={() => router.push('/leads')}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.purple600 }}>See all</Text>
          </PressableScale>
        </View>

        {attention.length === 0 ? (
          <EmptyRow text="No new leads waiting on you right now." />
        ) : (
          <View style={{ gap: 11 }}>
            {attention.map((lead: Lead, i: number) => {
              const av = avatarStyle(i)
              const meta = statusMeta(lead.status)
              return (
                <View key={lead._id} style={{ borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, padding: 14, backgroundColor: '#fff', ...SHADOWS.card }}>
                  <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
                    <PressableScale onPress={() => openLead(lead._id)} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: av.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: FONTS.display, fontSize: 15, color: av.text }}>{lead.fullName.slice(0, 1).toUpperCase()}</Text>
                    </PressableScale>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <PressableScale onPress={() => openLead(lead._id)}>
                          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink }}>{lead.fullName}</Text>
                        </PressableScale>
                        <View style={{ backgroundColor: meta.bg, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 }}>
                          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: meta.text }}>{meta.label}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                        <Ionicons name="logo-whatsapp" size={12} color={COLORS.whatsapp} />
                        <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.ink3 }}>
                          {lead.source === 'whatsapp' ? 'WhatsApp lead' : 'New lead'} · {lead.createdAt ? timeAgo(lead.createdAt) : ''}
                        </Text>
                      </View>
                      <View style={{ marginTop: 9, backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 10 }}>
                        <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 18, color: COLORS.ink2 }} numberOfLines={2}>
                          {lead.notes ? `"${lead.notes}"` : `${lead.storageSizeValue} sqft · ${lead.durationValue} ${lead.durationUnit}${lead.durationValue === 1 ? '' : 's'}`}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <PressableScale
                      onPress={() => openChat(lead.phoneNormalized, lead.fullName, lead._id)}
                      style={{ flex: 1, height: 42, borderRadius: 13, backgroundColor: COLORS.whatsapp, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, ...SHADOWS.whatsappGlow }}
                    >
                      <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: '#fff' }}>Reply on WhatsApp</Text>
                    </PressableScale>
                    <PressableScale onPress={() => openLead(lead._id)} style={{ width: 46, height: 42, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="chevron-forward" size={17} color={COLORS.ink2} />
                    </PressableScale>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26, marginBottom: 12, paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.3, color: COLORS.ink }}>Today's follow-ups</Text>
          <PressableScale onPress={() => router.push('/followups')}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.purple600 }}>All</Text>
          </PressableScale>
        </View>

        {todayFu.length === 0 ? (
          <EmptyRow text="No follow-ups today. You're all caught up." />
        ) : (
          <View style={{ gap: 11 }}>
            {todayFu.map((f: FollowUpLeadRow) => (
              <View key={f._id} style={{ borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, padding: 14, backgroundColor: '#fff', ...SHADOWS.card }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <PressableScale onPress={() => openLead(f._id)} style={{ flex: 1 }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink }}>{f.fullName}</Text>
                    <Text style={{ marginTop: 3, fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.ink3 }}>{statusMeta(f.status).label}</Text>
                  </PressableScale>
                  <Text style={{ fontFamily: FONTS.display, fontSize: 15, letterSpacing: -0.3, color: COLORS.purple600 }}>{formatTime(f.followUpAt)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <PressableScale onPress={() => openChat(f.phone, f.fullName, f._id)} style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: COLORS.successTintSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.success }}>WhatsApp</Text>
                  </PressableScale>
                  <PressableScale onPress={() => call(f.phone)} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.ink2 }}>Call</Text>
                  </PressableScale>
                  <PressableScale onPress={() => openLead(f._id)} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.ink2 }}>Reschedule</Text>
                  </PressableScale>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: 26, padding: 16, borderRadius: RADII.card + 2, backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.line }}>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: COLORS.ink3 }}>My pipeline</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 14, alignItems: 'flex-end' }}>
            {PIPELINE_STAGES.map((p) => {
              const count = stats?.byStatus?.[p.key] ?? 0
              const dot = statusMeta(p.key).dot
              return (
                <View key={p.key} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontFamily: FONTS.display, fontSize: 20, letterSpacing: -0.4, color: COLORS.ink }}>{count}</Text>
                  <View style={{ height: 6, width: '100%', borderRadius: 999, marginTop: 8, backgroundColor: dot, opacity: count ? Math.max(0.3, count / maxPipeline) : 0.25 }} />
                  <Text style={{ marginTop: 7, fontFamily: FONTS.bodyMedium, fontSize: 9.5, color: COLORS.ink3, textAlign: 'center' }}>{p.label}</Text>
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <View style={{ borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, padding: 18, backgroundColor: '#fff', alignItems: 'center' }}>
      <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3, textAlign: 'center' }}>{text}</Text>
    </View>
  )
}
