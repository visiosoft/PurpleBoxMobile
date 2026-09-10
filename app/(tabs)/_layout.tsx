import { View, Text } from 'react-native'
import { Tabs, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { COLORS, FONTS, GRADIENT_PRIMARY, GRADIENT_PRIMARY_LOCATIONS } from '../../src/lib/theme'
import { useAuth } from '../../src/lib/auth'
import { useNotifications } from '../../src/lib/notifications'
import { leadApi } from '../../src/lib/leads'
import { LinearGradient } from 'expo-linear-gradient'

/**
 * Two different navigation trees behind one role, per the design handoff —
 * a rep and an admin are different jobs, not the same nav with an extra
 * button. Which one renders follows the *signed-in user's real role*
 * (server/src/routes/auth.js), never a client-side switch: the prototype's
 * "Switch workspace" toggle is a demo convenience over fake data, and
 * doing that for real here would be a genuine permission bypass — an
 * admin viewing "as a rep" is a real feature (a preview), but it is not
 * the same thing as a rep flipping their own nav to admin.
 *
 * Search Unit and Assistant aren't in the handoff's 5-tab CRM nav at all
 * (it doesn't know about them) — dropping them wasn't asked for, so both
 * stay reachable as Profile rows instead, the same way the handoff itself
 * makes admin's "Lead board" reachable from Profile even though it also
 * has its own tab.
 */
export default function TabsLayout() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { waiting } = useNotifications()
  const { data: stats } = useQuery({ queryKey: ['lead-stats'], queryFn: leadApi.stats, staleTime: 30_000 })

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName={isAdmin ? 'overview' : 'home'}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.purple600,
          tabBarInactiveTintColor: COLORS.ink4,
          tabBarLabelStyle: { fontFamily: FONTS.bodyBold, fontSize: 10 },
          tabBarStyle: {
            height: 76, paddingTop: 10, paddingBottom: 12,
            backgroundColor: 'rgba(255,255,255,0.96)', borderTopWidth: 1, borderTopColor: COLORS.line,
          },
        }}
      >
        {/* Home and Overview are mutually exclusive (never both visible),
            so their relative order to each other doesn't matter — only
            their shared position ahead of Leads/WhatsApp does, so whichever
            one a role sees always leads the bar. */}
        <Tabs.Screen
          name="home"
          options={{ href: isAdmin ? null : undefined, title: 'Home', tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="home-outline" /> }}
        />
        <Tabs.Screen
          name="overview"
          options={{ href: isAdmin ? undefined : null, title: 'Overview', tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="home-outline" /> }}
        />
        <Tabs.Screen
          name="leads"
          options={{
            title: 'Leads',
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="people-outline" badge={stats?.byStatus?.new ?? 0} />,
          }}
        />
        <Tabs.Screen
          name="whatsapp"
          listeners={{
            tabPress: (event) => {
              event.preventDefault()
              router.replace('/whatsapp')
            },
          }}
          options={{
            href: '/whatsapp', title: 'WhatsApp',
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="logo-whatsapp" badge={waiting} />,
          }}
        />
        <Tabs.Screen
          name="followups"
          options={{ title: 'Follow-ups', tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="time-outline" /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="person-circle-outline" /> }}
        />
        {/* Admin tools that used to have their own tab — five tabs is the
            budget, so Board and Assign moved to Profile rows instead,
            the same way Search Unit and Assistant already live there. */}
        <Tabs.Screen name="board" options={{ href: null }} />
        <Tabs.Screen name="assign" options={{ href: null }} />
        <Tabs.Screen name="units" options={{ href: null }} />
        <Tabs.Screen name="assistant" options={{ href: null }} />
      </Tabs>
    </View>
  )
}

/** The active tab's 26×3px gradient pill, flush above its icon — the one
 *  piece of the handoff's nav spec React Navigation's default tab bar has
 *  no slot for, so it's built into the icon itself. */
function TabIcon({ focused, name, badge }: { focused: boolean; name: keyof typeof Ionicons.glyphMap; badge?: number }) {
  return (
    <View style={{ alignItems: 'center', width: 40 }}>
      <View style={{ height: 3, width: 26, borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
        {focused && <LinearGradient colors={GRADIENT_PRIMARY} locations={GRADIENT_PRIMARY_LOCATIONS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />}
      </View>
      <View>
        <Ionicons name={name} size={22} color={focused ? COLORS.purple600 : COLORS.ink4} style={{ opacity: focused ? 1 : 0.9 }} />
        {!!badge && badge > 0 && (
          <View
            style={{
              position: 'absolute', top: -3, right: -9, minWidth: 15, height: 15, borderRadius: 8,
              backgroundColor: COLORS.whatsapp, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
              borderWidth: 1.5, borderColor: '#fff',
            }}
          >
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 9, color: '#fff' }}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
    </View>
  )
}
