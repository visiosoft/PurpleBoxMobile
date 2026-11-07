import { Platform, Linking } from 'react-native'
import { isAxiosError } from 'axios'
import { Directory, File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { startActivityAsync } from 'expo-intent-launcher'
import { api, API_BASE_URL } from './api'

/**
 * Files the Ask box offers — a quotation or contract PDF, a card's preview,
 * a list as PDF or Excel. Every one is behind the person's login, so it is
 * downloaded with their token (the `api` client), saved in the cache, and
 * handed to the phone's own viewer: Android opens it in a PDF or sheet app,
 * iOS shows it in the share sheet's preview.
 */

const KINDS = {
  pdf: { ext: 'pdf', mime: 'application/pdf', uti: 'com.adobe.pdf' },
  excel: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uti: 'org.openxmlformats.spreadsheetml.sheet' },
  png: { ext: 'png', mime: 'image/png', uti: 'public.png' },
} as const
export type FileKind = keyof typeof KINDS

const FLAG_GRANT_READ_URI_PERMISSION = 1

/** The server's own words when a download fails (its body is bytes, not JSON). */
function downloadError(e: unknown): Error {
  if (isAxiosError(e)) {
    const status = e.response?.status
    const data = e.response?.data
    let msg = ''
    try {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : null
      const text = bytes ? String.fromCharCode(...Array.from(bytes.slice(0, 2000))) : typeof data === 'string' ? data : ''
      msg = text ? (JSON.parse(text) as { error?: string }).error || '' : ''
    } catch { /* not JSON */ }
    if (status === 410) return new Error(msg || 'This card has expired — prepare it again.')
    return new Error(msg || e.message)
  }
  return e instanceof Error ? e : new Error('Could not open the file')
}

const slug = (s: string) => s.replace(/\s*\(.*\)$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file'

/** Download an API path (relative to /api, as the server gives it) and open it. */
export async function openApiFile(path: string, opts: { kind?: FileKind; label?: string; params?: Record<string, string> } = {}) {
  if (/^https?:\/\//i.test(path) && !path.startsWith(API_BASE_URL)) {
    await Linking.openURL(path)
    return
  }
  const kind = opts.kind || (/format=excel/.test(path) ? 'excel' : 'pdf')
  const rel = path.startsWith(API_BASE_URL) ? path.slice(API_BASE_URL.length) : path
  let bytes: ArrayBuffer
  try {
    const res = await api.get<ArrayBuffer>(rel, { responseType: 'arraybuffer', params: opts.params, timeout: 90_000 })
    bytes = res.data
  } catch (e) {
    throw downloadError(e)
  }
  const dir = new Directory(Paths.cache, 'ask-files')
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
  const file = new File(dir, `${slug(opts.label || 'purplebox')}-${Date.now()}.${KINDS[kind].ext}`)
  file.write(new Uint8Array(bytes))
  await openLocalFile(file, kind)
}

/** Open a file already on the phone (a saved chart, a downloaded PDF). */
export async function openLocalFile(file: File | string, kind: FileKind) {
  const f = typeof file === 'string' ? new File(file) : file
  const k = KINDS[kind]
  if (Platform.OS === 'android' && kind !== 'png') {
    try {
      await startActivityAsync('android.intent.action.VIEW', { data: f.contentUri, type: k.mime, flags: FLAG_GRANT_READ_URI_PERMISSION })
      return
    } catch { /* no viewer for this type — offer it to share instead */ }
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone cannot open files from the app.')
  await Sharing.shareAsync(f.uri, { mimeType: k.mime, UTI: k.uti, dialogTitle: kind === 'png' ? 'Save or share the chart' : 'Open with' })
}
