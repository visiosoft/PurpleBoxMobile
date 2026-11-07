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

/** Listen for one thing said. Resolves with the words, or '' when nothing was said. */
export function listenOnce(
  onWords?: (text: string) => void,
  opts: { recorder?: AudioRecorder | null; serverVoice?: boolean } = {},
): Promise<string> {
  cancelListening()
  if (canRecognize()) return viaPhone(onWords)
  if (opts.recorder && opts.serverVoice) return viaServer(opts.recorder)
  return Promise.reject(new ListenError('This phone has no speech recognition — install or enable Google speech services.'))
}

function viaPhone(onWords?: (text: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const M = ExpoSpeechRecognitionModule
    let said = ''
    let done = false
    const subs: { remove: () => void }[] = []
    let cap: ReturnType<typeof setTimeout> | null = null
    const finish = (err?: Error) => {
      if (done) return
      done = true
      if (cap) clearTimeout(cap)
      subs.forEach((s) => s.remove())
      if (stopCurrent === abort) stopCurrent = null
      if (err) reject(err)
      else resolve(said.trim())
    }
    const abort = () => { said = ''; try { M.abort() } catch { /* already ended */ } finish() }
    confidence = 0
    subs.push(M.addListener('result', (e) => {
      const t = e.results[0]?.transcript
      if (t != null) { said = t; onWords?.(said) }
      if (e.isFinal) confidence = Math.max(0, e.results[0]?.confidence ?? 0)
    }))
    subs.push(M.addListener('error', (e) => {
      const msg = errorText(e.error)
      if (msg) finish(new ListenError(msg))
      // no-speech / speech-timeout / aborted / busy: nothing said; 'end' follows.
    }))
    subs.push(M.addListener('end', () => finish()))
    stopCurrent = abort
    // One question is never this long: stop and take what was heard.
    cap = setTimeout(() => { try { M.stop() } catch { finish() } }, 30_000)
    try {
      M.start({ ...RECOGNIZE, continuous: false })
    } catch (e) {
      finish(new ListenError((e as Error)?.message || 'Could not start listening.'))
    }
  })
}

/* Stop when they go quiet: 1.4 s of quiet after speech, 8 s of nothing at
   all, or 40 s whatever happens. Metering is in dBFS (about -160 to 0). */
async function viaServer(recorder: AudioRecorder): Promise<string> {
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
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const now = Date.now()
      const level = recorder.getStatus().metering
      if (typeof level === 'number') {
        metered = true
        if (level > -38) { spoke = true; lastLoud = now }
      } else if (now - began > 1000) spoke = true
      const quiet = metered ? (spoke ? now - lastLoud > 1400 : now - began > 8000) : now - began > 7000
      if (quiet || now - began > 40_000 || cancelled) { clearInterval(timer); resolve() }
    }, 100)
  })
  stopCurrent = null
  try { await recorder.stop() } catch { /* already stopped */ }
  if (cancelled || !spoke || !recorder.uri) return ''
  try {
    return await assistantApi.transcribe(recorder.uri)
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
  return /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|confirm(ed)?|do it|go ahead|go for it|send it|proceed|correct|that'?s right|please do|approved?)\b/i.test(text)
}

/** A no to a card read out. Pure. */
export function isNo(text: string) {
  return /^\s*(no|nope|nah|cancel|don'?t|do not|stop that|not now|leave it|skip)\b/i.test(text)
}

/** Whether listening can run while it speaks (the phone's own recognition), so talking over it stops it. */
export const canInterrupt = () => canRecognize()

const wordsOf = (t: string) => String(t || '').toLowerCase().match(/[a-z0-9']+/g) || []

/**
 * Whether what the microphone picked up is just its own voice coming back
 * from the speaker: most of the words heard are words it is saying. Pure.
 */
export function isEcho(heard: string, saying: string) {
  const h = wordsOf(heard)
  if (!h.length) return true
  const said = new Set(wordsOf(saying))
  const own = h.filter((w) => said.has(w)).length
  // Every word is its own, or one stray word among its own: the speaker, not them.
  return h.length - own === 0 || (h.length - own === 1 && own >= 2)
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
