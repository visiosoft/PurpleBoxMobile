import { useEffect, useState, useMemo, memo, useCallback } from 'react'
import { View, Text, TextInput, FlatList, SectionList, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { leadApi, type FollowUpLeadRow, type Lead } from '../../../src/lib/leads'
import { apiError } from '../../../src/lib/api'
import { notify } from '../../../src/lib/alert'
import { LEAD_STATUS_FLOW, statusMeta, leadDisplayName } from '../../../src/lib/leadStatus'
import { COLORS, FONTS, RADII, SHADOWS, avatarStyle } from '../../../src/lib/theme'
import PressableScale from '../../../src/components/PressableScale'
import ScreenHeader from '../../../src/components/ScreenHeader'
import SwipeToAction from '../../../src/components/SwipeToAction'
import FollowUpSheet from '../../../src/components/FollowUpSheet'
import AskAiBar from '../../../src/components/AskAiBar'

const FILTERS: { value: string; label: string }[] = [{ value: 'all', label: 'All' }, ...LEAD_STATUS_FLOW]

/** New = not contacted yet (what was just assigned); Follow-ups = due today
 *  or overdue; All = everything, by stage. Home's tiles open straight into
 *  one of these with ?view=. */
type LeadView = 'new' | 'due' | 'all'
const VIEWS: { key: LeadView; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'due', label: 'Follow-ups' },
  { key: 'all', label: 'All' },
]

function agoText(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins || 1}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** When it was due, in words a rep can check — "Was due Sun 26 Oct · 1 day
 *  late" instead of a bare "7d overdue" with nothing to say why. */
function dueText(iso: string | null): { text: string; late: boolean } {
  if (!iso) return { text: 'No date', late: false }
  const d = new Date(iso)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  if (d.getTime() >= startOfToday.getTime()) {
    return { text: `Due today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, late: false }
  }
  const days = Math.max(1, Math.round((startOfToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000))
  return { text: `Was due ${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · ${days} ${days === 1 ? 'day' : 'days'} late`, late: true }
}

/** Who wrote last decides what to do next, so it's on the card. */
function lastChatText(row: FollowUpLeadRow): string {
  if (!row.lastMessageAt) return 'No WhatsApp conversation yet'
  return row.lastMessageMine
    ? `You wrote last, ${agoText(row.lastMessageAt)} — no reply yet`
    : `Customer wrote last, ${agoText(row.lastMessageAt)} — waiting for you`
}

function timeAgo(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function lastActivityOf(lead: Lead): string {
  const t = lead.timeline
  const latest = t && t.length ? t[t.length - 1] : null
  if (latest) return latest.text
  return lead.createdAt ? `Added ${timeAgo(lead.createdAt)}` : 'No activity yet'
}

/** Today / Yesterday / Older — the list already arrives newest-first
 *  (server sorts by leadDateTime desc), so this is a straight bucket pass,
 *  not a re-sort. Empty buckets are dropped rather than shown with nothing
 *  under them. */
function groupLeadsByDay(leads: Lead[]): { title: string; data: Lead[] }[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = startOfDay(new Date())
  const yesterday = today - 86_400_000
  const buckets: Record<string, Lead[]> = { Today: [], Yesterday: [], Older: [] }
  for (const lead of leads) {
    const at = startOfDay(new Date(lead.leadDateTime))
    const key = at === today ? 'Today' : at === yesterday ? 'Yesterday' : 'Older'
    buckets[key].push(lead)
  }
  return ['Today', 'Yesterday', 'Older'].filter((k) => buckets[k].length).map((k) => ({ title: k, data: buckets[k] }))
}

function followUpLabel(lead: Lead): { text: string; overdue: boolean } {
  if (!lead.followUpAt) return { text: 'Not scheduled', overdue: false }
  const d = new Date(lead.followUpAt)
  const overdue = d.getTime() < Date.now()
  const day = d.toLocaleDateString([], { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return { text: `${day}, ${time}`, overdue }
}

export default function LeadsListScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ view?: string }>()
  const asView = (v?: string): LeadView | null => (v === 'new' || v === 'due' || v === 'all' ? v : null)
  const [view, setView] = useState<LeadView>(asView(params.view) ?? 'new')
  // A dashboard tile opens a specific view; a plain tab press keeps whatever
  // was last open. Followed while rendering, not in an effect after it.
  const [lastParam, setLastParam] = useState(params.view)
  if (params.view !== lastParam) {
    setLastParam(params.view)
    const next = asView(params.view)
    if (next) setView(next)
  }
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [rescheduleLead, setRescheduleLead] = useState<{ id: string; name: string; currentFollowUp?: string | null } | null>(null)

  const scheduleFollowUpMutation = useMutation({
    mutationFn: ({ id, iso }: { id: string; iso: string }) => leadApi.scheduleFollowUp(id, iso),
    onSuccess: () => {
      notify('Follow-up set', 'You will be reminded on the day.')
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] })
      setRescheduleLead(null)
    },
    onError: () => notify('Could not reschedule', 'Failed to update follow-up date.'),
  })

  const onManualRefresh = async () => {
    setManualRefreshing(true)
    try {
      await refetch()
    } finally {
      setManualRefreshing(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const { data: stats } = useQuery({ queryKey: ['lead-stats'], queryFn: leadApi.stats, staleTime: 30_000 })

  // 30 at a time rather than everything at once — with 1000+ leads on an
  // admin account, fetching and rendering the lot up front is exactly what
  // was making the page feel slow. Scrolling near the bottom loads the next
  // 30 the same way; nothing changes about how that already worked here.
  const PAGE_SIZE = 30
  const {
    data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['leads', view === 'new' ? 'new' : status, debouncedQ],
    queryFn: ({ pageParam }) => {
      const s = view === 'new' ? 'new' : status
      return leadApi.list({ status: s === 'all' ? undefined : s, search: debouncedQ || undefined, page: pageParam, limit: PAGE_SIZE })
    },
    enabled: view !== 'due',
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  })

  const { data: followUps, isLoading: loadingDue, refetch: refetchDue } = useQuery({
    queryKey: ['follow-ups'],
    queryFn: leadApi.followUps,
    staleTime: 30_000,
  })
  // Most overdue last-but-nearest first: yesterday's miss is more worth
  // saving than one from three weeks ago.
  const dueSections = useMemo(() => {
    const term = debouncedQ.toLowerCase()
    const match = (r: FollowUpLeadRow) => !term || leadDisplayName(r).toLowerCase().includes(term) || r.phone.includes(term)
    const overdue = (followUps?.overdue ?? []).filter(match).slice().reverse()
    const today = (followUps?.today ?? []).filter(match)
    return [
      { title: `Today · ${today.length}`, data: today },
      { title: `Overdue · ${overdue.length}`, data: overdue },
    ].filter((sec) => sec.data.length)
  }, [followUps, debouncedQ])

  const leads = data?.pages.flatMap((p) => p.data) ?? []
  const total = data?.pages[0]?.total ?? stats?.total ?? 0
  const sections = useMemo(() => groupLeadsByDay(leads), [leads])

  // Opening it is "seen" — it drops out of the dashboard's "assigned to you" alert.
  const markSeen = useCallback((leadId: string) => {
    leadApi.markSeen(leadId).then(() => queryClient.invalidateQueries({ queryKey: ['leads-newly-assigned'] })).catch(() => {})
  }, [queryClient])

  const openChat = useCallback((lead: { _id: string; phone: string; phoneNormalized?: string; fullName: string; whatsappProfileName?: string }) => {
    markSeen(lead._id)
    router.push({ pathname: '/whatsapp/[phone]', params: { phone: lead.phoneNormalized || lead.phone, name: leadDisplayName(lead), leadId: lead._id } })
  }, [router, markSeen])

  const openLead = useCallback((leadId: string) => {
    markSeen(leadId)
    router.push(`/leads/${leadId}`)
  }, [router, markSeen])

  const requestReschedule = useCallback((lead: { _id: string; fullName: string; whatsappProfileName?: string; followUpAt?: string | null }) => {
    setRescheduleLead({ id: lead._id, name: leadDisplayName(lead), currentFollowUp: lead.followUpAt })
  }, [])

  const renderLeadCard = useCallback(({ item, index }: { item: Lead; index: number }) => (
    <MemoizedLeadCard
      lead={item}
      index={index}
      onOpen={() => openLead(item._id)}
      onChat={() => openChat(item)}
      onReschedule={() => requestReschedule(item)}
    />
  ), [openLead, openChat, requestReschedule])

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceAlt }}>
      <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <SafeAreaView edges={['top']}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: FONTS.display, fontSize: 26, letterSpacing: -0.5, color: COLORS.ink }}>Leads</Text>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink3 }}>{total} total</Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <AskAiBar context={{ screen: 'Leads' }} />
            </View>

            <View style={{ flexDirection: 'row', marginTop: 12, backgroundColor: COLORS.control, borderRadius: 12, padding: 3 }}>
              {VIEWS.map((v) => {
                const active = view === v.key
                const count = v.key === 'new' ? stats?.byStatus?.new
                  : v.key === 'due' ? (followUps ? followUps.overdue.length + followUps.today.length : undefined)
                  : stats?.total
                return (
                  <PressableScale
                    key={v.key}
                    onPress={() => setView(v.key)}
                    style={{ flex: 1, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, backgroundColor: active ? '#fff' : 'transparent', ...(active ? SHADOWS.card : {}) }}
                  >
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: active ? COLORS.purple600 : COLORS.ink3 }}>{v.label}</Text>
                    {count != null && <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: active ? COLORS.purple400 : COLORS.ink4 }}>{count}</Text>}
                  </PressableScale>
                )
              })}
            </View>

            <View
              style={{
                marginTop: 14, height: 46, borderRadius: RADII.input, borderWidth: 1, borderColor: COLORS.line,
                backgroundColor: COLORS.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
              }}
            >
              <Ionicons name="search" size={17} color={COLORS.ink4} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search name, phone or company..."
                placeholderTextColor={COLORS.ink4}
                style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink }}
              />
              {q.length > 0 && (
                <Pressable onPress={() => setQ('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={17} color={COLORS.ink4} />
                </Pressable>
              )}
            </View>

            {view === 'all' ? (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={FILTERS}
              keyExtractor={(f) => f.value}
              contentContainerStyle={{ gap: 7, paddingVertical: 12 }}
              renderItem={({ item }) => {
                const active = status === item.value
                const count = item.value === 'all' ? stats?.total : stats?.byStatus?.[item.value]
                return (
                  <PressableScale
                    onPress={() => setStatus(item.value)}
                    style={{
                      paddingHorizontal: 14, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: active ? COLORS.purple600 : COLORS.surfaceAlt, borderWidth: active ? 0 : 1, borderColor: active ? undefined : COLORS.chevron,
                      flexDirection: 'row', gap: 5, ...(active ? SHADOWS.purpleGlow : {}),
                    }}
                  >
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: active ? '#fff' : COLORS.ink2 }}>{item.label}</Text>
                    {count != null && (
                      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: active ? 'rgba(255,255,255,0.75)' : COLORS.ink4 }}>{count}</Text>
                    )}
                  </PressableScale>
                )
              }}
            />
            ) : <View style={{ height: 12 }} />}
          </View>
        </SafeAreaView>
      </View>

      {view === 'due' ? (
        loadingDue ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={COLORS.purple600} />
          </View>
        ) : dueSections.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <Ionicons name="checkmark-circle" size={40} color={COLORS.success} />
            <Text style={{ marginTop: 14, fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink }}>No follow-ups due</Text>
            <Text style={{ marginTop: 6, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3, textAlign: 'center' }}>Nothing is due today or late.</Text>
          </View>
        ) : (
          <SectionList
            sections={dueSections}
            keyExtractor={(r) => r._id}
            stickySectionHeadersEnabled
            onRefresh={async () => { setManualRefreshing(true); try { await refetchDue() } finally { setManualRefreshing(false) } }}
            refreshing={manualRefreshing}
            contentContainerStyle={{ padding: 16, gap: 11 }}
            initialNumToRender={8}
            windowSize={5}
            renderSectionHeader={({ section }) => (
              <View style={{ paddingVertical: 8, backgroundColor: COLORS.surfaceAlt }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase', color: COLORS.ink3 }}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <DueCard
                row={item}
                onOpen={() => openLead(item._id)}
                onChat={() => openChat(item)}
                onFollowUp={() => requestReschedule(item)}
              />
            )}
          />
        )
      ) : isLoading && leads.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.purple600} />
        </View>
      ) : isError && leads.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.danger, textAlign: 'center' }}>{apiError(error)}</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.purple600 }}>Try again</Text>
          </Pressable>
        </View>
      ) : leads.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <View style={{ width: 66, height: 66, borderRadius: 22, backgroundColor: COLORS.purple100, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="people-outline" size={30} color={COLORS.purple600} />
          </View>
          <Text style={{ marginTop: 18, fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink }}>{view === 'new' ? 'No new leads' : 'No leads here yet'}</Text>
          <Text style={{ marginTop: 6, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3, textAlign: 'center' }}>New leads assigned to you will appear here.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(l) => l._id}
          stickySectionHeadersEnabled
          onRefresh={onManualRefresh}
          refreshing={manualRefreshing}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (hasNextPage) fetchNextPage() }}
          contentContainerStyle={{ padding: 16, gap: 11 }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={true}
          renderSectionHeader={({ section }) => (
            <View style={{ paddingVertical: 8, backgroundColor: COLORS.surfaceAlt }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase', color: COLORS.ink3 }}>
                {section.title}
              </Text>
            </View>
          )}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={COLORS.purple600} /> : null}
          renderItem={renderLeadCard}
        />
      )}

      {!!rescheduleLead && (
        <FollowUpSheet
          visible={!!rescheduleLead}
          current={rescheduleLead.currentFollowUp}
          title={`Follow up: ${rescheduleLead.name}`}
          onSchedule={(iso) => scheduleFollowUpMutation.mutate({ id: rescheduleLead.id, iso })}
          onClose={() => setRescheduleLead(null)}
        />
      )}
    </View>
  )
}

function LeadCard({
  lead, index, onOpen, onChat, onReschedule,
}: { lead: Lead; index: number; onOpen: () => void; onChat: () => void; onReschedule: () => void }) {
  const meta = statusMeta(lead.status)
  const av = avatarStyle(index)
  const fu = followUpLabel(lead)
  const name = leadDisplayName(lead)
  return (
    <SwipeToAction
      right={{ icon: 'logo-whatsapp', label: 'Chat & Open', subLabel: 'Swipe right to start', color: '#1DAA50', onTrigger: onChat }}
      left={{ icon: 'calendar', label: 'Follow up', subLabel: 'Set the next follow-up', color: COLORS.purple600, onTrigger: onReschedule }}
      borderRadius={RADII.card}
    >
    <View style={{ borderWidth: 1, borderColor: COLORS.line, borderRadius: RADII.card, backgroundColor: '#fff', overflow: 'hidden', ...SHADOWS.card }}>
      <View style={{ height: 3, backgroundColor: meta.dot }} />
      <View style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <PressableScale onPress={onOpen} style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: av.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.display, fontSize: 16, color: av.text }}>{name.slice(0, 1).toUpperCase()}</Text>
          </PressableScale>
          <View style={{ flex: 1, minWidth: 0 }}>
            <PressableScale onPress={onOpen}>
              <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyBold, fontSize: 15.5, color: COLORS.ink }}>{name}</Text>
            </PressableScale>
            <Text style={{ marginTop: 2, fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink3, fontVariant: ['tabular-nums'] }}>{lead.phone}</Text>
          </View>
          <View style={{ backgroundColor: meta.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: meta.text }}>{meta.label}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 9, marginTop: 12 }}>
          <View style={{ flex: 1, backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 13, padding: 10 }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink4 }}>Interested in</Text>
            <Text style={{ marginTop: 3, fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink }} numberOfLines={1}>
              {lead.storageSizeValue > 0
                ? `${lead.storageSizeValue} sqft${lead.durationValue > 0 ? ` · ${lead.durationValue} ${lead.durationUnit}${lead.durationValue === 1 ? '' : 's'}` : ''}`
                : 'Not asked yet'}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 13, padding: 10 }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink4 }}>Next follow-up</Text>
            <Text style={{ marginTop: 3, fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: fu.overdue ? COLORS.danger : COLORS.ink }} numberOfLines={1}>
              {fu.text}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <Ionicons name="time-outline" size={12} color={COLORS.ink4} />
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink3 }}>{lastActivityOf(lead)}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <PressableScale onPress={onChat} style={{ flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: COLORS.whatsapp, alignItems: 'center', justifyContent: 'center', ...SHADOWS.whatsappGlow }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: '#fff' }}>WhatsApp</Text>
          </PressableScale>
          <PressableScale onPress={onReschedule} style={{ flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.purple200, backgroundColor: COLORS.purple100, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.purple600 }}>Follow-up</Text>
          </PressableScale>
        </View>
      </View>
    </View>
    </SwipeToAction>
  )
}

const MemoizedLeadCard = memo(LeadCard)

/** A follow-up that's due, with why: when it was due and who wrote last. */
function DueCard({ row, onOpen, onChat, onFollowUp }: { row: FollowUpLeadRow; onOpen: () => void; onChat: () => void; onFollowUp: () => void }) {
  const meta = statusMeta(row.status)
  const due = dueText(row.followUpAt)
  const name = leadDisplayName(row)
  const waitingOnUs = !!row.lastMessageAt && row.lastMessageMine === false
  return (
    <SwipeToAction
      right={{ icon: 'logo-whatsapp', label: 'Chat & Open', subLabel: 'Swipe right to start', color: '#1DAA50', onTrigger: onChat }}
      left={{ icon: 'calendar', label: 'Follow up', subLabel: 'Set the next follow-up', color: COLORS.purple600, onTrigger: onFollowUp }}
      borderRadius={RADII.card}
    >
      <View style={{ borderWidth: 1, borderColor: COLORS.line, borderRadius: RADII.card, backgroundColor: '#fff', overflow: 'hidden', ...SHADOWS.card }}>
        <View style={{ height: 3, backgroundColor: due.late ? COLORS.danger : COLORS.warnInk }} />
        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <PressableScale onPress={onOpen} style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyBold, fontSize: 15.5, color: COLORS.ink }}>{name}</Text>
              <Text style={{ marginTop: 2, fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink3, fontVariant: ['tabular-nums'] }}>{row.phone}</Text>
            </PressableScale>
            <View style={{ backgroundColor: meta.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: meta.text }}>{meta.label}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Ionicons name="calendar-outline" size={13} color={due.late ? COLORS.danger : COLORS.warnInk} />
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: due.late ? COLORS.danger : COLORS.warnInk }}>{due.text}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Ionicons name="chatbubble-ellipses-outline" size={13} color={waitingOnUs ? COLORS.success : COLORS.ink4} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: waitingOnUs ? FONTS.bodyBold : FONTS.body, fontSize: 12, color: waitingOnUs ? COLORS.success : COLORS.ink3 }}>{lastChatText(row)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <PressableScale onPress={onChat} style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: COLORS.whatsapp, alignItems: 'center', justifyContent: 'center', ...SHADOWS.whatsappGlow }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: '#fff' }}>WhatsApp</Text>
            </PressableScale>
            <PressableScale onPress={onFollowUp} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.purple200, backgroundColor: COLORS.purple100, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.purple600 }}>Follow up</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </SwipeToAction>
  )
}
