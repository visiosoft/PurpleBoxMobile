import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { useAudioRecorder, RecordingPresets } from 'expo-audio'
import { speakText, stopSpeaking, warmVoice } from './speech'
import {
  askListenPermission, canInterrupt, canRecognize, cancelListening, chime, isEcho, isNo, isStop, isYes, lastConfidence,
  listenOnce, ListenError, prepareTalkAudio,
} from './talk'

type Card = { id: string; summary: string[] }
export type TalkAnswer = { content: string; pendings?: Card[]; form?: unknown }
export type TalkState = 'off' | 'listening' | 'thinking' | 'speaking'

const WAKE_TAG = 'pb-talk'

/* What it says most — fetched in the human voice ahead of time so they start at once. */
const PHRASES = [
  'Listening.', 'One moment.', 'Cancelled.', 'Stopped.', 'Done.',
  'Sorry, I didn\'t catch that. Could you say it again?', 'Are you still there?',
  'Okay — say it again.', 'Stopping. Tap Talk when you need me.',
]

/** At most a few short sentences: it is heard, not read. Pure. */
export const brief = (t: string, sentences = 2) =>
  String(t || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/).slice(0, sentences).join(' ')

/**
 * Talk mode: a conversation by voice, for the car — the web's lib/useTalk.ts.
 *
 * It listens, asks, answers out loud in a human voice, and listens again.
 * It listens while it speaks too: talking over it stops it at once and what
 * is being said becomes the next turn (its own voice coming back from the
 * speaker is ignored — isEcho — so its "confirm" is never taken for theirs).
 * When it hears nothing it asks again; when it is not sure what it heard it
 * asks "Did you say…?". A card is done only on a spoken confirm and cancelled
 * on a no. The chat stays as it is when it ends.
 */
export function useTalk({ ask, decide, serverVoice }: {
  ask: (text: string) => Promise<TalkAnswer | null>
  decide: (go: boolean, id: string) => Promise<string | null>
  /** The server can write speech down (capabilities.voice) — the fallback
   *  for a phone without its own speech recognition. */
  serverVoice?: boolean
}) {
  const [state, setState] = useState<TalkState>('off')
  const [words, setWords] = useState('')
  const [error, setError] = useState('')
  const run = useRef(0)
  const askRef = useRef(ask)
  const decideRef = useRef(decide)
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true })
  const recorderRef = useRef(recorder)
  const serverVoiceRef = useRef(serverVoice)
  useEffect(() => { askRef.current = ask; decideRef.current = decide; recorderRef.current = recorder; serverVoiceRef.current = serverVoice })

  // Leaving the screen ends the conversation.
  useEffect(() => () => { run.current += 1; cancelListening(); stopSpeaking(); deactivateKeepAwake(WAKE_TAG) }, [])

  const listen = (id: number) => listenOnce((t) => { if (id === run.current) setWords(t) }, { recorder: recorderRef.current, serverVoice: serverVoiceRef.current })

  /**
   * Says it — and listens at the same time, so talking over it stops it at
   * once. When it finishes, the same listening carries on as their turn, so
   * words started just as it stopped are not lost. Resolves with what they
   * said and whether it was listening at all.
   */
  const say = (text: string, id: number, opts: { listen?: boolean } = {}) => new Promise<{ heard: string; listened: boolean }>((resolve) => {
    if (id !== run.current || !text.trim()) { resolve({ heard: '', listened: false }); return }
    setState('speaking')
    let done = false
    let cut = false
    let speaking = true
    let guarding = false
    const finish = (heard: string, listened: boolean) => { if (!done) { done = true; resolve({ heard, listened }) } }
    const cutIn = (heard: string) => {
      if (cut) return
      cut = true
      speaking = false
      stopSpeaking()
      chime()
      setState('listening')
      setWords(heard)
    }
    const guard = async () => {
      guarding = true
      while (!done && id === run.current) {
        let heard: string
        try {
          heard = await listenOnce((t) => {
            if (id !== run.current) return
            if (cut || !speaking) setWords(t)
            else if (!isEcho(t, text)) cutIn(t)
          })
        } catch { finish('', false); return }
        if (cut) { finish(heard, true); return }
        const theirs = heard && !isEcho(heard, text) ? heard : ''
        if (theirs) { if (speaking) cutIn(theirs); finish(theirs, true); return }
        // Finished talking and nothing (of theirs) was said: their turn was silent.
        if (!speaking) { finish('', true); return }
      }
    }
    speakText(text, () => {
      if (cut) return
      speaking = false
      if (guarding) { setState('listening'); setWords(''); chime() } else finish('', false)
    })
    if (opts.listen !== false && canInterrupt()) setTimeout(() => { if (!done && id === run.current) void guard() }, 350)
  })

  /** What it says back for an answer, and the card waiting for a confirm, if any. */
  function spoken(a: TalkAnswer | null, offset = 0): { text: string; card: Card | null } {
    if (!a) return { text: 'Sorry, that did not work. Try again.', card: null }
    const card = a.pendings?.[offset] || null
    // The card is on the screen in full; out loud it is one line and a question.
    if (card) return { text: `${offset ? `Next: ${card.summary[0] || ''}.` : brief(a.content || card.summary[0] || '', 2)} Confirm or cancel?`, card }
    if (a.form) return { text: `${brief(a.content, 1)} Tell me the details.`, card: null }
    return { text: brief(a.content, 3), card: null }
  }

  async function loop(id: number) {
    let waiting: { answer: TalkAnswer; card: Card; index: number } | null = null
    let misses = 0
    let turn: { heard: string; listened: boolean } | null = null
    while (id === run.current) {
      let heard: string
      let sure = true
      if (turn?.listened) {
        heard = turn.heard
      } else {
        setWords('')
        setState('listening')
        try {
          // Never listen while speaking: a moment for the speaker to fall quiet.
          await new Promise((r) => setTimeout(r, 250))
          if (id !== run.current) return
          chime()
          heard = await listen(id)
          const c = lastConfidence()
          sure = !(c > 0 && c < 0.45)
        } catch (e) {
          if (id !== run.current) return
          setError(e instanceof ListenError ? e.message : 'Could not hear that.')
          stop()
          return
        }
      }
      turn = null
      if (id !== run.current) return

      // Nothing heard: ask again, then check they are still there, then stop.
      if (!heard) {
        misses += 1
        if (misses >= 4) { await say('Stopping. Tap Talk when you need me.', id, { listen: false }); stop(); return }
        if (misses === 1) turn = await say('Sorry, I didn\'t catch that. Could you say it again?', id)
        else if (misses === 2) turn = await say('Are you still there?', id)
        continue
      }
      misses = 0
      setWords(heard)
      if (isStop(heard)) { await say(waiting ? 'Stopped. The card is on the screen.' : 'Stopped.', id, { listen: false }); stop(); return }

      // Not sure what it heard: check before acting on it.
      if (!sure && !isYes(heard) && !isNo(heard)) {
        const check = await say(`Did you say: ${heard}?`, id)
        let reply = check.listened ? check.heard : ''
        if (!check.listened) {
          setState('listening')
          chime()
          try { reply = await listen(id) } catch { reply = '' }
        }
        if (id !== run.current) return
        if (!isYes(reply)) {
          turn = reply && !isNo(reply) ? { heard: reply, listened: true } : await say('Okay — say it again.', id)
          continue
        }
      }

      if (waiting && (isYes(heard) || isNo(heard))) {
        const go = isYes(heard)
        setState('thinking')
        const msg = await decideRef.current(go, waiting.card.id)
        if (id !== run.current) return
        const next: number = waiting.index + 1
        const more: Card | undefined = waiting.answer.pendings?.[next]
        const back = go ? brief(msg || 'Done.', 1) : 'Cancelled.'
        if (more) {
          const s = spoken(waiting.answer, next)
          waiting = { answer: waiting.answer, card: more, index: next }
          turn = await say(`${back} ${s.text}`, id)
        } else {
          waiting = null
          turn = await say(back, id)
        }
        continue
      }

      // Anything else is the next question (a card left waiting stays on the screen).
      waiting = null
      setState('thinking')
      // A slow answer gets a word, so silence on the road is not mistaken for a dropped line.
      const nudge = setTimeout(() => { if (id === run.current) speakText('One moment.') }, 2500)
      const answer = await askRef.current(heard)
      clearTimeout(nudge)
      if (id !== run.current) return
      const s = spoken(answer)
      if (answer && s.card) waiting = { answer, card: s.card, index: 0 }
      turn = await say(s.text, id)
    }
  }

  async function start() {
    if (state !== 'off') return
    if (!canRecognize() && !serverVoice) {
      setError('This phone has no speech recognition — install or enable Google speech services.')
      return
    }
    setError('')
    if (!(await askListenPermission())) {
      setError('Allow the microphone and speech recognition to talk to it.')
      return
    }
    // The screen stays on while talking: a phone that locks itself stops the
    // microphone, which ends the conversation mid-drive.
    void activateKeepAwakeAsync(WAKE_TAG).catch(() => {})
    prepareTalkAudio()
    run.current += 1
    const id = run.current
    setState('speaking')
    speakText('Listening.', () => { if (id === run.current) void loop(id) })
  }

  /** Tap while it is speaking: it stops and listens. */
  function interrupt() {
    if (state === 'speaking') stopSpeaking()
  }

  function stop() {
    deactivateKeepAwake(WAKE_TAG)
    run.current += 1
    cancelListening()
    stopSpeaking()
    setState('off')
    setWords('')
  }

  /** Stop pressed: says so in a word, and ends. */
  function end() {
    stop()
    speakText('Stopped.')
  }

  // The app going to the background ends it: there is no listening with the phone locked.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'background' && state !== 'off') stop() })
    return () => sub.remove()
  })

  return { state, words, error, active: state !== 'off', start, stop: end, interrupt, warm: () => warmVoice(PHRASES), clearError: () => setError('') }
}
