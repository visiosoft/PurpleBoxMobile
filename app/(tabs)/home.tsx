import { useCallback, useState } from 'react'
import { View, Text, ScrollView, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../src/lib/auth'
import { useNotifications } from '../../src/lib/notifications'
import { leadApi, type Lead } from '../../src/lib/leads'
import { leadDisplayName } from '../../src/lib/leadStatus'
import { COLORS, FONTS, GRADIENT_PRIMARY, GRADIENT_PRIMARY_LOCATIONS, SHADOWS } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'
import AskAiBar, { AiSheet } from '../../src/components/AskAiBar'

/**
 * The rep's dashboard. It used to be a feed of every lead card, which made
 * Home and Leads the same screen twice; now it's what a rep needs at a
 * glance — what's waiting, what's assigned to them, and the things they do
 * most (book, quote, find a unit, ask AI) one tap away. The lead cards
 * themselves live on the Leads tab, where each tile here leads.
 */

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDayTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  const day = sameDay ? 'Today' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

export default function HomeTab() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { waiting } = useNotifications()
  const [refreshing, setRefreshing] = useState(false)
  const [aiQuestion, setAiQuestion] = useState<string | null>(null)

  const { data: followUps, refetch: refetchFollowUps } = useQuery({
    queryKey: ['follow-ups'], queryFn: leadApi.followUps, staleTime: 30_000, refetchInterval: 60_000,
  })
  // Only the total is needed — the server scopes a rep to their own leads.
  const { data: newLeads, refetch: refetchNew } = useQuery({
    queryKey: ['leads-assigned-new'], queryFn: () => leadApi.list({ status: 'new', limit: 1 }), staleTime: 30_000, refetchInterval: 60_000,
  })
  const { data: assigned = [], refetch: refetchAssigned } = useQuery({
    queryKey: ['leads-newly-assigned'], queryFn: leadApi.newlyAssigned, staleTime: 20_000, refetchInterval: 30_000,
  })
  const { data: visitsPage, refetch: refetchVisits } = useQuery({
    queryKey: ['leads-site-visits'], queryFn: () => leadApi.list({ status: 'site_visit_scheduled', limit: 25 }), staleTime: 60_000,
  })

  useFocusEffect(
    useCallback(() => {
      refetchFollowUps(); refetchNew(); refetchAssigned(); refetchVisits()
    }, [refetchFollowUps, refetchNew, refetchAssigned, refetchVisits]),
  )

  async function onRefresh() {
    setRefreshing(true)
    try {
      await Promise.all([refetchFollowUps(), refetchNew(), refetchAssigned(), refetchVisits(), queryClient.invalidateQueries({ queryKey: ['lead-stats'] })])
    } finally {
      setRefreshing(false)
    }
  }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const visits = (visitsPage?.data ?? [])
    .filter((l: Lead) => !!l.siteVisitAt && new Date(l.siteVisitAt).getTime() >= startOfToday.getTime())
    .sort((a, b) => new Date(a.siteVisitAt!).getTime() - new Date(b.siteVisitAt!).getTime())
    .slice(0, 3)

  const newCount = newLeads?.total ?? 0
  const dueToday = followUps?.today.length ?? 0
  const overdue = followUps?.overdue.length ?? 0
  const openLeads = (view: string) => router.push({ pathname: '/leads', params: { view } })

  const firstName = (user?.name || '').split(' ')[0] || 'there'
  const nothing = newCount + dueToday + overdue + waiting === 0

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <LinearGradient
        colors={GRADIENT_PRIMARY}
        locations={GRADIENT_PRIMARY_LOCATIONS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, color: '#fff' }}>
                {greeting()}, {firstName} 👋
              </Text>
              <Text style={{ marginTop: 4, fontFamily: FONTS.body, fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>
                {nothing ? "You're all caught up for now." : new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            </View>
            <PressableScale
              onPress={() => router.push('/profile')}
              style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.purple600 }}>{(user?.name || '?').slice(0, 1).toUpperCase()}</Text>
            </PressableScale>
          </View>
          <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
            <AskAiBar tone="glass" context={{ screen: 'Dashboard' }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.purple600]} tintColor={COLORS.purple600} />}
      >
        {/* Assigned to you — the notification, not the list. */}
        {(assigned.length > 0 || newCount > 0) && (
          <PressableScale
            onPress={() => openLeads('new')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: COLORS.purple600, ...SHADOWS.purpleGlow }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person-add" size={19} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14.5, color: '#fff' }}>
                {assigned.length > 0
                  ? `${assigned.length} new ${assigned.length === 1 ? 'lead' : 'leads'} assigned to you`
                  : `${newCount} new ${newCount === 1 ? 'lead' : 'leads'} waiting for you`}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: FONTS.body, fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                {assigned.length > 0 ? assigned.slice(0, 3).map((l) => l.fullName).join(', ') : 'Not contacted yet — tap to start'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </PressableScale>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <StatTile icon="sparkles-outline" label="New leads" value={newCount} tint={COLORS.purple600} onPress={() => openLeads('new')} />
          <StatTile icon="logo-whatsapp" label="Waiting for reply" value={waiting} tint={COLORS.success} onPress={() => router.push('/whatsapp')} />
          <StatTile icon="time-outline" label="Follow-ups today" value={dueToday} tint={COLORS.warnInk} onPress={() => openLeads('due')} />
          <StatTile icon="alert-circle-outline" label="Overdue" value={overdue} tint={COLORS.danger} onPress={() => openLeads('due')} />
        </View>

        <View>
          <SectionTitle>Quick actions</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <ActionTile icon="key-outline" label="Quote & book" onPress={() => router.push('/book-lead')} />
            <ActionTile icon="search-outline" label="Check availability" onPress={() => router.push('/units')} />
            <ActionTile icon="person-outline" label="Find a customer" onPress={() => router.push('/customers')} />
            <ActionTile icon="list-outline" label="Plan my day" onPress={() => setAiQuestion('Plan my day: who is waiting for my reply, which follow-ups are due today, and what should I send each one?')} />
          </View>
        </View>

        {visits.length > 0 && (
          <View>
            <SectionTitle>Site visits</SectionTitle>
            <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, ...SHADOWS.card }}>
              {visits.map((l, i) => (
                <PressableScale
                  key={l._id}
                  onPress={() => router.push(`/leads/${l._id}`)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.lineSoft }}
                >
                  <Ionicons name="walk-outline" size={18} color={COLORS.purple600} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink }}>{leadDisplayName(l)}</Text>
                    <Text style={{ marginTop: 2, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>{formatDayTime(l.siteVisitAt)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.chevron} />
                </PressableScale>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <AiSheet visible={!!aiQuestion} initialQuestion={aiQuestion || undefined} onClose={() => setAiQuestion(null)} context={{ screen: 'Dashboard' }} />
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink3, marginBottom: 10 }}>
      {children}
    </Text>
  )
}

function StatTile({ icon, label, value, tint, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; tint: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 14, ...SHADOWS.card }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Ionicons name={icon} size={18} color={tint} />
        <Ionicons name="chevron-forward" size={14} color={COLORS.chevron} />
      </View>
      <Text style={{ marginTop: 10, fontFamily: FONTS.display, fontSize: 26, color: value > 0 ? COLORS.ink : COLORS.ink4 }}>{value}</Text>
      <Text style={{ marginTop: 2, fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink3 }}>{label}</Text>
    </PressableScale>
  )
}

function ActionTile({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      style={{ flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.purple50, borderRadius: 16, borderWidth: 1, borderColor: COLORS.purple100, paddingVertical: 14, paddingHorizontal: 12 }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={COLORS.purple600} />
      </View>
      <Text style={{ flex: 1, fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink }}>{label}</Text>
    </PressableScale>
  )
}
