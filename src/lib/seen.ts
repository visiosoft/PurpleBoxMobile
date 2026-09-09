import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Which chats this phone has already looked at — mirrors the web app's
 * lib/whatsappSeen.ts (per-browser localStorage), but per-device here since
 * there is no server-side "read" state (see routes/whatsapp.js: no mark-as-
 * read endpoint exists — the web app doesn't persist this across devices
 * either, so mobile isn't losing anything by keeping its own copy).
 */
const KEY = 'wa_seen_v1'

let cache: Record<string, string> | null = null

async function load(): Promise<Record<string, string>> {
  if (cache) return cache
  const raw = await AsyncStorage.getItem(KEY)
  cache = raw ? JSON.parse(raw) : {}
  return cache!
}

export async function markSeen(phoneNormalized: string, atIso: string) {
  const map = await load()
  map[phoneNormalized] = atIso
  await AsyncStorage.setItem(KEY, JSON.stringify(map))
}

export async function getSeenMap(): Promise<Record<string, string>> {
  return { ...(await load()) }
}

export function isUnread(seenMap: Record<string, string>, phoneNormalized: string, lastAt: string): boolean {
  const seenAt = seenMap[phoneNormalized]
  if (!seenAt) return true
  return new Date(lastAt).getTime() > new Date(seenAt).getTime()
}
