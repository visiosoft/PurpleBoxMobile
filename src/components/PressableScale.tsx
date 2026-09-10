import { useState } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cubicBezier } from 'react-native-reanimated'

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1)

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
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => { setPressed(true); onPressIn?.(e) }}
      onPressOut={(e) => { setPressed(false); onPressOut?.(e) }}
    >
      <Animated.View
        style={[
          style,
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
