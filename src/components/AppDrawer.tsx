import { View, Text, Pressable, Alert, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Animated, { cubicBezier } from 'react-native-reanimated'
import { COLORS, FONTS } from '../lib/theme'
import { useAuth } from '../lib/auth'
import PressableScale from './PressableScale'

const EASE_SHEET = cubicBezier(0.32, 0.72, 0, 1)
const DRAWER_W = 288

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', sales_rep: 'Sales Rep', accounts: 'Accounts', staff: 'Staff',
}

const SECTIONS: { icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[] = [
  { icon: 'logo-whatsapp', label: 'WhatsApp', href: '/whatsapp' },
  { icon: 'people-outline', label: 'Leads', href: '/leads' },
  { icon: 'cube-outline', label: 'Search Unit', href: '/units' },
  { icon: 'sparkles-outline', label: 'Assistant', href: '/assistant' },
]

/**
 * Secondary navigation and the account — always mounted (never a RN
 * `Modal`, whose own show/hide has no slide-in of its own to animate),
 * shown or hidden with the same CSS-transition pattern as everything
 * else: transform off-screen, opacity on the scrim, both state-driven.
 */
export default function AppDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user, logout } = useAuth()

  function go(href: string) {
    onClose()
    router.push(href)
  }

  function confirmLogout() {
    onClose()
    Alert.alert('Sign out', 'You can sign back in any time with the same account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ])
  }

  return (
    <View pointerEvents={open ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      <Animated.View
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,8,31,0.45)',
          opacity: open ? 1 : 0, transitionProperty: 'opacity', transitionDuration: '200ms',
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: DRAWER_W,
          backgroundColor: COLORS.paper, paddingTop: insets.top,
          transform: [{ translateX: open ? 0 : -DRAWER_W - 20 }],
          transitionProperty: 'transform', transitionDuration: '240ms', transitionTimingFunction: EASE_SHEET,
          shadowColor: COLORS.ink, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 8, height: 0 }, elevation: 12,
        }}
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 18, color: '#fff' }}>
              {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 16, color: COLORS.ink }}>{user?.name || 'Unknown'}</Text>
          <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.muted, marginTop: 2 }}>{user?.email}</Text>
          {!!user?.role && (
            <View style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: COLORS.brandTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: COLORS.brandDark }}>{ROLE_LABEL[user.role] || user.role}</Text>
            </View>
          )}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}>
          <Text style={DRAWER_GROUP_LABEL}>SECTIONS</Text>
          {SECTIONS.map((s) => (
            <PressableScale key={s.href} onPress={() => go(s.href)} style={DRAWER_ROW}>
              <Ionicons name={s.icon} size={18} color={COLORS.brandDark} style={{ width: 24 }} />
              <Text style={DRAWER_ROW_LABEL}>{s.label}</Text>
            </PressableScale>
          ))}

          <View style={{ height: 1, backgroundColor: COLORS.line, marginVertical: 12 }} />

          <Text style={DRAWER_GROUP_LABEL}>MORE</Text>
          <PressableScale onPress={() => go('/profile')} style={DRAWER_ROW}>
            <Ionicons name="person-circle-outline" size={18} color={COLORS.muted} style={{ width: 24 }} />
            <Text style={DRAWER_ROW_LABEL}>Profile</Text>
          </PressableScale>
          <PressableScale onPress={() => Alert.alert('Settings', 'Coming soon.')} style={DRAWER_ROW}>
            <Ionicons name="settings-outline" size={18} color={COLORS.muted} style={{ width: 24 }} />
            <Text style={DRAWER_ROW_LABEL}>Settings</Text>
          </PressableScale>
          <PressableScale onPress={() => Alert.alert('Help & Support', 'Reach the office team the same way you always have — this is just a placeholder for now.')} style={DRAWER_ROW}>
            <Ionicons name="help-circle-outline" size={18} color={COLORS.muted} style={{ width: 24 }} />
            <Text style={DRAWER_ROW_LABEL}>Help & Support</Text>
          </PressableScale>
        </ScrollView>

        <View style={{ paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 16), borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 10 }}>
          <PressableScale onPress={confirmLogout} style={DRAWER_ROW}>
            <Ionicons name="log-out-outline" size={18} color={COLORS.bad} style={{ width: 24 }} />
            <Text style={[DRAWER_ROW_LABEL, { color: COLORS.bad }]}>Sign out</Text>
          </PressableScale>
        </View>
      </Animated.View>
    </View>
  )
}

const DRAWER_GROUP_LABEL = { fontFamily: FONTS.bodyBold, fontSize: 10.5, color: COLORS.faint, letterSpacing: 0.6, marginTop: 14, marginBottom: 6, marginLeft: 10 } as const
const DRAWER_ROW = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 10 }
const DRAWER_ROW_LABEL = { fontFamily: FONTS.bodyMedium, fontSize: 14.5, color: COLORS.ink }
