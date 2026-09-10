import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from './api'

/**
 * Push notifications, via Expo — lead assignment, and every inbound WhatsApp
 * reply on a chat somebody already owns.
 *
 * A lead can land on a rep from three places on the server — a person
 * assigning it by hand, the distribution rules, or the SLA reassign clock —
 * and a reply arrives from one, the webhook. All four already funnel through
 * server/src/services/leadNotify.js, which is the single place that decides
 * a person needs to hear about something and builds the notice. This file
 * never needs to know which of those fired; it only ever reacts to the
 * notification shapes that module sends, keyed on `data.type`.
 *
 * Kept apart from src/lib/notifications.ts on purpose — that file is the
 * in-app badge for waiting chats and follow-ups, a client-side read of data
 * already on screen. This file is real OS push: permissions, tokens, and
 * what happens when a person taps one or the app receives one silently.
 */

export type LeadAssignedData = { type: 'lead_assigned'; phone: string; leadId: string; name: string }
export type LeadAssignedSummaryData = { type: 'lead_assigned_summary' }
export type LeadDismissData = { type: 'lead_assigned_dismiss'; leadId: string }
export type WhatsAppMessageData = { type: 'whatsapp_message'; phone: string; leadId: string; name: string }
export type PushData = LeadAssignedData | LeadAssignedSummaryData | LeadDismissData | WhatsAppMessageData | Record<string, unknown>

/**
 * Foreground behaviour. A rep with the app open is exactly who most needs to
 * notice a new lead — they are looking at their phone right now — so a
 * `lead_assigned` push still shows its banner and sound.
 *
 * The one exception is the silent "dismiss" push the server sends the moment
 * a rep replies to a lead on WhatsApp (services/leadNotify.js's
 * dismissAssignmentNotification): it carries no title or body on purpose and
 * exists only to update the badge and, where the OS allows it, remove the
 * original alert from the tray. Showing it as a banner of its own would be
 * exactly the "one more notification on top" the product ask says not to add.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as PushData
    const silent = (data as LeadDismissData)?.type === 'lead_assigned_dismiss'
    return {
      shouldShowAlert: !silent,
      shouldShowBanner: !silent,
      shouldShowList: !silent,
      shouldPlaySound: !silent,
      shouldSetBadge: true,
    }
  },
})

const IDENTIFIER_MAP_KEY = 'pb_lead_notification_ids'
// A lookup table, not a history — kept no bigger than the server's own
// "four or five, not more" badge cap (see MAX_ASSIGNMENT_BADGE in
// server/src/services/leadNotify.js), so it can never grow unbounded even if
// a dismiss push is dropped for some leads and their entries are never
// cleared out.
const MAX_TRACKED = 8

async function loadIdentifierMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(IDENTIFIER_MAP_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

async function saveIdentifierMap(map: Record<string, string>) {
  try {
    await AsyncStorage.setItem(IDENTIFIER_MAP_KEY, JSON.stringify(map))
  } catch {
    // Losing this map only degrades tray dismissal for whichever lead was
    // affected — the badge and every other bit of app state are always
    // corrected from the server on the next foreground, never from this.
  }
}

/** Remember which delivered notification belongs to which lead, so a later
 *  dismiss push can find and clear it. */
async function rememberNotification(leadId: string, identifier: string) {
  if (!leadId || !identifier) return
  const map = await loadIdentifierMap()
  map[leadId] = identifier
  const entries = Object.entries(map)
  await saveIdentifierMap(entries.length > MAX_TRACKED ? Object.fromEntries(entries.slice(-MAX_TRACKED)) : map)
}

/** Clear one lead's tray entry, best effort, and forget it either way. */
async function forgetAndDismiss(leadId: string) {
  if (!leadId) return
  const map = await loadIdentifierMap()
  const identifier = map[leadId]
  if (identifier) {
    await Notifications.dismissNotificationAsync(identifier).catch(() => {})
  }
  if (identifier !== undefined) {
    delete map[leadId]
    await saveIdentifierMap(map)
  }
}

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId as string | undefined
}

/**
 * Ask for permission and hand the server a token. Called once after login,
 * and safe to call again on every app launch — `registerExpoPushToken` on
 * the server is `$addToSet`, so a repeat call is free rather than growing
 * the user's token list.
 *
 * Does nothing on web: there is no Expo push service to register with there,
 * and `getExpoPushTokenAsync` would just throw.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    let status = existing
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status
    }
    if (status !== 'granted') return null

    if (Platform.OS === 'android') {
      // High importance so a lead assignment can actually interrupt — the
      // one category of push this app sends that is worth a heads-up
      // banner rather than a silent tray entry.
      await Notifications.setNotificationChannelAsync('lead-assignments', {
        name: 'Lead assignments',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 200, 200],
        lightColor: '#5B2BC9',
      })
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId() ? { projectId: projectId() } : undefined,
    )
    await api.post('/users/push-token', { token }).catch(() => null)
    return token
  } catch (e) {
    console.warn('[Push] could not register for notifications:', e)
    return null
  }
}

/**
 * `expo-notifications` fires this when a device's push token rotates (a
 * fresh install, a restored backup, an OS-level reset). Re-sending it is the
 * whole fix — the server treats it as just another registration for the
 * same person.
 */
export function addTokenRefreshListener(): { remove: () => void } {
  return Notifications.addPushTokenListener(({ data: token }) => {
    api.post('/users/push-token', { token }).catch(() => null)
  })
}

/** Sign-out: best effort, and never allowed to block the sign-out itself —
 *  a token that fails to unregister just means one more device keeps
 *  hearing about leads that are no longer this person's to answer, which
 *  self-corrects the moment somebody else registers the same phone. */
export async function unregisterCurrentPushToken(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId() ? { projectId: projectId() } : undefined,
    )
    if (token) await api.post('/users/push-token/remove', { token }).catch(() => null)
  } catch {
    // Nothing registered yet, or permission was never granted — fine.
  }
}

type Router = { push: (opts: { pathname: string; params?: Record<string, string> }) => void }

/**
 * Wired once from the ROOT layout (app/_layout.tsx). Three things, all keyed
 * off `data.type`:
 *
 *   - a `lead_assigned` push arrives → remember its identifier against the
 *     lead, so a later dismiss push can find and clear it
 *   - a `lead_assigned_dismiss` push arrives → clear that tray entry and
 *     forget it, best effort
 *   - the person taps a notification → open the WhatsApp thread it names,
 *     with the exact param shape app/(tabs)/whatsapp/index.tsx's openChat()
 *     already uses, so the thread screen needs no special-casing for how it
 *     got there
 *
 * Returns a cleanup function for the same effect to return.
 */
export function wireNotificationListeners(router: Router): () => void {
  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as PushData
    if ((data as LeadAssignedData)?.type === 'lead_assigned') {
      rememberNotification((data as LeadAssignedData).leadId, notification.request.identifier)
    } else if ((data as LeadDismissData)?.type === 'lead_assigned_dismiss') {
      forgetAndDismiss((data as LeadDismissData).leadId)
    }
  })

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as PushData
    const type = (data as { type?: string })?.type
    if (type === 'lead_assigned' || type === 'whatsapp_message') {
      const d = data as LeadAssignedData | WhatsAppMessageData
      router.push({
        pathname: '/whatsapp/[phone]',
        params: { phone: d.phone, name: d.name || '', leadId: d.leadId || '' },
      })
    } else if ((data as LeadAssignedSummaryData)?.type === 'lead_assigned_summary') {
      // Several leads collapsed into one reminder (see
      // services/leadAssignReminder.js) has nowhere specific to deep-link
      // to — it opens the WhatsApp list instead of guessing which thread.
      router.push({ pathname: '/whatsapp' })
    }
  })

  return () => {
    receivedSub.remove()
    responseSub.remove()
  }
}

/**
 * The badge alone, refreshed independently of any push arriving. Called on
 * every app foreground so the icon is never stale even when the OS tray
 * itself could not be reached — the phone was off when a push was sent, a
 * silent dismiss push was throttled or dropped, or the notification arrived
 * while the app was force-quit. The server is the one place this count can
 * always be trusted, because GET /leads/assignment-badge reads it live
 * rather than from whatever the last push happened to say.
 */
export async function refreshBadgeFromServer(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const { data } = await api.get<{ count: number }>('/leads/assignment-badge')
    await Notifications.setBadgeCountAsync(data?.count ?? 0)
  } catch {
    // A failed refresh leaves the last known badge as it was — safer than
    // zeroing it out on a network blip and hiding a real pending lead.
  }
}
