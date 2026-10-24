import { PermissionsAndroid, Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as TaskManager from 'expo-task-manager'
import * as BackgroundTask from 'expo-background-task'
import { api, getStoredToken, getStoredUser } from './api'

/**
 * Android call-log sync: the calls a rep makes and takes on this phone go to
 * the CRM (POST /calls/sync), which keeps only the ones to leads and
 * customers — personal calls are dropped there and never stored. An outgoing
 * call to a lead counts as a call attempt, the same as logging it by hand.
 *
 * Runs when the app opens, whenever it comes back to the foreground (which is
 * right after a call made from the Call button), and every ~15 minutes in the
 * background. Android only: iOS gives apps no access to the call log.
 */

type NativeCall = { id: string; number: string; type: 'outgoing' | 'incoming' | 'missed' | 'rejected'; timestamp: number; duration: number }
type CallLogModule = {
  hasPermission(): Promise<boolean>
  readSince(sinceMs: number, limit: number): Promise<NativeCall[]>
}

/** A synced call to a lead, as the CRM returns it — what the note prompt offers. */
export type LeadCall = { id: string; leadId: string; name: string; direction: NativeCall['type']; durationSec: number; at: string }

// Missing in Expo Go, on iOS and on the web — all of which simply don't sync.
const CallLog = Platform.OS === 'android' ? requireOptionalNativeModule<CallLogModule>('CallLog') : null
export const callSyncSupported = !!CallLog

const TASK = 'pb-call-log-sync'
const BATCH = 500 // the most the server takes per request
const FIRST_SYNC_BACK_MS = 24 * 3600_000
const NOTE_WINDOW_MS = 3 * 3600_000
const ANSWERED_MIN_SEC = 10
const PENDING_NOTE_KEY = 'pb_call_note_pending'
const cursorKey = (userId: string) => `pb_calls_synced_until:${userId}`

export async function hasCallLogPermission() {
  return CallLog ? CallLog.hasPermission() : false
}

/** Asks once per app start; Android itself stops showing it after two refusals. */
export async function requestCallLogPermission() {
  if (!CallLog) return false
  if (await CallLog.hasPermission()) return true
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG, {
    title: 'Track your calls to leads',
    message: 'PurpleBox reads your call log so calls to leads and customers are logged in the CRM automatically. Personal calls are never sent or stored.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  })
  return res === PermissionsAndroid.RESULTS.GRANTED
}

let running: Promise<LeadCall[]> | null = null

/** Sends every call since the last sync. Returns the calls that were to leads. */
export function syncCalls(): Promise<LeadCall[]> {
  if (!running) running = doSync().finally(() => { running = null })
  return running
}

async function doSync(): Promise<LeadCall[]> {
  if (!CallLog || !(await CallLog.hasPermission())) return []
  const [token, user] = await Promise.all([getStoredToken(), getStoredUser<{ id: string }>()])
  if (!token || !user?.id) return []

  const key = cursorKey(user.id)
  let since = Number(await AsyncStorage.getItem(key)) || Date.now() - FIRST_SYNC_BACK_MS
  const leadCalls: LeadCall[] = []
  for (;;) {
    const calls = await CallLog.readSince(since, BATCH)
    if (!calls.length) break
    const { data } = await api.post<{ leadCalls?: LeadCall[] }>('/calls/sync', { calls })
    leadCalls.push(...(data.leadCalls ?? []))
    since = Math.max(...calls.map((c) => c.timestamp))
    await AsyncStorage.setItem(key, String(since))
    if (calls.length < BATCH) break
  }
  await rememberNoteable(leadCalls)
  return leadCalls
}

/**
 * The latest answered outgoing call to a lead is worth a note. Kept until the
 * rep sees the app, so a call synced in the background still gets asked about.
 */
async function rememberNoteable(calls: LeadCall[]) {
  const last = calls.filter((c) => c.direction === 'outgoing' && c.durationSec >= ANSWERED_MIN_SEC).pop()
  if (last) await AsyncStorage.setItem(PENDING_NOTE_KEY, JSON.stringify(last))
}

/** The call to ask a note for, if it's recent enough to still remember. Asked once. */
export async function takePendingNoteCall(): Promise<LeadCall | null> {
  const raw = await AsyncStorage.getItem(PENDING_NOTE_KEY)
  if (!raw) return null
  await AsyncStorage.removeItem(PENDING_NOTE_KEY)
  const call = JSON.parse(raw) as LeadCall
  return Date.now() - new Date(call.at).getTime() < NOTE_WINDOW_MS ? call : null
}

export async function saveCallNote(callId: string, note: string) {
  await api.patch(`/calls/${callId}/note`, { note })
}

// Must be defined at module load, before the OS wakes the app for it.
if (CallLog) {
  TaskManager.defineTask(TASK, async () => {
    try {
      await syncCalls()
      return BackgroundTask.BackgroundTaskResult.Success
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed
    }
  })
}

export async function startBackgroundCallSync() {
  if (!CallLog || (await TaskManager.isTaskRegisteredAsync(TASK))) return
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 })
}

export async function stopBackgroundCallSync() {
  if (CallLog && (await TaskManager.isTaskRegisteredAsync(TASK))) await BackgroundTask.unregisterTaskAsync(TASK)
}
