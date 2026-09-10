import { View, Text } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, HERO_GRADIENT } from '../lib/theme'
import { useAppChrome } from '../lib/appChrome'
import { useNotifications } from '../lib/notifications'
import PressableScale from './PressableScale'

/**
 * The chrome every tab screen shares: brand mark, section title, the menu
 * that opens the drawer, the bell that opens the notification panel. A
 * gradient rather than a flat fill — the one place in the app that gets to
 * announce the brand instead of staying out of the way of the content.
 */
export default function AppHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets()
  const { openDrawer, openNotifications } = useAppChrome()
  const { count } = useNotifications()

  return (
    <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}>
        <PressableScale
          onPress={openDrawer}
          hitSlop={10}
          style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' }}
        >
          <Ionicons name="menu" size={19} color="#fff" />
        </PressableScale>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.brandDark }}>P</Text>
          </View>
          <Text numberOfLines={1} style={{ fontFamily: FONTS.display, fontSize: 17, color: '#fff', letterSpacing: -0.3 }}>
            {title}
          </Text>
        </View>

        <PressableScale
          onPress={openNotifications}
          hitSlop={10}
          style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' }}
        >
          <Ionicons name="notifications-outline" size={18} color="#fff" />
          {count > 0 && (
            <View
              style={{
                position: 'absolute', top: 3, right: 4, minWidth: 15, height: 15, borderRadius: 8,
                backgroundColor: '#FF4D4F', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
                borderWidth: 1.5, borderColor: COLORS.brandDark,
              }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 9, color: '#fff' }}>{count > 9 ? '9+' : count}</Text>
            </View>
          )}
        </PressableScale>
      </View>
    </LinearGradient>
  )
}
