import { Directory, File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import { API_BASE_URL, getStoredToken } from './api'

/**
 * /api/whatsapp-media/:messageId is authenticated, so the bytes can't come
 * from a bare <Image source={{uri}}> the way a public URL could. The web
 * app solves this with an in-memory Map of blob object-URLs; the native
 * equivalent is a Map of local file:// paths, downloaded once with the
 * bearer token attached and then reused by every bubble, re-render, and
 * poll for that message.
 */
const uris = new Map<string, Promise<string>>()

async function loadWebMediaUri(messageId: string): Promise<string> {
  const token = await getStoredToken()
  const response = await fetch(`${API_BASE_URL}/whatsapp-media/${encodeURIComponent(messageId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`Media request failed with status ${response.status}`)
  return URL.createObjectURL(await response.blob())
}

function extFromMime(mime: string): string {
  const known: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/3gpp': '3gp',
    'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/mp4': 'm4a',
    'application/pdf': 'pdf',
  }
  return known[mime] || 'bin'
}

export function loadMediaUri(messageId: string, mimeType: string): Promise<string> {
  const cached = uris.get(messageId)
  if (cached) return cached

  const p = (async () => {
    if (Platform.OS === 'web') return loadWebMediaUri(messageId)

    const mediaDir = new Directory(Paths.cache, 'wa-media')
    if (!mediaDir.exists) mediaDir.create({ intermediates: true })

    const dest = new File(mediaDir, `${encodeURIComponent(messageId)}.${extFromMime(mimeType)}`)
    if (dest.exists) return dest.uri

    const token = await getStoredToken()
    const downloaded = await File.downloadFileAsync(
      `${API_BASE_URL}/whatsapp-media/${encodeURIComponent(messageId)}`,
      dest,
      { headers: token ? { Authorization: `Bearer ${token}` } : {}, idempotent: true },
    )
    return downloaded.uri
  })()

  uris.set(messageId, p)
  p.catch(() => uris.delete(messageId))
  return p
}
