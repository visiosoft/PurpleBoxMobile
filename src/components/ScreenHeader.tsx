import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, FONTS } from '../lib/theme'

/**
 * The handoff's plain white sticky header (Leads/WhatsApp inbox screens):
 * bold Bricolage title left, optional right-side slot, hairline bottom
 * border. Used as-is for screens the 18-screen spec doesn't cover
 * (Search Unit, Assistant) and as the base for spec screens until their
 * full redesign lands.
 */
export default function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink, letterSpacing: -0.4 }}>{title}</Text>
        {right}
      </View>
    </View>
  )
}
