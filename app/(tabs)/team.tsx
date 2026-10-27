import { useCallback, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Modal, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { staffAppApi, AED, minsText, type TeamPeriod, type TeamRow } from '../../src/lib/staffApp'
import { leadApi } from '../../src/lib/leads'
import { leadDisplayName } from '../../src/lib/leadStatus'
import { apiError } from '../../src/lib/api'
import { COLORS, FONTS, SHADOWS } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'
import ScreenHeader from '../../src/components/ScreenHeader'
import Avatar from '../../src/components/Avatar'
import { AiSheet } from '../../src/components/AskAiBar'

/**
 * How each rep is doing: what they were handed and how fast they answered,
 * the follow-ups they let slip and the customers left waiting, the visits and
 * bookings they made. Whoever has most slipping is at the top — that is who
 * the admin opens this for. Tap a rep for the leads behind their missed
 * follow-ups. Figures from GET /staff-app/admin/team.
 */

const PERIODS: { value: TeamPeriod; label: string }[] = [
  { value: 'today', label: 'Today' }, { value: 'week', label: '7 days' }, { value: 'month', label: 'This month' },
]

export default function TeamTab() {
  const [period, setPeriod] = useState<TeamPeriod>('today')
  const [open, setOpen] = useState<TeamRow | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-team', period], queryFn: () => staffAppApi.team(period), staleTime: 30_000,
  })
  useFocusEffect(useCallback(() => { refetch() }, [refetch]))

  async function onRefresh() {
    setRefreshing(true)
    try { await refetch() } finally { setRefreshing(false) }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <ScreenHeader title="Team" />
      <View style={{ flexDirection: 'row', margin: 16, marginBottom: 6, padding: 4, borderRadius: 14, backgroundColor: COLORS.surfaceAlt }}>
        {PERIODS.map((p) => {
          const on = p.value === period
          return (
            <PressableScale key={p.value} onPress={() => setPeriod(p.value)} style={{ flex: 1, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#fff' : 'transparent' }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: on ? COLORS.ink : COLORS.ink3 }}>{p.label}</Text>
            </PressableScale>
          )
        })}
      </View>

      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.purple600} /></View>
      ) : isError && !data ? (
        <Text style={{ padding: 24, textAlign: 'center', fontFamily: FONTS.body, color: COLORS.danger }}>{apiError(error)}</Text>
      ) : data ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 32, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.purple600]} />}
        >
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Total label="Leads given" value={data.totals.given} />
            <Total label="Missed follow-ups" value={data.totals.missedFollowUps} bad />
            <Total label="Waiting" value={data.totals.waitingForReply} bad />
            <Total label="Booked" value={data.totals.booked} />
          </View>
          <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink4 }}>
            Missed follow-ups and waiting are as of now; the rest cover {data.label.toLowerCase()}.
          </Text>
          {data.rows.map((r) => <RepCard key={r.userId} row={r} onPress={() => setOpen(r)} />)}
          {data.rows.length === 0 && (
            <Text style={{ textAlign: 'center', padding: 24, fontFamily: FONTS.body, color: COLORS.ink3 }}>No one on the sales team yet.</Text>
          )}
        </ScrollView>
      ) : null}

      <RepSheet row={open} onClose={() => setOpen(null)} />
    </View>
  )
}

function Total({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, paddingVertical: 10, alignItems: 'center' }}>
      <Text style={{ fontFamily: FONTS.display, fontSize: 19, color: bad && value > 0 ? COLORS.danger : COLORS.ink }}>{value}</Text>
      <Text numberOfLines={2} style={{ marginTop: 2, textAlign: 'center', fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: COLORS.ink3 }}>{label}</Text>
    </View>
  )
}

function RepCard({ row: r, onPress }: { row: TeamRow; onPress: () => void }) {
  const cells: { label: string; value: string; bad?: boolean }[] = [
    { label: 'Given', value: String(r.given) },
    { label: 'Not answered', value: String(r.notAnswered), bad: r.notAnswered > 0 },
    { label: 'Reply time', value: minsText(r.medianReplyMins), bad: (r.medianReplyMins ?? 0) > 60 },
    { label: 'Calls', value: String(r.calls) },
    { label: 'Missed F/U', value: String(r.missedFollowUps), bad: r.missedFollowUps > 0 },
    { label: 'Waiting', value: String(r.waitingForReply), bad: r.waitingForReply > 0 },
    { label: 'Visits', value: String(r.visits) },
    { label: 'Booked', value: String(r.booked) },
  ]
  return (
    <PressableScale onPress={onPress} style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 14, ...SHADOWS.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar name={r.name} size={38} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink }}>{r.name}</Text>
          <Text style={{ marginTop: 1, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>
            {r.openLeads} open leads · {r.dueToday} due today{r.bookedValue > 0 ? ` · ${AED(r.bookedValue)} booked` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.chevron} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, rowGap: 10 }}>
        {cells.map((c) => (
          <View key={c.label} style={{ width: '25%', alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.display, fontSize: 16, color: c.bad ? COLORS.danger : COLORS.ink }}>{c.value}</Text>
            <Text style={{ marginTop: 1, fontFamily: FONTS.body, fontSize: 10.5, color: COLORS.ink3 }}>{c.label}</Text>
          </View>
        ))}
      </View>
    </PressableScale>
  )
}

/** One rep: the leads behind their missed follow-ups, and an Ask AI about them. */
function RepSheet({ row, onClose }: { row: TeamRow | null; onClose: () => void }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [ai, setAi] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['follow-ups-for', row?.userId], queryFn: () => leadApi.followUpsFor(row!.userId), enabled: !!row,
  })
  const missed = data?.overdue ?? []
  const today = data?.today ?? []

  const open = (phone: string, leadId: string) => {
    onClose()
    router.push({ pathname: '/person', params: { phone, leadId } })
  }

  return (
    <Modal visible={!!row} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink }}>{row?.name}</Text>
          <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={24} color={COLORS.ink2} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
          <PressableScale
            onPress={() => setAi(`How is ${row?.name} doing? Look at their missed follow-ups and customers waiting, read the latest messages, and tell me what they should do first.`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 16, backgroundColor: COLORS.purple600 }}
          >
            <Ionicons name="sparkles" size={16} color="#fff" />
            <Text style={{ flex: 1, fontFamily: FONTS.bodyBold, fontSize: 13.5, color: '#fff' }}>Ask AI what {row?.name.split(' ')[0]} should do first</Text>
          </PressableScale>

          {isLoading ? <ActivityIndicator color={COLORS.purple600} /> : (
            <>
              <LeadList title={`Missed follow-ups (${missed.length})`} rows={missed} onOpen={open} empty="Nothing missed." late />
              <LeadList title={`Due today (${today.length})`} rows={today} onOpen={open} empty="Nothing due today." />
            </>
          )}
        </ScrollView>
      </View>
      <AiSheet visible={!!ai} initialQuestion={ai || undefined} onClose={() => setAi(null)} context={{ screen: 'Team', name: row?.name }} />
    </Modal>
  )
}

function LeadList({ title, rows, onOpen, empty, late }: {
  title: string
  rows: { _id: string; fullName: string; phone: string; phoneNormalized?: string; followUpAt: string | null; lastMessageAt?: string | null; lastMessageMine?: boolean | null }[]
  onOpen: (phone: string, leadId: string) => void
  empty: string
  late?: boolean
}) {
  // Read once when the list opens, not on every render.
  const [now] = useState(() => Date.now())
  return (
    <View>
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink3, marginBottom: 8 }}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3 }}>{empty}</Text>
      ) : (
        <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.line }}>
          {rows.map((l, i) => {
            const days = l.followUpAt ? Math.max(0, Math.floor((now - new Date(l.followUpAt).getTime()) / 86_400_000)) : 0
            return (
              <PressableScale
                key={l._id}
                onPress={() => onOpen(l.phoneNormalized || l.phone, l._id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.lineSoft }}
              >
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: COLORS.ink }}>{leadDisplayName(l)}</Text>
                  <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink3 }}>
                    {late && l.followUpAt ? `${days} ${days === 1 ? 'day' : 'days'} late` : ''}
                    {l.lastMessageAt ? `${late ? ' · ' : ''}${l.lastMessageMine ? 'We wrote last' : 'Customer wrote last'}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.chevron} />
              </PressableScale>
            )
          })}
        </View>
      )}
    </View>
  )
}
