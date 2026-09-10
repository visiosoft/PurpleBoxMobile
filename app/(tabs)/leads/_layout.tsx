import { Stack } from 'expo-router'
import { COLORS, FONTS } from '../../../src/lib/theme'

export default function LeadsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="[id]"
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
