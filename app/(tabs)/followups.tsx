import { useState, useCallback } from 'react'
import { View, Text, FlatList, ActivityIndicator, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadApi, type FollowUpLeadRow } from '../../src/lib/leads'
import { leadDisplayName } from '../../src/lib/leadStatus'
import { apiError } from '../../src/lib/api'
import { notify } from '../../src/lib/alert'
import { COLORS, FONTS } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'
import ScreenHeader from '../../src/components/ScreenHeader'
import SwipeableDashboardCard from '../../src/components/SwipeableDashboardCard'
import FollowUpSheet from '../../src/components/FollowUpSheet'
import { useDashboardDismissed } from '../../src/lib/dashboardDismissed'

type FuTab = 'today' | 'upcoming' | 'overdue'
const TABS: { key: FuTab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'overdue', label: 'Overdue' },
]
const EMPTY_COPY: Record<FuTab, [string, string]> = {
  today: ['No follow-ups today 🎉', "You're all caught up."],
  upcoming: ['Nothing scheduled ahead', 'Set a follow-up from any lead.'],
  overdue: ['Nothing overdue 🎉', 'Every customer got a reply in time.'],
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function overdueLabel(iso: string | null): string {
  if (!iso) return 'Overdue'
  const hours = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 36e5))
  if (hours < 1) return 'Just overdue'
  if (hours < 24) return `${hours}h overdue`
  return `${Math.round(hours / 24)}d overdue`
}

export default function FollowUpsTab() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<FuTab>('today')
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [rescheduleLead, setRescheduleLead] = useState<{ id: string; name: string; current?: string | null } | null>(null)
  const { dismissedSet, dismiss } = useDashboardDismissed()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['follow-ups'],
    queryFn: leadApi.followUps,
    staleTime: 30_000,
  })

  const scheduleFollowUpMutation = useMutation({
    mutationFn: ({ id, iso }: { id: string; iso: string }) => leadApi.scheduleFollowUp(id, iso),
    onSuccess: () => {
      notify('Follow-up scheduled', 'The lead has been rescheduled.')
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] })
      setRescheduleLead(null)
    },
    onError: (err) => {
      notify('Could not reschedule', apiError(err))
    },
  })

  const onManualRefresh = async () => {
    setManualRefreshing(true)
    try {
      await refetch()
    } finally {
      setManualRefreshing(false)
    }
  }

  const counts = { today: data?.today.length ?? 0, upcoming: data?.upcoming.length ?? 0, overdue: data?.overdue.length ?? 0 }
  const rawList = data?.[tab] ?? []
  const list = rawList.filter((f) => !dismissedSet.has(`fu_${tab}_${f._id}`))

  const openLead = useCallback((id: string) => {
    router.push(`/leads/${id}`)
  }, [router])

  const openChat = useCallback((phone: string, name: string, leadId: string, itemKey?: string) => {
    if (itemKey) dismiss(itemKey)
    router.push({ pathname: '/whatsapp/[phone]', params: { phone, name, leadId } })
  }, [router, dismiss])

  const handleReschedule = useCallback((item: FollowUpLeadRow) => {
    setRescheduleLead({ id: item._id, name: leadDisplayName(item), current: item.followUpAt })
  }, [])

  const renderItem = useCallback(({ item, index }: { item: FollowUpLeadRow; index: number }) => {
    const itemKey = `fu_${tab}_${item._id}`
    const name = leadDisplayName(item)
    const isOverdue = tab === 'overdue' || (!!item.followUpAt && new Date(item.followUpAt).getTime() < Date.now())
    return (
      <SwipeableDashboardCard
        id={itemKey}
        index={index}
        type={isOverdue ? 'followup_overdue' : 'followup_today'}
        title={name}
        phone={item.phone}
        leadStatus={item.status}
        timeText={isOverdue ? overdueLabel(item.followUpAt) : formatTime(item.followUpAt)}
        subtitle={isOverdue ? 'Overdue follow-up' : 'Scheduled follow-up'}
        note="Tap to chat or swipe right / swipe left to reschedule"
        onChat={() => openChat(item.phone, name, item._id, itemKey)}
        onReschedule={() => handleReschedule(item)}
        onOpenDetails={() => openLead(item._id)}
      />
    )
  }, [tab, openChat, handleReschedule, openLead])

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceAlt }}>
      <ScreenHeader
        title="Follow-ups"
        right={
          <View style={{ backgroundColor: COLORS.purple50, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11.5, color: COLORS.purple600 }}>{counts.today + counts.overdue} due</Text>
          </View>
        }
      />
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <View style={{ flexDirection: 'row', gap: 4, backgroundColor: COLORS.control, borderRadius: 14, padding: 4 }}>
            {TABS.map((t) => {
              const active = tab === t.key
              const pillColors = t.key === 'overdue' ? { bg: COLORS.dangerTint, fg: COLORS.danger } : { bg: COLORS.purple100, fg: COLORS.purple600 }
              return (
                <PressableScale
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={{
                    flex: 1, height: 36, paddingHorizontal: 10, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
                    backgroundColor: active ? '#fff' : 'transparent', ...(active ? { shadowColor: COLORS.ink, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 } : {}),
                  }}
                >
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: active ? COLORS.ink : COLORS.ink3 }}>{t.label}</Text>
                  <View style={{ backgroundColor: active ? pillColors.bg : 'rgba(20,8,31,0.07)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: active ? pillColors.fg : COLORS.ink3 }}>{counts[t.key]}</Text>
                  </View>
                </PressableScale>
              )
            })}
          </View>
        </View>

        {isLoading && list.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={COLORS.purple600} />
          </View>
        ) : isError && list.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
            <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.danger, textAlign: 'center' }}>{apiError(error)}</Text>
            <PressableScale onPress={() => refetch()}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.purple600 }}>Try again</Text>
            </PressableScale>
          </View>
        ) : list.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <View style={{ width: 70, height: 70, borderRadius: 24, backgroundColor: COLORS.successTint, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={34} color={COLORS.success} />
            </View>
            <Text style={{ marginTop: 18, fontFamily: FONTS.display, fontSize: 19, color: COLORS.ink }}>{EMPTY_COPY[tab][0]}</Text>
            <Text style={{ marginTop: 6, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3, textAlign: 'center' }}>{EMPTY_COPY[tab][1]}</Text>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(f) => f._id}
            onRefresh={onManualRefresh}
            refreshing={manualRefreshing}
            contentContainerStyle={{ padding: 16 }}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews={true}
            renderItem={renderItem}
          />
        )}
      </View>

      {!!rescheduleLead && (
        <FollowUpSheet
          visible={!!rescheduleLead}
          current={rescheduleLead.current}
          title={`Reschedule: ${rescheduleLead.name}`}
          onSchedule={(iso) => scheduleFollowUpMutation.mutate({ id: rescheduleLead.id, iso })}
          onClose={() => setRescheduleLead(null)}
        />
      )}
    </View>
  )
}
