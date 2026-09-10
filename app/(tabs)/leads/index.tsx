import { useEffect, useState } from 'react'
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { leadApi, type Lead } from '../../../src/lib/leads'
import { apiError } from '../../../src/lib/api'
import { LEAD_STATUS_FLOW, statusLabel, statusTone, TEMPERATURE_LABEL } from '../../../src/lib/leadStatus'
import { COLORS, FONTS } from '../../../src/lib/theme'
import Avatar from '../../../src/components/Avatar'

const FILTERS: { value: string; label: string }[] = [{ value: 'all', label: 'All' }, ...LEAD_STATUS_FLOW]

function timeAgo(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default function LeadsListScreen() {
  const router = useRouter()
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const { data: stats } = useQuery({ queryKey: ['lead-stats'], queryFn: leadApi.stats, staleTime: 30_000 })

  const {
    data, isLoading, isError, error, refetch, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['leads', status, debouncedQ],
    queryFn: ({ pageParam }) =>
      leadApi.list({ status: status === 'all' ? undefined : status, search: debouncedQ || undefined, page: pageParam, limit: 25 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  })

  const leads = data?.pages.flatMap((p) => p.data) ?? []

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.paper }} edges={['top']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 }}>
        <Text style={{ fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink }}>Leads</Text>

        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff',
            borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 12, height: 42,
          }}
        >
          <Ionicons name="search" size={17} color={COLORS.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search leads"
            placeholderTextColor={COLORS.faint}
            style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink }}
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={COLORS.faint} />
            </Pressable>
          )}
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(f) => f.value}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const active = status === item.value
            const count = item.value === 'all' ? stats?.total : stats?.byStatus?.[item.value]
            return (
              <Pressable
                onPress={() => setStatus(item.value)}
                style={{
                  paddingHorizontal: 14, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? COLORS.brand : '#fff', borderWidth: active ? 0 : 1, borderColor: COLORS.line,
                  flexDirection: 'row', gap: 5,
                }}
              >
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: active ? '#fff' : COLORS.muted }}>{item.label}</Text>
                {count != null && (
                  <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: active ? 'rgba(255,255,255,0.85)' : COLORS.faint }}>{count}</Text>
                )}
              </Pressable>
            )
          }}
        />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.bad, textAlign: 'center' }}>{apiError(error)}</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.brand }}>Try again</Text>
          </Pressable>
        </View>
      ) : leads.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="people-outline" size={40} color={COLORS.faint} />
          <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.muted, marginTop: 10 }}>No leads here</Text>
        </View>
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(l) => l._id}
          onRefresh={refetch}
          refreshing={isFetching && !isFetchingNextPage}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (hasNextPage) fetchNextPage() }}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={COLORS.brand} /> : null}
          renderItem={({ item }) => <LeadRow lead={item} onPress={() => router.push(`/leads/${item._id}`)} />}
        />
      )}
    </SafeAreaView>
  )
}

function LeadRow({ lead, onPress }: { lead: Lead; onPress: () => void }) {
  const tone = statusTone(lead.status)
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
      <Avatar name={lead.fullName} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink, flex: 1, marginRight: 8 }}>
            {lead.fullName}
          </Text>
          {!!lead.createdAt && <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.faint }}>{timeAgo(lead.createdAt)}</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: tone.fg }}>{statusLabel(lead.status)}</Text>
          </View>
          {!!lead.temperature && (
            <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.muted }}>{TEMPERATURE_LABEL[lead.temperature]}</Text>
          )}
          <Text numberOfLines={1} style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted, flex: 1 }}>{lead.phone}</Text>
        </View>
      </View>
    </Pressable>
  )
}
