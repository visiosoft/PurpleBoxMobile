import { View, Text, ScrollView, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { leadApi } from '../../src/lib/leads'
import { LEAD_STATUS_FLOW } from '../../src/lib/leadStatus'
import { statusMeta } from '../../src/lib/leadStatus'
import { COLORS, FONTS } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'
import ScreenHeader from '../../src/components/ScreenHeader'

/**
 * Kanban lead board — Phase 6 will make each column horizontally
 * scrollable with tap-to-advance cards; for now, a real per-status
 * count list (from leadApi.stats) that's already useful for triage.
 */
export default function BoardTab() {
  const router = useRouter()
  const { data: stats, isLoading } = useQuery({ queryKey: ['lead-stats'], queryFn: leadApi.stats, staleTime: 30_000 })

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <ScreenHeader title="Lead board" />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={COLORS.purple600} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
            {LEAD_STATUS_FLOW.map(({ value }) => {
              const meta = statusMeta(value)
              const count = stats?.byStatus?.[value] ?? 0
              return (
                <PressableScale
                  key={value}
                  onPress={() => router.push('/leads')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, padding: 14 }}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: meta.dot }} />
                  <Text style={{ flex: 1, fontFamily: FONTS.bodyBold, fontSize: 14.5, color: COLORS.ink }}>{meta.label}</Text>
                  <View style={{ backgroundColor: meta.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: meta.text }}>{count}</Text>
                  </View>
                </PressableScale>
              )
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  )
}
