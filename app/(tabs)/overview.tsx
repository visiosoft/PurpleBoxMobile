import { View, Text, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../src/lib/auth'
import { leadApi } from '../../src/lib/leads'
import { COLORS, FONTS, GRADIENT_ADMIN, GRADIENT_ADMIN_LOCATIONS, RADII, SHADOWS } from '../../src/lib/theme'
import CommandBarSection from '../../src/components/CommandBarSection'

/**
 * Admin's Sales overview — placeholder for Phase 6 (team roster, per-rep
 * won-rate, unassigned queue). Real total/won/unassigned numbers now
 * (leadApi.stats already returns them), full team breakdown later.
 */
export default function OverviewTab() {
  const { user } = useAuth()
  const { data: stats } = useQuery({ queryKey: ['lead-stats'], queryFn: leadApi.stats, staleTime: 30_000 })

  const total = stats?.total ?? 0
  const won = stats?.byStatus?.won ?? 0
  const lost = stats?.byStatus?.lost ?? 0
  const active = total - won - lost
  const tiles = [
    { label: 'Total leads', value: total },
    { label: 'Unassigned', value: stats?.unassigned ?? 0 },
    { label: 'Active leads', value: active },
    { label: 'Won', value: won },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <LinearGradient
        colors={GRADIENT_ADMIN}
        locations={GRADIENT_ADMIN_LOCATIONS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 40, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
            <Text style={{ fontFamily: FONTS.display, fontSize: 24, letterSpacing: -0.4, color: '#fff' }}>Sales overview</Text>
            <Text style={{ marginTop: 7, fontFamily: FONTS.body, fontSize: 13.5, color: 'rgba(255,255,255,0.82)' }}>
              {user?.name ? `Welcome back, ${user.name.split(' ')[0]}.` : 'How the team is doing today.'}
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={{ flex: 1, marginTop: -24, paddingHorizontal: 16, paddingTop: 8 }}>
        <CommandBarSection>
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {tiles.map((t) => (
                <View key={t.label} style={{ width: '47%', backgroundColor: '#fff', borderRadius: RADII.card, padding: 14, ...SHADOWS.card }}>
                  <Text style={{ fontFamily: FONTS.display, fontSize: 26, letterSpacing: -0.5, color: COLORS.ink }}>{t.value}</Text>
                  <Text style={{ marginTop: 4, fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink3 }}>{t.label}</Text>
                </View>
              ))}
            </View>

            <View style={{ marginTop: 20, padding: 18, borderRadius: RADII.card, backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center' }}>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink3, textAlign: 'center', lineHeight: 19 }}>
                Per-rep performance and team roster are coming soon here.
              </Text>
            </View>
          </ScrollView>
        </CommandBarSection>
      </View>
    </View>
  )
}
