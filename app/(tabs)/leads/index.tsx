import { useEffect, useState, memo, useCallback } from 'react'
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { leadApi, type Lead } from '../../../src/lib/leads'
import { apiError } from '../../../src/lib/api'
import { LEAD_STATUS_FLOW, statusMeta, leadDisplayName } from '../../../src/lib/leadStatus'
import { COLORS, FONTS, RADII, SHADOWS, avatarStyle } from '../../../src/lib/theme'
import PressableScale from '../../../src/components/PressableScale'
import ScreenHeader from '../../../src/components/ScreenHeader'

const FILTERS: { value: string; label: string }[] = [{ value: 'all', label: 'All' }, ...LEAD_STATUS_FLOW]

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
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [manualRefreshing, setManualRefreshing] = useState(false)

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

  const {
    data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['leads', status, debouncedQ],
    queryFn: ({ pageParam }) =>
      leadApi.list({ status: status === 'all' ? undefined : status, search: debouncedQ || undefined, page: pageParam, limit: 25 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  })

  const leads = data?.pages.flatMap((p) => p.data) ?? []
  const total = data?.pages[0]?.total ?? stats?.total ?? 0

  const openChat = useCallback((lead: Lead) => {
    router.push({ pathname: '/whatsapp/[phone]', params: { phone: lead.phoneNormalized, name: leadDisplayName(lead), leadId: lead._id } })
  }, [router])

  const openLead = useCallback((leadId: string) => {
    router.push(`/leads/${leadId}`)
  }, [router])

  const renderLeadCard = useCallback(({ item, index }: { item: Lead; index: number }) => (
    <MemoizedLeadCard
      lead={item}
      index={index}
      onOpen={() => openLead(item._id)}
      onChat={() => openChat(item)}
    />
  ), [openLead, openChat])

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceAlt }}>
      <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <SafeAreaView edges={['top']}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: FONTS.display, fontSize: 26, letterSpacing: -0.5, color: COLORS.ink }}>Leads</Text>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink3 }}>{total} total</Text>
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
          </View>
        </SafeAreaView>
      </View>

      {isLoading && leads.length === 0 ? (
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
          <Text style={{ marginTop: 18, fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink }}>No leads here yet</Text>
          <Text style={{ marginTop: 6, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3, textAlign: 'center' }}>New leads assigned to you will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(l) => l._id}
          onRefresh={onManualRefresh}
          refreshing={manualRefreshing}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (hasNextPage) fetchNextPage() }}
          contentContainerStyle={{ padding: 16, gap: 11 }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={true}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={COLORS.purple600} /> : null}
          renderItem={renderLeadCard}
        />
      )}
    </View>
  )
}

function LeadCard({
  lead, index, onOpen, onChat,
}: { lead: Lead; index: number; onOpen: () => void; onChat: () => void }) {
  const meta = statusMeta(lead.status)
  const av = avatarStyle(index)
  const fu = followUpLabel(lead)
  const name = leadDisplayName(lead)
  return (
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
              {lead.storageSizeValue} sqft · {lead.durationValue} {lead.durationUnit}{lead.durationValue === 1 ? '' : 's'}
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
          <PressableScale onPress={onOpen} style={{ flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.purple200, backgroundColor: COLORS.purple100, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.purple600 }}>Follow-up</Text>
          </PressableScale>
        </View>
      </View>
    </View>
  )
}

const MemoizedLeadCard = memo(LeadCard)
