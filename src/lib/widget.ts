import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'

/** modules/talk-widget: the home-screen AI widget (Android only). */
type TalkWidgetModule = { canPin(): boolean; pin(): boolean }

const TalkWidget = Platform.OS === 'android' ? requireOptionalNativeModule<TalkWidgetModule>('TalkWidget') : null

/** Whether this phone has the widget at all (an Android build with the module). */
export const widgetSupported = !!TalkWidget

/** Whether the launcher can be asked to pin it from inside the app. */
export function canPinWidget(): boolean {
  try { return !!TalkWidget?.canPin() } catch { return false }
}

/** Ask the launcher to add the widget (the person confirms in its dialog). */
export function pinWidget(): boolean {
  try { return !!TalkWidget?.pin() } catch { return false }
}
