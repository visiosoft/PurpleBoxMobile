import { View, Text, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/lib/auth'
import { COLORS, FONTS, HERO_GRADIENT } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'
import AppHeader from '../../src/components/AppHeader'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  sales_rep: 'Sales Rep',
  accounts: 'Accounts',
  staff: 'Staff',
}

/**
 * The one fully real screen outside login in this first pass — every app
 * needs a way to actually sign out and see whose account is signed in,
 * so this exists now rather than waiting for the four feature tabs.
 */
export default function ProfileTab() {
  const { user, logout } = useAuth()

  function confirmLogout() {
    Alert.alert('Sign out', 'You can sign back in any time with the same account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ])
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <AppHeader title="Profile" />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <LinearGradient
            colors={HERO_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, padding: 22, marginBottom: 20, shadowColor: COLORS.brandDark, shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 22, color: '#fff' }}>
                  {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.display, fontSize: 19, color: '#fff', letterSpacing: -0.3 }} numberOfLines={1}>{user?.name || 'Unknown'}</Text>
                <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 }} numberOfLines={1}>{user?.email}</Text>
                <View style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: '#fff' }}>
                    {ROLE_LABEL[user?.role ?? ''] || user?.role}
                  </Text>
                </View>
              </View>
            </View>
          </LinearGradient>

          <PressableScale
            onPress={confirmLogout}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 52, borderRadius: 16, borderWidth: 1, borderColor: COLORS.badBg, backgroundColor: '#fff',
            }}
          >
            <Ionicons name="log-out-outline" size={18} color={COLORS.bad} />
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.bad }}>Sign out</Text>
          </PressableScale>

          <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.faint, textAlign: 'center', marginTop: 24 }}>
            PurpleBox · Same account as office.purplebox.ae
          </Text>
        </View>
      </SafeAreaView>
    </View>
  )
}
