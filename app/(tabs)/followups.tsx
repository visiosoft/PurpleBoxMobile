import { useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { leadApi, type FollowUpLeadRow } from '../../src/lib/leads'
import { statusMeta } from '../../src/lib/leadStatus'
import { apiError } from '../../src/lib/api'
import { notify } from '../../src/lib/alert'
import { COLORS, FONTS } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'
import ScreenHeader from '../../src/components/ScreenHeader'

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

function slotTime(iso: string | null): { hh: string; mer: string } {
  if (!iso) return { hh: '--', mer: '' }
  const [time, mer] = new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).split(' ')
  return { hh: time, mer: mer ?? '' }
}
function dayLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const diffDays = Math.round((d.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
}
function overdueLabel(iso: string | null): string {
  if (!iso) return ''
  const hours = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 36e5))
  if (hours < 24) return `${hours}h overdue`
  return `${Math.round(hours / 24)}d overdue`
}

export default function FollowUpsTab() {
  const router = useRouter()
  const [tab, setTab] = useState<FuTab>('today')

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['follow-ups'],
    queryFn: leadApi.followUps,
    staleTime: 30_000,
  })

  const counts = { today: data?.today.length ?? 0, upcoming: data?.upcoming.length ?? 0, overdue: data?.overdue.length ?? 0 }
  const list = data?.[tab] ?? []

  function openLead(id: string) {
    router.push(`/leads/${id}`)
  }
  function openChat(phone: string, name: string, leadId: string) {
    router.push({ pathname: '/whatsapp/[phone]', params: { phone, name, leadId } })
  }
  function call(phone: string) {
    Linking.openURL(`tel:${phone}`).catch(() => notify('Could not start a call'))
  }

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
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
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
                    flex: 1, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
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

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={COLORS.purple600} />
          </View>
        ) : isError ? (
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
            onRefresh={refetch}
            refreshing={isFetching}
            contentContainerStyle={{ padding: 16, gap: 11 }}
            renderItem={({ item }) => <FollowUpCard f={item} onOpen={openLead} onChat={openChat} onCall={call} />}
          />
        )}
      </SafeAreaView>
    </View>
  )
}

function FollowUpCard({
  f, onOpen, onChat, onCall,
}: { f: FollowUpLeadRow; onOpen: (id: string) => void; onChat: (phone: string, name: string, leadId: string) => void; onCall: (phone: string) => void }) {
  const overdue = !!f.followUpAt && new Date(f.followUpAt).getTime() < Date.now()
  const { hh, mer } = slotTime(f.followUpAt)
  const meta = statusMeta(f.status)
  return (
    <View style={{ flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: '#fff', padding: 14 }}>
      <View style={{ width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: overdue ? COLORS.dangerTint : COLORS.purple50 }}>
        <Text style={{ fontFamily: FONTS.display, fontSize: 15, lineHeight: 16, color: overdue ? COLORS.danger : COLORS.purple600, textAlign: 'center' }}>{hh}</Text>
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 9.5, marginTop: 2, letterSpacing: 0.5, color: overdue ? COLORS.danger : COLORS.purple600 }}>{mer}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <PressableScale onPress={() => onOpen(f._id)}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink }}>{f.fullName}</Text>
          </PressableScale>
          {overdue && (
            <View style={{ backgroundColor: COLORS.dangerTint, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10, color: COLORS.danger }}>{overdueLabel(f.followUpAt)}</Text>
            </View>
          )}
        </View>
        <Text style={{ marginTop: 4, fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink2 }}>{meta.label}</Text>
        <Text style={{ marginTop: 5, fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink4 }}>{dayLabel(f.followUpAt)}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
          <PressableScale onPress={() => onChat(f.phone, f.fullName, f._id)} style={{ flex: 1, height: 38, borderRadius: 12, backgroundColor: COLORS.whatsapp, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: '#fff' }}>WhatsApp</Text>
          </PressableScale>
          <PressableScale onPress={() => onCall(f.phone)} style={{ paddingHorizontal: 14, height: 38, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.ink2 }}>Call</Text>
          </PressableScale>
        </View>
      </View>
    </View>
  )
}
