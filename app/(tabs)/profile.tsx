import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/lib/auth'
import { confirmAction } from '../../src/lib/alert'
import { COLORS, FONTS, GRADIENT_PRIMARY, GRADIENT_PRIMARY_LOCATIONS } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'

const ROLE_META: Record<string, { label: string; hint: string }> = {
  admin: { label: 'Sales admin', hint: 'You can see all leads, assign them and monitor the team.' },
  sales_rep: { label: 'Sales representative', hint: 'You only see leads assigned to you by admin.' },
  accounts: { label: 'Accounts', hint: 'You only see leads assigned to you by admin.' },
  staff: { label: 'Staff', hint: 'You only see leads assigned to you by admin.' },
}

/**
 * Design handoff's Profile screen, minus the "Switch workspace" toggle —
 * that was a demo convenience over fake data; here the role comes from
 * the signed-in account for real, so there's nothing to switch. Search
 * Unit and Assistant aren't in the handoff's 5-tab nav at all, so they
 * live here as rows instead of being dropped, the same way the handoff
 * itself makes admin's "Lead board" a Profile row alongside its own tab.
 */
export default function ProfileTab() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'admin'
  const role = ROLE_META[user?.role ?? ''] ?? ROLE_META.sales_rep

  function confirmLogout() {
    confirmAction('Sign out', 'You can sign back in any time with the same account.', 'Sign out', () => logout(), { destructive: true })
  }

  // Only rows that do something real: no test buttons, no "coming soon".
  // Assigning leads lives on each chat's Owner field until it has a screen
  // of its own that works.
  const rows: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; badge?: string; onPress: () => void }[] = [
    { key: 'units', label: 'Unit prices & availability', icon: 'cube-outline', onPress: () => router.push('/units') },
    { key: 'assistant', label: 'Assistant', icon: 'sparkles-outline', onPress: () => router.push('/assistant') },
    ...(isAdmin ? [
      { key: 'board', label: 'Lead board', icon: 'grid-outline' as const, onPress: () => router.push('/board') },
    ] : []),
    { key: 'signout', label: 'Sign out', icon: 'log-out-outline', onPress: confirmLogout },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <View style={{ flex: 1 }}>
        <LinearGradient
          colors={GRADIENT_PRIMARY}
          locations={GRADIENT_PRIMARY_LOCATIONS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: 56, paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONTS.display, fontSize: 23, color: COLORS.purple600 }}>
                {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.display, fontSize: 22, color: '#fff', letterSpacing: -0.4 }} numberOfLines={1}>{user?.name || 'Unknown'}</Text>
              <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: 'rgba(255,255,255,0.82)', marginTop: 3 }} numberOfLines={1}>
                {role.label} · PurpleBox Storage
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 15 }}>
            {rows.map((r, i) => (
              <PressableScale
                key={r.key}
                onPress={r.onPress}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
                  borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: COLORS.lineSoft,
                }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: COLORS.purple50, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={r.icon} size={16} color={COLORS.purple600} />
                </View>
                <Text style={{ flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.ink }}>{r.label}</Text>
                {r.badge ? (
                  <View style={{ backgroundColor: COLORS.purple100, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: COLORS.purple600 }}>{r.badge}</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={COLORS.chevron} />
              </PressableScale>
            ))}
          </View>
          <Text style={{ textAlign: 'center', fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink4, marginTop: 20 }}>
            PurpleBox CRM · v2.0 · Al Quoz 2, Dubai
          </Text>
        </View>
      </View>
    </View>
  )
}
