import { Alert, Platform } from 'react-native'

/**
 * react-native-web's Alert.alert is a hard no-op (`static alert() {}` in
 * node_modules/react-native-web/dist/exports/Alert) — every Alert.alert
 * call in this app, including "Sign out", silently did nothing when run
 * on web. These wrap the same call sites with a web fallback so they work
 * on every platform this app actually runs on.
 */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title)
    return
  }
  Alert.alert(title, message)
}

export function confirmAction(
  title: string,
  message: string | undefined,
  confirmLabel: string,
  onConfirm: () => void,
  opts?: { destructive?: boolean; cancelLabel?: string },
) {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm()
    return
  }
  Alert.alert(title, message, [
    { text: opts?.cancelLabel ?? 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: opts?.destructive ? 'destructive' : 'default', onPress: onConfirm },
  ])
}
