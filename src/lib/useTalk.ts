import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { useAudioRecorder, RecordingPresets } from 'expo-audio'
import { speakText, stopSpeaking } from './speech'
import {
  askListenPermission, canRecognize, cancelListening, isNo, isStop, isYes, listenOnce, ListenError, prepareTalkAudio,
} from './talk'

type Card = { id: string; summary: string[] }
export type TalkAnswer = { content: string; pendings?: Card[]; form?: unknown }
export type TalkState = 'off' | 'listening' | 'thinking' | 'speaking'

const WAKE_TAG = 'pb-talk'

/**
 * Talk mode: a conversation by voice, for the car. It listens, sends what was
 * said, reads the answer aloud, and listens again — until Stop is pressed or
 * "stop" is said. A card that would create or send something is read out in
 * full first and done only on a spoken "yes"; "no" cancels it. The chat stays
 * as it is when it ends. A port of the web's lib/useTalk.ts.
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

  // Leaving the screen ends the conversation; so does the app going to the
  // background — there is no listening with the phone locked.
  useEffect(() => () => { run.current += 1; cancelListening(); stopSpeaking(); deactivateKeepAwake(WAKE_TAG) }, [])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'background' && run.current && state !== 'off') stop() })
    return () => sub.remove()
  })

  const say = (text: string, id: number) => new Promise<void>((resolve) => {
    if (id !== run.current || !text.trim()) { resolve(); return }
    setState('speaking')
    if (!speakText(text, () => resolve())) resolve()
  })

  /** What it says back for an answer, and the card waiting for a yes, if any. */
  function spoken(a: TalkAnswer | null, offset = 0): { text: string; card: Card | null } {
    if (!a) return { text: 'Sorry, that did not work. Try again.', card: null }
    const card = a.pendings?.[offset] || null
    let text = offset ? '' : a.content
    if (card) text += ` ${offset ? 'Next' : 'Here is what I will do'}: ${card.summary.join('. ')}. Shall I go ahead? Say yes or no.`
    else if (a.form) text += ' The details are on the screen — tell me what to fill in, or say stop.'
    return { text, card }
  }

  async function loop(id: number) {
    let waiting: { answer: TalkAnswer; card: Card; index: number } | null = null
    let misses = 0
    while (id === run.current) {
      setWords('')
      setState('listening')
      let heard: string
      try {
        // Never listen while speaking: a moment for the speaker to fall quiet.
        await new Promise((r) => setTimeout(r, 250))
        if (id !== run.current) return
        heard = await listenOnce((t) => { if (id === run.current) setWords(t) }, { recorder: recorderRef.current, serverVoice: serverVoiceRef.current })
      } catch (e) {
        if (id !== run.current) return
        setError(e instanceof ListenError ? e.message : 'Could not hear that.')
        stop()
        return
      }
      if (id !== run.current) return
      if (!heard) {
        misses += 1
        if (misses >= 4) { await say('I will stop here. Tap Talk when you need me.', id); stop(); return }
        continue
      }
      misses = 0
      setWords(heard)
      if (isStop(heard)) { await say(waiting ? 'Okay, I have left that card for you on the screen.' : 'Okay.', id); stop(); return }

      if (waiting && (isYes(heard) || isNo(heard))) {
        const go = isYes(heard)
        setState('thinking')
        const msg = await decideRef.current(go, waiting.card.id)
        if (id !== run.current) return
        const next: number = waiting.index + 1
        const more: Card | undefined = waiting.answer.pendings?.[next]
        const back = go ? (msg || 'Done.') : 'Cancelled — nothing was done.'
        if (more) {
          const s = spoken(waiting.answer, next)
          waiting = { answer: waiting.answer, card: more, index: next }
          await say(`${back} ${s.text}`, id)
        } else {
          waiting = null
          await say(back, id)
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
      await say(s.text, id)
    }
  }

  async function start() {
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
    if (!speakText('I am listening.', () => { if (id === run.current) void loop(id) })) void loop(id)
  }

  function stop() {
    deactivateKeepAwake(WAKE_TAG)
    run.current += 1
    cancelListening()
    stopSpeaking()
    setState('off')
    setWords('')
  }

  return { state, words, error, active: state !== 'off', start, stop, clearError: () => setError('') }
}
