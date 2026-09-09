import { Stack } from 'expo-router'
import { COLORS, FONTS } from '../../../src/lib/theme'

/**
 * A stack nested inside the WhatsApp tab, not a new top-level route — so
 * opening a chat pushes over the list (native back gesture, list still
 * behind it) without leaving the tab bar or tripping the root RouteGuard,
 * which only cares whether the first segment is "(tabs)".
 */
export default function WhatsAppStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="[phone]"
        options={{
          headerShown: true,
          headerBackTitle: 'Back',
          headerTintColor: COLORS.brand,
          headerTitleStyle: { fontFamily: FONTS.bodyBold, color: COLORS.ink },
          headerStyle: { backgroundColor: COLORS.paper },
          headerShadowVisible: false,
        }}
      />
    </Stack>
  )
}
