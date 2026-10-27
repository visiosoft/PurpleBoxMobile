import { useCallback, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../src/lib/auth'
import { assistantApi } from '../../src/lib/assistant'
import { staffAppApi, AED, versus, SOURCE_LABEL } from '../../src/lib/staffApp'
import { apiError } from '../../src/lib/api'
import { COLORS, FONTS, GRADIENT_ADMIN, GRADIENT_ADMIN_LOCATIONS, RADII, SHADOWS } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'
import AskAiBar, { AiSheet } from '../../src/components/AskAiBar'

/**
 * The admin's first screen: the business today, against yesterday.
 * Units booked, leads in, cash collected and occupancy up top; then what
 * needs the admin (unassigned leads, customers waiting, follow-ups the team
 * missed); then where today's leads came from and what was booked.
 * Figures from GET /staff-app/admin/today.
 */

const ADMIN_SUGGESTIONS = [
  'How did we do today compared with last week?',
  'Which rep has the most missed follow-ups, and who are they?',
  'Who is waiting longest for a reply?',
  'Which contracts end this week and have not renewed?',
]

export default function OverviewTab() {
  const router = useRouter()
  const { user } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const [aiQuestion, setAiQuestion] = useState<string | null>(null)

  const { data: t, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-today'], queryFn: staffAppApi.today, staleTime: 30_000, refetchInterval: 120_000,
  })
  const { data: insight } = useQuery({ queryKey: ['admin-insight'], queryFn: assistantApi.adminInsight, staleTime: 5 * 60_000 })

  useFocusEffect(useCallback(() => { refetch() }, [refetch]))

  async function onRefresh() {
    setRefreshing(true)
    try { await refetch() } finally { setRefreshing(false) }
  }

  const firstName = (user?.name || '').split(' ')[0]
  const sourceMax = Math.max(1, ...(t?.leads.bySource ?? []).map((s) => s.n))

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <LinearGradient
        colors={GRADIENT_ADMIN}
        locations={GRADIENT_ADMIN_LOCATIONS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.4, color: '#fff' }}>Today{firstName ? `, ${firstName}` : ''}</Text>
              <Text style={{ marginTop: 4, fontFamily: FONTS.body, fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>
                {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            </View>
            <PressableScale
              onPress={() => router.push('/customers')}
              style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="search" size={18} color="#fff" />
            </PressableScale>
          </View>
          <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
            <AskAiBar tone="glass" context={{ screen: 'Admin today' }} suggestions={ADMIN_SUGGESTIONS} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {isLoading && !t ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.purple600} /></View>
      ) : isError && !t ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.danger, textAlign: 'center' }}>{apiError(error)}</Text>
          <PressableScale onPress={() => refetch()}><Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.purple600 }}>Try again</Text></PressableScale>
        </View>
      ) : t ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.purple600]} tintColor={COLORS.purple600} />}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <BigTile icon="key-outline" label="Units booked" value={String(t.booked.unitsToday)} sub={versus(t.booked.today, t.booked.yesterday)} />
            <BigTile icon="person-add-outline" label="Leads captured" value={String(t.leads.today)} sub={versus(t.leads.today, t.leads.yesterday)} />
            <BigTile icon="cash-outline" label="Collected" value={AED(t.collected.today)} sub={versus(t.collected.today, t.collected.yesterday, 'AED ')} />
            <BigTile icon="cube-outline" label="Occupancy" value={`${t.occupancy.pct}%`} sub={`${t.occupancy.available} units free`} onPress={() => router.push('/units')} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SmallTile label="Move-ins" value={t.moveIns} />
            <SmallTile label="Move-outs" value={t.moveOuts} />
            <SmallTile label="Site visits" value={t.visitsToday} />
          </View>

          {(t.unassigned > 0 || t.waitingForReply > 0 || t.missedFollowUps > 0) && (
            <View>
              <SectionTitle>Needs you</SectionTitle>
              <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, ...SHADOWS.card }}>
                {[
                  t.unassigned > 0 && { key: 'u', icon: 'person-outline' as const, tint: COLORS.purple600, text: `${t.unassigned} ${t.unassigned === 1 ? 'lead has' : 'leads have'} no owner`, go: () => router.push('/assign') },
                  t.waitingForReply > 0 && { key: 'w', icon: 'logo-whatsapp' as const, tint: COLORS.success, text: `${t.waitingForReply} ${t.waitingForReply === 1 ? 'customer' : 'customers'} waiting over an hour for a reply`, go: () => router.push('/whatsapp') },
                  t.missedFollowUps > 0 && { key: 'm', icon: 'alert-circle-outline' as const, tint: COLORS.danger, text: `${t.missedFollowUps} missed follow-ups across the team`, go: () => router.push('/team') },
                ].filter(Boolean).map((row, i) => {
                  const r = row as { key: string; icon: keyof typeof Ionicons.glyphMap; tint: string; text: string; go: () => void }
                  return (
                    <PressableScale key={r.key} onPress={r.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.lineSoft }}>
                      <Ionicons name={r.icon} size={18} color={r.tint} />
                      <Text style={{ flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 13.5, color: COLORS.ink }}>{r.text}</Text>
                      <Ionicons name="chevron-forward" size={16} color={COLORS.chevron} />
                    </PressableScale>
                  )
                })}
              </View>
            </View>
          )}

          {t.booked.list.length > 0 && (
            <View>
              <SectionTitle>Booked today</SectionTitle>
              <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, ...SHADOWS.card }}>
                {t.booked.list.map((c, i) => (
                  <View key={c._id} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.lineSoft }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink }}>{c.customer || c.contractNo}</Text>
                      {c.value > 0 && <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink }}>{AED(c.value)}</Text>}
                    </View>
                    <Text style={{ marginTop: 3, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>
                      Unit {c.unitNumber}{c.units > 1 ? ` +${c.units - 1}` : ''}{c.sizeSqf ? ` · ${c.sizeSqf} sq ft` : ''}{c.rep ? ` · ${c.rep}` : ''} · {c.status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {t.leads.bySource.length > 0 && (
            <View>
              <SectionTitle>Where today’s leads came from</SectionTitle>
              <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 14, gap: 10, ...SHADOWS.card }}>
                {t.leads.bySource.map((s) => (
                  <View key={s.source}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink }}>{SOURCE_LABEL[s.source] ?? s.source}</Text>
                      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink }}>{s.n}</Text>
                    </View>
                    <View style={{ marginTop: 5, height: 6, borderRadius: 3, backgroundColor: COLORS.surfaceAlt, overflow: 'hidden' }}>
                      <View style={{ width: `${Math.round((s.n / sourceMax) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: COLORS.purple600 }} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Grounded in figures computed server-side (adminInsight.js); the
              model only picks which one matters most and phrases it. */}
          {insight && (
            <View style={{ padding: 18, borderRadius: RADII.card, backgroundColor: COLORS.ink }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="sparkles" size={13} color={COLORS.brandTint} />
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.brandTint }}>AI insight</Text>
              </View>
              <Text style={{ fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.3, color: '#fff' }}>{insight.headline}</Text>
              <Text style={{ marginTop: 6, fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 19, color: 'rgba(255,255,255,0.78)' }}>{insight.message}</Text>
              {!!insight.ctaLabel && (
                <PressableScale
                  onPress={() => setAiQuestion(insight.ctaQuery || insight.ctaLabel!)}
                  style={{ marginTop: 14, alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 16, height: 38, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                >
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink }}>{insight.ctaLabel}</Text>
                  <Ionicons name="arrow-forward" size={14} color={COLORS.ink} />
                </PressableScale>
              )}
            </View>
          )}
        </ScrollView>
      ) : null}

      <AiSheet visible={!!aiQuestion} initialQuestion={aiQuestion || undefined} onClose={() => setAiQuestion(null)} context={{ screen: 'Admin today' }} suggestions={ADMIN_SUGGESTIONS} />
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink3, marginBottom: 10 }}>{children}</Text>
  )
}

function BigTile({ icon, label, value, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; sub: string; onPress?: () => void }) {
  const up = sub.startsWith('+')
  const down = sub.startsWith('−')
  return (
    <PressableScale
      onPress={onPress ?? (() => {})}
      disabled={!onPress}
      style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 14, ...SHADOWS.card }}
    >
      <Ionicons name={icon} size={18} color={COLORS.purple600} />
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 10, fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink }}>{value}</Text>
      <Text style={{ marginTop: 2, fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink3 }}>{label}</Text>
      <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: FONTS.bodyBold, fontSize: 11, color: up ? COLORS.success : down ? COLORS.danger : COLORS.ink4 }}>{sub}</Text>
    </PressableScale>
  )
}

function SmallTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, paddingVertical: 12, alignItems: 'center' }}>
      <Text style={{ fontFamily: FONTS.display, fontSize: 20, color: value > 0 ? COLORS.ink : COLORS.ink4 }}>{value}</Text>
      <Text style={{ marginTop: 2, fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.ink3 }}>{label}</Text>
    </View>
  )
}
