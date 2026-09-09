import { View, Text } from 'react-native'
import { COLORS, FONTS } from '../lib/theme'

/** The same initials-in-a-circle mark used on the web app's chat sidebar and
 *  this app's own Profile tab — one visual identity for "a person", used
 *  everywhere a contact needs representing without a real photo. */
export default function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase()
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.brandTint,
      }}
    >
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: size * 0.4, color: COLORS.brandDark }}>{initial}</Text>
    </View>
  )
}
