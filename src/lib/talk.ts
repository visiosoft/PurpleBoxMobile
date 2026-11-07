import { Platform } from 'react-native'
import {
  ExpoSpeechRecognitionModule,
  AVAudioSessionCategory,
  AVAudioSessionCategoryOptions,
  AVAudioSessionMode,
  type ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioRecorder } from 'expo-audio'
import { assistantApi } from './assistant'
import { apiError } from './api'
import { audioSessionSetElsewhere } from './speech'

/**
 * Talk mode's ears, and the mic's: hear what is said and return it as text.
 *
 * The phone's own speech recognition (expo-speech-recognition), which gives
 * the words as they are spoken. Where a phone has none, the microphone is
 * recorded (expo-audio) and the server writes it down (/assistant/transcribe),
 * as the web's lib/talk.ts does for browsers without recognition.
 */

export class ListenError extends Error {}

/** Whether the phone can recognise speech itself. */
export function canRecognize(): boolean {
  try { return ExpoSpeechRecognitionModule.isRecognitionAvailable() } catch { return false }
}

/* Play-and-record with the speaker as the default, and Bluetooth (headset and
   car, including CarPlay) allowed for both directions — so the questions are
   heard from the car's mic and the answers come out of the car's speakers. */
const IOS_CATEGORY = {
  category: AVAudioSessionCategory.playAndRecord,
  categoryOptions: [
    AVAudioSessionCategoryOptions.defaultToSpeaker,
    AVAudioSessionCategoryOptions.allowBluetooth,
    AVAudioSessionCategoryOptions.allowBluetoothA2DP,
  ],
  mode: AVAudioSessionMode.default,
}

/** Set the audio session for a spoken conversation before the first word. */
export function prepareTalkAudio() {
  audioSessionSetElsewhere()
  if (Platform.OS !== 'ios') return
  try { ExpoSpeechRecognitionModule.setCategoryIOS(IOS_CATEGORY) } catch { /* not fatal: recognition sets it when it starts */ }
}

export async function askListenPermission(): Promise<boolean> {
  try {
    const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    return p.granted
  } catch { return false }
}

const RECOGNIZE: ExpoSpeechRecognitionOptions = {
  lang: 'en-US',
  interimResults: true,
  maxAlternatives: 1,
  iosCategory: IOS_CATEGORY,
  iosTaskHint: 'unspecified',
  addsPunctuation: true,
  // Echo cancelling on iPhone: its own voice from the speaker is not heard
  // as theirs, so they can talk over it.
  iosVoiceProcessingEnabled: true,
}

/** How sure the recogniser was of the last thing it heard (0–1; 0 = it did not say). */
let confidence = 0
export const lastConfidence = () => confidence

let stopCurrent: (() => void) | null = null

/** Stop listening now; the pending listen resolves with ''. */
export function cancelListening() { const s = stopCurrent; stopCurrent = null; s?.() }

const errorText = (code: string) =>
  code === 'not-allowed' || code === 'service-not-allowed' ? 'Allow the microphone and speech recognition to talk to it.'
    : code === 'network' ? 'Speech recognition needs a connection — try again.'
      : code === 'language-not-supported' ? 'Speech recognition for English is not installed on this phone.'
        : code === 'audio-capture' ? 'The microphone is busy — end the call or other recording and try again.'
          : ''

/** What a recogniser makes of a noise, not something said: "hmm", "uh", a stray letter. Pure. */
export function isNoise(text: string) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?,…]+/g, '').trim()
  return !t || t.length < 2 || /^(hmm+|mm+|uh+|um+|uhm+|ah+|er+|erm+|oh|eh|huh|ha+|you|thank you for watching|music|applause|laughter|\[.*\]|\(.*\))$/.test(t)
}

/* Words a sentence does not end on: "book a unit for", "the quote and", "from the". */
const TRAILING = /\b(and|or|but|so|because|for|to|from|with|of|the|a|an|in|on|at|by|into|my|your|his|her|their|our|its|this|that|these|those|is|are|was|were|be|been|about|like|then|also|until|till|than|which|who|whose|if|when|where|can|could|would|should|will|shall|i|we|he|she|they|it's|i'm|um+|uh+|er+|ehm|some|any|each|every|per)\s*$/i

/**
 * How long a pause, after these words, means they have finished — in ms. A
 * short answer ("yes", "no", "stop") ends quickly; a sentence that cannot end
 * where it stopped ("quote him for", "and the") gets a long wait, so taking a
 * breath does not send half a question; anything else a moment more than a
 * breath. Pure.
 */
export function turnPause(text: string): number {
  const t = String(text || '').trim()
  if (!t) return 0
  const n = wordsOf(t).length
  if (n <= 3 && (isYes(t) || isNo(t) || isStop(t))) return 900
  if (TRAILING.test(t) || /[,;:\-–]\s*$/.test(t)) return 3200
  if (n < 3) return 2300
  return 1800
}

/**
 * Listen for one turn: everything said until they have finished. Resolves
 * with the words, or '' when nothing was said. A pause for breath does not
 * end it (turnPause); when the phone's recogniser ends its own session early
 * it is started again and the words joined up, until they are done.
 */
export function listenOnce(
  onWords?: (text: string) => void,
  opts: { recorder?: AudioRecorder | null; serverVoice?: boolean; firstWordMs?: number } = {},
): Promise<string> {
  cancelListening()
  if (canRecognize()) return viaPhone(onWords, opts.firstWordMs)
  if (opts.recorder && opts.serverVoice) return viaServer(opts.recorder, onWords)
  return Promise.reject(new ListenError('This phone has no speech recognition — install or enable Google speech services.'))
}

function viaPhone(onWords?: (text: string) => void, firstWordMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const M = ExpoSpeechRecognitionModule
    const began = Date.now()
    let done = false
    let committed = '' // words from recogniser sessions that have ended
    let finals = '' // this session's finished pieces (Android sends each pause's words apart)
    let current = '' // this session's words still being heard
    let shown = ''
    let lastChange = began
    let heard = false
    let sessionAt = began
    let quickEnds = 0
    let restart: ReturnType<typeof setTimeout> | null = null
    const subs: { remove: () => void }[] = []
    const text = () => [committed, finals, current].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

    const finish = (err?: Error) => {
      if (done) return
      done = true
      clearInterval(tick)
      if (restart) clearTimeout(restart)
      subs.forEach((s) => s.remove())
      if (stopCurrent === abort) stopCurrent = null
      try { M.abort() } catch { /* already ended */ }
      if (err) { reject(err); return }
      const said = text()
      resolve(isNoise(said) ? '' : said)
    }
    const abort = () => { committed = ''; finals = ''; current = ''; finish() }

    const start = () => {
      if (done) return
      finals = ''
      current = ''
      sessionAt = Date.now()
      try {
        M.start({
          ...RECOGNIZE,
          // Listens through pauses (Android 13+, iOS); where it still stops
          // on a pause, 'end' below starts it again.
          continuous: true,
          androidIntentOptions: {
            EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 3500,
            EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
            EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 2000,
          },
        })
      } catch (e) {
        finish(new ListenError((e as Error)?.message || 'Could not start listening.'))
      }
    }

    confidence = 0
    subs.push(M.addListener('result', (e) => {
      const t = e.results[0]?.transcript ?? ''
      if (Platform.OS === 'android') {
        if (e.isFinal) { finals = `${finals} ${t}`.trim(); current = '' } else current = t
      } else {
        // iOS: one growing transcript per session.
        current = t
        if (e.isFinal) { finals = t; current = '' }
      }
      if (e.isFinal) confidence = Math.max(0, e.results[0]?.confidence ?? 0)
      const now = text()
      if (now !== shown && !isNoise(now)) {
        shown = now
        heard = true
        lastChange = Date.now()
        onWords?.(now)
      }
    }))
    subs.push(M.addListener('error', (e) => {
      const msg = errorText(e.error)
      if (msg) finish(new ListenError(msg))
      // no-speech / speech-timeout / aborted / busy: 'end' follows and it carries on.
    }))
    subs.push(M.addListener('end', () => {
      if (done) return
      // The recogniser stopped on its own: keep what it heard, and listen on.
      committed = text()
      finals = ''
      current = ''
      // A recogniser that will not run at all must not spin: give up after a few instant stops.
      quickEnds = Date.now() - sessionAt < 400 ? quickEnds + 1 : 0
      if (quickEnds >= 5) { finish(); return }
      restart = setTimeout(start, 120)
    }))
    stopCurrent = abort

    // The turn ends when they have finished: a pause long enough for the
    // words so far, nothing at all for a while, or a minute whatever happens.
    const tick = setInterval(() => {
      const now = Date.now()
      if (!heard) { if (now - began > firstWordMs) finish(); return }
      if (now - lastChange > turnPause(text()) || now - began > 60_000) finish()
    }, 150)

    start()
  })
}

/* Recorded and written down by the server — for a phone without its own
   recognition. A voice is sound well above the room's own level (measured in
   the first half second), for a quarter second or more, so a car, an air
   conditioner or a radio does not open or hold the turn. It ends 1.8 s after
   they stop, after 8 s of nothing, or at 60 s. Metering is dBFS (-160 to 0). */
async function viaServer(recorder: AudioRecorder, onWords?: (text: string) => void): Promise<string> {
  let cancelled = false
  stopCurrent = () => { cancelled = true }
  try {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
    await recorder.prepareToRecordAsync()
    recorder.record()
  } catch (e) {
    stopCurrent = null
    throw new ListenError((e as Error)?.message || 'Could not use the microphone.')
  }
  const began = Date.now()
  let lastLoud = began
  let spoke = false
  let metered = false
  let floor = -50
  let loudFor = 0
  const calib: number[] = []
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const now = Date.now()
      const level = recorder.getStatus().metering
      if (typeof level === 'number') {
        metered = true
        if (now - began < 500) calib.push(level)
        else {
          if (calib.length) { floor = [...calib].sort((a, b) => a - b)[Math.floor(calib.length / 2)]; calib.length = 0 }
          const voice = level > Math.max(-42, floor + 12)
          loudFor = voice ? loudFor + 100 : 0
          if (loudFor >= 250 && !spoke) { spoke = true; onWords?.('…') }
          // Once talking, a little above the background still counts (soft endings, pauses between words).
          if (spoke && level > floor + 6) lastLoud = now
          else if (!spoke) lastLoud = now
        }
      } else if (now - began > 1000) spoke = true
      const quiet = metered ? (spoke ? now - lastLoud > 1800 : now - began > 8000) : now - began > 7000
      if (quiet || now - began > 60_000 || cancelled) { clearInterval(timer); resolve() }
    }, 100)
  })
  stopCurrent = null
  try { await recorder.stop() } catch { /* already stopped */ }
  if (cancelled || !spoke || !recorder.uri) return ''
  try {
    onWords?.('Writing it down…')
    const said = await assistantApi.transcribe(recorder.uri, 'talk')
    return isNoise(said) ? '' : said
  } catch (e) {
    // 422: it could not make anything out — the same as silence.
    if ((e as { response?: { status?: number } })?.response?.status === 422) return ''
    throw new ListenError(apiError(e))
  }
}

/**
 * The mic button: keep listening until stopped, the words typed into the box
 * as they are spoken. Returns a function that stops it (the last words are
 * kept); `onEnd` is called once when it has ended, with an error if any.
 */
export function startDictation(onWords: (text: string) => void, onEnd: (error?: string) => void): () => void {
  cancelListening()
  const M = ExpoSpeechRecognitionModule
  let finals = ''
  let done = false
  const subs: { remove: () => void }[] = []
  const finish = (error?: string) => {
    if (done) return
    done = true
    subs.forEach((s) => s.remove())
    onEnd(error)
  }
  subs.push(M.addListener('result', (e) => {
    const t = e.results[0]?.transcript ?? ''
    // Android sends each pause's words as their own final result; iOS
    // keeps one growing transcript — joining finals covers both.
    if (e.isFinal) {
      finals = Platform.OS === 'android' ? `${finals} ${t}`.trim() : t
      onWords(finals)
    } else {
      onWords(Platform.OS === 'android' ? `${finals} ${t}`.trim() : t)
    }
  }))
  subs.push(M.addListener('error', (e) => {
    const msg = errorText(e.error)
    if (msg) finish(msg)
  }))
  subs.push(M.addListener('end', () => finish()))
  try {
    M.start({
      ...RECOGNIZE,
      // Keeps listening through a pause mid-sentence, and avoids Android's
      // start/stop beep on every pause.
      continuous: true,
      iosCategory: undefined,
      iosVoiceProcessingEnabled: false,
    })
  } catch (e) {
    finish((e as Error)?.message || 'Could not start listening.')
  }
  return () => { try { M.stop() } catch { finish() } }
}

/** "Stop", "okay stop", "that's all", "bye" — the end of the conversation. Pure. */
export function isStop(text: string) {
  return /^\s*(ok(ay)?[,.]?\s+)?(please\s+)?(stop|stop it|stop talking|stop listening|that'?s all|that'?s it|end|finish|bye|goodbye|thanks?,? that'?s (all|it)|nothing else)\b[\s.!]*$/i.test(text)
}

/** A yes to a card read out. Pure. */
export function isYes(text: string) {
  // Not a bare "okay" or "sure": noise and half-heard words come out as those too often to send something on them.
  return /^\s*(yes|yeah|yep|yup|confirm(ed)?|do it|go ahead|go for it|send it|proceed|please do|approved?)\b/i.test(text)
}

/** A no to a card read out. Pure. */
export function isNo(text: string) {
  return /^\s*(no|nope|nah|cancel|don'?t|do not|stop that|not now|leave it|skip)\b/i.test(text)
}

/** Whether listening can run while it speaks (the phone's own recognition), so talking over it stops it. */
export const canInterrupt = () => canRecognize()

const wordsOf = (t: string) => String(t || '').toLowerCase().match(/[a-z0-9']+/g) || []

const FILLER = /^(hmm+|mm+|uh+|um+|uhm+|ah+|er+|erm+|oh|eh|huh|ha+)$/

/** How many words heard are theirs: not words it is saying itself (the speaker coming back) and not fillers. Pure. */
export function theirWords(heard: string, saying: string) {
  const said = new Set(wordsOf(saying))
  return wordsOf(heard).filter((w) => !said.has(w) && !FILLER.test(w)).length
}

/**
 * Whether what the microphone picked up is just its own voice coming back
 * from the speaker, or a noise read as a word: fewer than `need` words of
 * theirs. Pure.
 */
export function isEcho(heard: string, saying: string, need = 2) {
  return theirWords(heard, saying) < need
}

/** Their words with its own voice cut off the front ("…go ahead? Book it for Friday" → "Book it for Friday"). Pure. */
export function withoutEcho(heard: string, saying: string) {
  const said = new Set(wordsOf(saying))
  const parts = String(heard || '').trim().split(/\s+/)
  while (parts.length > 1 && said.has((parts[0].toLowerCase().match(/[a-z0-9']+/) || [''])[0])) parts.shift()
  return parts.join(' ')
}

/* A short two-note chime — "your turn" — played quietly. */
const CHIME = require('../../assets/chime.wav')
let chimePlayer: AudioPlayer | null = null
export function chime() {
  try {
    if (!chimePlayer) { chimePlayer = createAudioPlayer(CHIME); chimePlayer.volume = 0.5 }
    void chimePlayer.seekTo(0).then(() => chimePlayer?.play()).catch(() => {})
  } catch { /* no audio */ }
}
