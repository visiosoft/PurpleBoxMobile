import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS } from '../../src/lib/theme'

/**
 * The four features asked for, in the order they were asked for, plus a
 * fifth for the account itself — every mobile app needs a place to sign
 * out from. Each screen this points at is real and reachable today; which
 * ones are fully built yet is tracked in PLAN.md, not hidden by leaving a
 * tab out.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.faint,
        tabBarLabelStyle: { fontFamily: FONTS.bodyMedium, fontSize: 11 },
        tabBarStyle: { borderTopColor: COLORS.line, height: 88, paddingTop: 8 },
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
  )
}
