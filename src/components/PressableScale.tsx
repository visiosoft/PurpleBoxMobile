import { useState } from 'react'
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cubicBezier } from 'react-native-reanimated'

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1)

// Sizing keys are safe to hand to both layers: the inner Animated.View
// fills whatever box the outer now correctly claims, so seeing them twice
// doesn't change anything visually.
const SIZE_KEYS = [
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
] as const

// Margin is different: it's space *around* the box, not the box's own
// size, so it has to move to the outer rather than being copied — left on
// both, a card with marginBottom would get pushed down twice (once inside
// its own tap target, once again in the list below it).
const MARGIN_KEYS = [
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
] as const

/**
 * Press feedback for every pressable in the app — buttons, list rows, chips.
 * Near-imperceptible on purpose (120ms, 3% scale): this fires dozens of
 * times a session, so anything longer or larger would read as sluggish
 * rather than responsive. A CSS transition on the UI thread, no gesture or
 * shared value needed for a plain press.
 */
export default function PressableScale({
  style, onPressIn, onPressOut, children, ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const [pressed, setPressed] = useState(false)

  // The style used to land only on the inner Animated.View. The outer
  // Pressable — the element actually laid out by whatever parent this
  // sits in — had no style of its own, so wherever a caller sized one
  // with flex:1 (splitting a row evenly, e.g. the Status/Follow-up pills)
  // it had nothing to claim a share of the row with, fell back to
  // content-based auto sizing, and collapsed toward zero on native Yoga —
  // react-native-web resolved the same ambiguity more forgivingly, which is
  // why this only ever showed up on a real device. Forwarding just the
  // sizing-relevant keys (not background/border/padding — those stay
  // inner-only so they don't get painted twice) fixes it without changing
  // how anything looks.
  const flat = (StyleSheet.flatten(style) || {}) as Record<string, unknown>
  const outerStyle: ViewStyle = {}
  for (const key of SIZE_KEYS) {
    if (flat[key] !== undefined) (outerStyle as Record<string, unknown>)[key] = flat[key]
  }
  for (const key of MARGIN_KEYS) {
    if (flat[key] !== undefined) (outerStyle as Record<string, unknown>)[key] = flat[key]
  }
  // Stripped of margin so the inner view doesn't push itself around a
  // second time inside a box the outer's own margin already positioned.
  const innerStyle: ViewStyle = { ...flat }
  for (const key of MARGIN_KEYS) delete (innerStyle as Record<string, unknown>)[key]

  return (
    <Pressable
      {...rest}
      style={outerStyle}
      onPressIn={(e) => { setPressed(true); onPressIn?.(e) }}
      onPressOut={(e) => { setPressed(false); onPressOut?.(e) }}
    >
      <Animated.View
        style={[
          innerStyle,
          {
            transform: [{ scale: pressed ? 0.97 : 1 }],
            transitionProperty: 'transform',
            transitionDuration: '120ms',
            transitionTimingFunction: EASE_OUT,
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  )
}
