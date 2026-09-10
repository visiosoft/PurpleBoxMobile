import { View, Text, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/lib/auth'
import { COLORS, FONTS } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'

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
    <SafeAreaView className="flex-1" style={{ backgroundColor: COLORS.paper }}>
      <View className="px-6 pt-4">
        <Text style={{ fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink, marginBottom: 20 }}>Profile</Text>

        <View
          className="rounded-3xl p-5 mb-5"
          style={{ backgroundColor: '#fff', shadowColor: COLORS.ink, shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 1 }}
        >
          <View className="flex-row items-center gap-3">
            <View className="w-14 h-14 rounded-full items-center justify-center" style={{ backgroundColor: COLORS.brand }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 20, color: '#fff' }}>
                {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1 ml-1">
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 16, color: COLORS.ink }}>{user?.name || 'Unknown'}</Text>
              <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.muted }}>{user?.email}</Text>
            </View>
            <View className="rounded-full px-3 py-1" style={{ backgroundColor: COLORS.brandTint }}>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.brandDark }}>
                {ROLE_LABEL[user?.role ?? ''] || user?.role}
              </Text>
            </View>
          </View>
        </View>

        <PressableScale
          onPress={confirmLogout}
          style={{ height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.badBg, backgroundColor: '#fff' }}
        >
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.bad }}>Sign out</Text>
        </PressableScale>
      </View>
    </SafeAreaView>
  )
}
