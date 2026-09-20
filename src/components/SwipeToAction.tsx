import { useRef, type ReactNode } from 'react'
import {
    View,
    Text,
    Animated,
    PanResponder,
    Dimensions,
    StyleSheet,
    type GestureResponderEvent,
    type PanResponderGestureState,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { FONTS } from '../lib/theme'

const SCREEN_WIDTH = Dimensions.get('window').width
const SWIPE_THRESHOLD = 85

export type SwipeActionSpec = {
    icon: keyof typeof Ionicons.glyphMap
    label: string
    subLabel?: string
    color: string
    onTrigger: () => void
}

/**
 * The same swipe-gesture + reveal-background idea behind the dashboard's
 * SwipeableDashboardCard, generalised so a card that looks nothing like the
 * dashboard's (e.g. the Leads list) can get "swipe right for one action,
 * swipe left for another" without adopting that card's specific look.
 * SwipeableDashboardCard itself keeps its own inline copy for now (it
 * predates this file and isn't due for a re-plumb just to deduplicate) —
 * this is for every *new* place the same gesture is wanted, starting with
 * the Leads list.
 */
export default function SwipeToAction({
    children,
    right,
    left,
    borderRadius = 16,
}: {
    children: ReactNode
    /** Revealed by swiping right (the gesture goes right, showing what was
     *  hiding on the left) — conventionally the "primary" action. */
    right?: SwipeActionSpec
    /** Revealed by swiping left. */
    left?: SwipeActionSpec
    /** Must match the wrapped card's own corner radius, or the reveal
     *  background's corners show through as a seam at full swipe. */
    borderRadius?: number
}) {
    const pan = useRef(new Animated.Value(0)).current
    const cardScale = useRef(new Animated.Value(1)).current
    const cardOpacity = useRef(new Animated.Value(1)).current

    const trigger = (direction: 'left' | 'right') => {
        const action = direction === 'right' ? right : left
        if (!action) return
        if (direction === 'right') {
            Animated.parallel([
                Animated.timing(pan, { toValue: SCREEN_WIDTH, duration: 180, useNativeDriver: true }),
                Animated.timing(cardOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
                Animated.timing(cardScale, { toValue: 0.85, duration: 180, useNativeDriver: true }),
            ]).start(() => action.onTrigger())
        } else {
            Animated.spring(pan, { toValue: 0, friction: 6, tension: 40, useNativeDriver: true }).start(() => action.onTrigger())
        }
    }

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_: GestureResponderEvent, g: PanResponderGestureState) =>
                Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
            onPanResponderMove: (_: GestureResponderEvent, g: PanResponderGestureState) => {
                // Dead in whichever direction has no action, so there's
                // nothing to reveal (and nothing to trigger) that way.
                if ((g.dx > 0 && !right) || (g.dx < 0 && !left)) return
                pan.setValue(g.dx)
            },
            onPanResponderRelease: (_: GestureResponderEvent, g: PanResponderGestureState) => {
                if (g.dx > SWIPE_THRESHOLD && right) trigger('right')
                else if (g.dx < -SWIPE_THRESHOLD && left) trigger('left')
                else Animated.spring(pan, { toValue: 0, friction: 7, tension: 40, useNativeDriver: true }).start()
            },
        })
    ).current

    const rightOpacity = pan.interpolate({ inputRange: [0, 30, SWIPE_THRESHOLD], outputRange: [0, 0.6, 1], extrapolate: 'clamp' })
    const rightScale = pan.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0.75, 1], extrapolate: 'clamp' })
    const leftOpacity = pan.interpolate({ inputRange: [-SWIPE_THRESHOLD, -30, 0], outputRange: [1, 0.6, 0], extrapolate: 'clamp' })
    const leftScale = pan.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0.75], extrapolate: 'clamp' })

    return (
        <Animated.View style={{ opacity: cardOpacity, transform: [{ scale: cardScale }] }}>
            <View style={{ position: 'relative', borderRadius, overflow: 'hidden' }}>
                {!!right && (
                    <Animated.View style={[styles.background, { borderRadius, backgroundColor: right.color, alignItems: 'flex-start', paddingLeft: 18, opacity: rightOpacity }]}>
                        <Animated.View style={[styles.contentLeft, { transform: [{ scale: rightScale }] }]}>
                            <View style={styles.iconCircle}><Ionicons name={right.icon} size={20} color="#fff" /></View>
                            <View>
                                <Text style={styles.mainText}>{right.label}</Text>
                                {!!right.subLabel && <Text style={styles.subText}>{right.subLabel}</Text>}
                            </View>
                        </Animated.View>
                    </Animated.View>
                )}
                {!!left && (
                    <Animated.View style={[styles.background, { borderRadius, backgroundColor: left.color, alignItems: 'flex-end', paddingRight: 18, opacity: leftOpacity }]}>
                        <Animated.View style={[styles.contentRight, { transform: [{ scale: leftScale }] }]}>
                            <View>
                                <Text style={[styles.mainText, { textAlign: 'right' }]}>{left.label}</Text>
                                {!!left.subLabel && <Text style={[styles.subText, { textAlign: 'right' }]}>{left.subLabel}</Text>}
                            </View>
                            <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,255,255,0.24)' }]}><Ionicons name={left.icon} size={20} color="#fff" /></View>
                        </Animated.View>
                    </Animated.View>
                )}

                <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX: pan }] }}>
                    {children}
                </Animated.View>
            </View>
        </Animated.View>
    )
}

const styles = StyleSheet.create({
    background: {
        ...StyleSheet.absoluteFill,
        justifyContent: 'center',
    },
    contentLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    contentRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
    mainText: { fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' },
    subText: { fontFamily: FONTS.body, fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
})
