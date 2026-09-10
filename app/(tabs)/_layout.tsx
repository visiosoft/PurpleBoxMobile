import { View } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS } from '../../src/lib/theme'
import { AppChromeProvider, useAppChrome } from '../../src/lib/appChrome'
import AppDrawer from '../../src/components/AppDrawer'
import NotificationPanel from '../../src/components/NotificationPanel'

/**
 * The four features asked for, in the order they were asked for, plus a
 * fifth for the account itself — every mobile app needs a place to sign
 * out from. Each screen this points at is real and reachable today; which
 * ones are fully built yet is tracked in PLAN.md, not hidden by leaving a
 * tab out.
 *
 * The drawer and notification panel are mounted once here, above the tab
 * navigator, so they overlay whichever tab is active rather than each
 * screen owning its own copy.
 */
export default function TabsLayout() {
  return (
    <AppChromeProvider>
      <TabsLayoutInner />
    </AppChromeProvider>
  )
}

function TabsLayoutInner() {
  const { drawerOpen, closeDrawer, notifOpen, closeNotifications } = useAppChrome()

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.brand,
          tabBarInactiveTintColor: COLORS.faint,
          tabBarLabelStyle: { fontFamily: FONTS.bodyMedium, fontSize: 11 },
          tabBarStyle: {
            borderTopWidth: 0, height: 88, paddingTop: 10, backgroundColor: '#fff',
            shadowColor: COLORS.ink, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12,
          },
        }}
      >
        <Tabs.Screen
          name="whatsapp"
          options={{ title: 'WhatsApp', tabBarIcon: ({ color, size }) => <Ionicons name="logo-whatsapp" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="leads"
          options={{ title: 'Leads', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="units"
          options={{ title: 'Units', tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="assistant"
          options={{ title: 'Assistant', tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} /> }}
        />
      </Tabs>

      <AppDrawer open={drawerOpen} onClose={closeDrawer} />
      <NotificationPanel open={notifOpen} onClose={closeNotifications} />
    </View>
  )
}
