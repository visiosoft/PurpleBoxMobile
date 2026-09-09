import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { COLORS, FONTS } from '../lib/theme'

/**
 * A stand-in for a tab whose real screen hasn't been built yet — see
 * PLAN.md for the build order. Deliberately not a blank tab: naming what's
 * coming here, in the app itself, is more honest than a tab that's present
 * but silently does nothing.
 */
export default function ComingSoon({ icon, title, blurb }: { icon: keyof typeof Ionicons.glyphMap; title: string; blurb: string }) {
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: COLORS.paper }}>
      <View className="flex-1 items-center justify-center px-10">
        <View
          className="w-16 h-16 rounded-full items-center justify-center mb-5"
          style={{ backgroundColor: COLORS.brandTint }}
        >
          <Ionicons name={icon} size={28} color={COLORS.brand} />
        </View>
        <Text style={{ fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink, marginBottom: 8 }}>{title}</Text>
        <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 20 }}>
          {blurb}
        </Text>
      </View>
    </SafeAreaView>
  )
}
