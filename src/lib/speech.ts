import * as Speech from 'expo-speech'
import { setAudioModeAsync } from 'expo-audio'

/**
 * Reading text aloud with the phone's own voice (expo-speech), the way the
 * web's lib/speech.ts does it: markdown stripped, links shortened, the text
 * in sentence-sized pieces, and one `onEnd` when the last piece is done or
 * speech is stopped — Talk mode waits on it before listening again.
 */

/** Plain words: no markdown, links shortened, figures kept. Pure. */
export function speakable(text: string) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    // An Emirates ID is never read out whole — only its last four digits.
    .replace(/\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?(\d)\b/g, (m) => `an ID ending ${m.replace(/\D/g, '').slice(-4)}`)
    .replace(/[*_`#>|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
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
  void Speech.stop()
  f?.()
}

/**
 * Reads the text aloud; calls onEnd when finished or stopped. Returns false
 * only when there is nothing the phone can do (it always can on a device).
 */
export function speakText(text: string, onEnd?: () => void) {
  stopSpeaking()
  const id = run
  const parts = chunks(speakable(text).slice(0, 4000))
  let ended = false
  const finish = () => { if (ended) return; ended = true; if (finishCurrent === finish) finishCurrent = null; onEnd?.() }
  if (!parts.length) { onEnd?.(); return true }
  finishCurrent = finish
  // Heard on a phone left on silent too (Talk mode sets its own session).
  if (!modeSet) { modeSet = true; void setAudioModeAsync({ playsInSilentMode: true }).catch(() => { modeSet = false }) }
  parts.forEach((part, i) => {
    const last = i === parts.length - 1
    Speech.speak(part, {
      language: 'en-GB',
      rate: 1.0,
      onDone: last ? () => { if (id === run) finish() } : undefined,
      onError: () => { if (id === run) finish() },
    })
  })
  return true
}
