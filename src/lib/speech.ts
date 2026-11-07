import * as Speech from 'expo-speech'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { Directory, File, Paths } from 'expo-file-system'
import { api } from './api'

/**
 * Reading text aloud.
 *
 * A natural, human voice first: the same OpenAI voice the WhatsApp bot speaks
 * with (POST /ai-bot/speak, gpt-4o-mini-tts), told to sound like a warm
 * colleague on a call rather than an announcement. The first sentence is
 * fetched on its own so it starts talking quickly while the rest is made.
 * When that voice cannot be had (no connection, the server says no, the
 * phone cannot play it) the phone's own best voice reads it instead.
 *
 * One `onEnd`, once, when it has finished or been stopped — Talk mode waits
 * on it before listening again.
 */

const VOICE = 'coral'
const STYLE = 'Warm, friendly and natural — a helpful colleague talking on a phone call, not an announcer. '
  + 'Relaxed, conversational pace with natural pauses; a smile in the voice; clear on numbers, names and dates.'
const SPEED = 1.05

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "AED 1,598.71" as "1,599 dirhams": the way people in Dubai say it, to the
    dirham — the exact figure is on the screen. Pure. */
function dirhams(amount: string) {
  const n = Number(amount.replace(/,/g, ''))
  if (!Number.isFinite(n)) return `${amount} dirhams`
  return `${Math.round(n).toLocaleString('en-GB')} dirhams`
}

/** Plain words: no markdown, links shortened, money in dirhams, dates and sizes as said aloud. Pure. */
export function speakable(text: string) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    // An Emirates ID is never read out whole — only its last four digits.
    .replace(/\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?(\d)\b/g, (m) => `an ID ending ${m.replace(/\D/g, '').slice(-4)}`)
    .replace(/[*_`#>|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\bAED\s*([\d,]+(?:\.\d+)?)/gi, (_m, a: string) => dirhams(a))
    .replace(/([\d,]+(?:\.\d+)?)\s*AED\b/gi, (_m, a: string) => dirhams(a))
    .replace(/\bAED\b/gi, 'dirhams')
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, _y: string, mo: string, d: string) => (MONTHS[Number(mo) - 1] ? `${Number(d)} ${MONTHS[Number(mo) - 1]}` : m))
    .replace(/\bsq\.?\s?ft\b|\bsqft\b/gi, 'square feet')
    // A phone number in brackets is for the screen, not the ear.
    .replace(/\s*\(\+?\d[\d\s-]{5,}\)/g, '')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sentence-sized pieces, none longer than ~220 characters. Pure. */
export function chunks(text: string, max = 220) {
  const out: string[] = []
  for (const s of text.match(/[^.!?;:]+[.!?;:]*\s*/g) || [text]) {
    let rest = s.trim()
    while (rest.length > max) {
      const cut = rest.lastIndexOf(' ', max) > 40 ? rest.lastIndexOf(' ', max) : max
      out.push(rest.slice(0, cut))
      rest = rest.slice(cut).trim()
    }
    if (!rest) continue
    if (out.length && (out[out.length - 1] + ' ' + rest).length <= max) out[out.length - 1] += ' ' + rest
    else out.push(rest)
  }
  return out
}

/** The text as at most two requests: a short opening, then everything else. Pure. */
export function cloudParts(text: string): string[] {
  const parts = chunks(text, 160)
  if (parts.length <= 1) return parts
  return [parts[0], parts.slice(1).join(' ')]
}

/* ---------- the human voice ---------- */

let cloudOffUntil = 0
const phraseCache = new Map<string, Promise<string>>()
let fileSeq = 0

async function cloudFile(text: string): Promise<string> {
  const short = text.length <= 80
  const cached = short ? phraseCache.get(text) : undefined
  if (cached) return cached
  const p = (async () => {
    const res = await api.post<ArrayBuffer>('/ai-bot/speak',
      { text, voice: VOICE, voiceStyle: STYLE, voiceSpeed: SPEED, voiceAmbience: 'none' },
      { responseType: 'arraybuffer', timeout: 25_000 })
    const dir = new Directory(Paths.cache, 'voice')
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
    const f = new File(dir, `say-${Date.now()}-${fileSeq++}.ogg`)
    f.write(new Uint8Array(res.data))
    return f.uri
  })()
  if (short) {
    phraseCache.set(text, p)
    p.catch(() => phraseCache.delete(text))
  }
  return p
}

/** Fetch the phrases Talk mode says most, so they start at once. */
export function warmVoice(phrases: string[]) {
  if (Date.now() < cloudOffUntil) return
  for (const p of phrases) void cloudFile(p).catch(() => {})
}

let player: AudioPlayer | null = null
let cancelPlay: (() => void) | null = null

/** Plays a file to the end. true when it finished; false when it could not play. */
function playFile(uri: string): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const p = createAudioPlayer({ uri })
    player = p
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      clearTimeout(watchdog)
      sub.remove()
      try { p.remove() } catch { /* already gone */ }
      if (player === p) player = null
      if (cancelPlay === cancel) cancelPlay = null
      resolve(ok)
    }
    const cancel = () => finish(true)
    cancelPlay = cancel
    const sub = p.addListener('playbackStatusUpdate', (s) => { if (s.didJustFinish) finish(true) })
    // A file that never starts is one this phone cannot play.
    const watchdog = setTimeout(() => { if (!p.playing && p.currentTime === 0) finish(false) }, 6000)
    p.play()
  })
}

/* ---------- the phone's own voice, as the fallback ---------- */

let deviceVoice: string | undefined
let pickedVoice = false
async function pickDeviceVoice() {
  if (pickedVoice) return deviceVoice
  pickedVoice = true
  try {
    const all = await Speech.getAvailableVoicesAsync()
    const en = all.filter((v) => /^en[-_]/i.test(v.language))
    const best = (pred: (v: (typeof en)[number]) => boolean) => en.find((v) => v.quality === Speech.VoiceQuality.Enhanced && pred(v)) || en.find(pred)
    deviceVoice = (best((v) => /GB/i.test(v.language)) || best((v) => /US/i.test(v.language)) || en[0])?.identifier
  } catch { /* the default voice it is */ }
  return deviceVoice
}

async function deviceSpeak(text: string, id: number, finish: () => void) {
  const voice = await pickDeviceVoice()
  if (id !== run) return
  const parts = chunks(text)
  if (!parts.length) { finish(); return }
  parts.forEach((part, i) => {
    const last = i === parts.length - 1
    Speech.speak(part, {
      language: 'en-GB',
      voice,
      rate: 1.0,
      onDone: last ? () => { if (id === run) finish() } : undefined,
      onError: () => { if (id === run) finish() },
    })
  })
}

/* ---------- speaking ---------- */

let run = 0
let finishCurrent: (() => void) | null = null
let modeSet = false

/** Talk mode sets the audio session itself (recording, Bluetooth, CarPlay);
 *  reading aloud must not replace it with a playback-only one. */
export function audioSessionSetElsewhere() { modeSet = true }

/** Stop reading now; the current `onEnd` still fires, once. */
export function stopSpeaking() {
  run++
  const f = finishCurrent
  finishCurrent = null
  cancelPlay?.()
  try { player?.pause() } catch { /* gone */ }
  void Speech.stop()
  f?.()
}

/** Reads the text aloud; calls onEnd when finished or stopped. Always returns true on a phone. */
export function speakText(text: string, onEnd?: () => void) {
  stopSpeaking()
  const id = run
  const plain = speakable(text).slice(0, 4000)
  let ended = false
  const finish = () => { if (ended) return; ended = true; if (finishCurrent === finish) finishCurrent = null; onEnd?.() }
  if (!plain) { onEnd?.(); return true }
  finishCurrent = finish
  // Heard on a phone left on silent too (Talk mode sets its own session).
  if (!modeSet) { modeSet = true; void setAudioModeAsync({ playsInSilentMode: true }).catch(() => { modeSet = false }) }

  void (async () => {
    if (Date.now() < cloudOffUntil) { void deviceSpeak(plain, id, finish); return }
    const parts = cloudParts(plain)
    // Both asked for at once: the rest is being made while the opening plays.
    const files = parts.map((p) => cloudFile(p))
    files.forEach((f) => f.catch(() => {}))
    for (let i = 0; i < parts.length; i++) {
      if (id !== run) return
      let uri: string
      try {
        uri = await files[i]
      } catch {
        // No human voice just now: the phone reads the rest, and keeps doing
        // so for a few minutes rather than waiting on a failing request each time.
        cloudOffUntil = Date.now() + 3 * 60_000
        if (id === run) void deviceSpeak(parts.slice(i).join(' '), id, finish)
        return
      }
      if (id !== run) return
      const ok = await playFile(uri)
      if (id !== run) return
      if (!ok) {
        cloudOffUntil = Date.now() + 30 * 60_000
        void deviceSpeak(parts.slice(i).join(' '), id, finish)
        return
      }
    }
    if (id === run) finish()
  })()
  return true
}
