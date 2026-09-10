import { View, Text, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Animated, { cubicBezier } from 'react-native-reanimated'
import { COLORS, FONTS } from '../lib/theme'
import { useNotifications } from '../lib/notifications'
import PressableScale from './PressableScale'

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1)

/**
 * A popover, not a modal screen — it scales in from its trigger (the bell,
 * top-right) rather than from center, and reports what's actually true
 * right now: nothing here is stored, it's read fresh from the same counts
 * the bell's badge already shows.
 */
export default function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { waiting, overdue, dueToday } = useNotifications()

  const items = [
    waiting > 0 && {
      icon: 'logo-whatsapp' as const, tone: COLORS.good,
      text: `${waiting} WhatsApp chat${waiting === 1 ? '' : 's'} waiting for a reply`,
      onPress: () => router.push('/whatsapp'),
    },
    overdue > 0 && {
      icon: 'alert-circle' as const, tone: COLORS.bad,
      text: `${overdue} lead${overdue === 1 ? '' : 's'} overdue for follow-up`,
      onPress: () => router.push('/leads'),
    },
    dueToday > 0 && {
      icon: 'time' as const, tone: COLORS.warn,
      text: `${dueToday} lead${dueToday === 1 ? '' : 's'} due for follow-up today`,
      onPress: () => router.push('/leads'),
    },
  ].filter(Boolean) as { icon: keyof typeof Ionicons.glyphMap; tone: string; text: string; onPress: () => void }[]

  return (
    <View pointerEvents={open ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 45 }}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <Animated.View
        style={{
          position: 'absolute', top: insets.top + 56, right: 14, width: 290, maxWidth: '86%',
          backgroundColor: '#fff', borderRadius: 18, padding: 8,
          shadowColor: COLORS.ink, shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10,
          transformOrigin: 'top right',
          opacity: open ? 1 : 0,
          transform: [{ scale: open ? 1 : 0.95 }],
          transitionProperty: ['transform', 'opacity'],
          transitionDuration: '160ms',
          transitionTimingFunction: EASE_OUT,
        }}
      >
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink, paddingHorizontal: 8, paddingVertical: 6 }}>Notifications</Text>
        {items.length === 0 ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 18, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.faint} />
            <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.muted, marginTop: 6 }}>You're all caught up</Text>
          </View>
        ) : (
          items.map((item, i) => (
            <PressableScale
              key={i}
              onPress={() => { onClose(); item.onPress() }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 10 }}
            >
              <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: `${item.tone}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={item.icon} size={15} color={item.tone} />
              </View>
              <Text style={{ flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink, lineHeight: 17 }}>{item.text}</Text>
            </PressableScale>
          ))
        )}
      </Animated.View>
    </View>
  )
}
