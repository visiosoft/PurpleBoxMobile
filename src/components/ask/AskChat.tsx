import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import { useAudioRecorder, RecordingPresets, setAudioModeAsync, requestRecordingPermissionsAsync } from 'expo-audio'
import { COLORS, FONTS, SHADOWS, GRADIENT_PRIMARY, GRADIENT_PRIMARY_LOCATIONS } from '../../lib/theme'
import { LinearGradient } from 'expo-linear-gradient'
import { assistantApi, toAnswer, type Answer, type AssistantContext } from '../../lib/assistant'
import { apiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { notify } from '../../lib/alert'
import { speakText, stopSpeaking } from '../../lib/speech'
import { askListenPermission, canRecognize, startDictation } from '../../lib/talk'
import { useTalk, type TalkState } from '../../lib/useTalk'
import PressableScale from '../PressableScale'
import AnswerView, { AnswerActions } from './AnswerView'
import ForYouToday from './ForYouToday'
import { ChatsSheet, DevRequestsSheet, LearnedSheet, ScheduledSheet, SkillsSheet } from './AskSheets'

type Msg = { role: 'user' | 'assistant'; content: string; answer?: Answer | null }

const CHAT_KEY = 'pb_ask_chat'
const WEB_KEY = 'pb_ask_web'
const VOICE_KEY = 'pb_ask_voice'

export const STARTERS = [
  'Book a unit',
  'Make a quotation',
  'Raise an invoice',
  'Who is past check-out?',
  'Open client requests',
  "Today's leads as a PDF",
  'Which contracts expire in the next 15 days?',
  'Who is on shift now?',
]

/**
 * The Ask box: one running chat with the system — the web's DashboardAsk.
 *
 * The conversation is kept on the server, per person, so a follow-up ("what
 * about 35 sq ft? book that for him") carries the name, phone, size and dates
 * from earlier, and the chat is the same on the web. New chat starts a clean
 * one; earlier chats are in Chats. Bookings and quotations happen in the
 * chat: it asks for what it needs in boxes, prepares a card, and nothing is
 * created or sent until Confirm — or a spoken "yes" in Talk mode.
 */
export default function AskChat({
  context, initialQuestion, startFresh, onClose, onNavigate, starters, title = 'Ask AI', variant = 'chat', talkNonce = '', typeNonce = '', onDashboard,
}: {
  /** 'home': the app's first page — a big Talk button over the chat. */
  variant?: 'chat' | 'home'
  /** Changes to start Talk mode at once (the home-screen widget). */
  talkNonce?: string | number
  /** Changes to put the cursor in the box (the widget's Type button). */
  typeNonce?: string | number
  /** Shown as a Dashboard button (the home page). */
  onDashboard?: () => void
  /** The screen (and lead) it was opened from — sent with every question. */
  context?: AssistantContext
  /** Asked at once, in a new chat. */
  initialQuestion?: string
  /** Open on a new chat rather than the last one. */
  startFresh?: boolean
  /** Shown as a close button (the full-screen sheet). */
  onClose?: () => void
  /** Called before a link opens another screen. */
  onNavigate?: () => void
  /** This screen's own starters; the general ones otherwise. */
  starters?: string[]
  title?: string
}) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [chatId, setChatId] = useState('')
  const [chatTitle, setChatTitle] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState(false)
  const [err, setErr] = useState('')
  const [loadingChat, setLoadingChat] = useState(false)
  const [web, setWeb] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false)
  const [sheet, setSheet] = useState<'' | 'chats' | 'learned' | 'skills' | 'dev' | 'scheduled'>('')
  const [showToday, setShowToday] = useState(false)
  const scroller = useRef<ScrollView>(null)
  const inputRef = useRef<TextInput>(null)
  const stick = useRef(true)
  const busyRef = useRef(false)
  const chatRef = useRef('')

  const { data: caps, isLoading: capsLoading } = useQuery({ queryKey: ['assistant-capabilities'], queryFn: assistantApi.capabilities, staleTime: 5 * 60_000 })

  function setChat(id: string) {
    chatRef.current = id
    setChatId(id)
    void AsyncStorage.setItem(CHAT_KEY, id).catch(() => {})
  }

  /* The chat this person was in, as they left it. */
  async function load(id: string) {
    setLoadingChat(true)
    try {
      const data = await assistantApi.chat(id)
      setMsgs(data.messages.map((m) => ({
        role: m.role, content: m.content, answer: m.role === 'assistant' ? toAnswer(m.answer || { content: m.content }) : null,
      })))
      setChatTitle(data.title)
      setChat(id)
      stick.current = true
    } catch {
      newChat()
    } finally {
      setLoadingChat(false)
    }
  }

  function newChat() {
    stopSpeaking()
    setMsgs([])
    setChatTitle('')
    setChat('')
    setErr('')
    setQ('')
  }

  // Once, on opening: the remembered toggles, then the last chat or a new one.
  useEffect(() => {
    let alive = true
    void (async () => {
      const [w, v, last] = await Promise.all([
        AsyncStorage.getItem(WEB_KEY).catch(() => null),
        AsyncStorage.getItem(VOICE_KEY).catch(() => null),
        AsyncStorage.getItem(CHAT_KEY).catch(() => null),
      ])
      if (!alive) return
      setWeb(w === '1')
      setVoiceOn(v === '1')
      if (initialQuestion) { newChat(); void ask(initialQuestion, true); return }
      if (startFresh) { newChat(); return }
      if (last) void load(last)
    })()
    return () => { alive = false; stopSpeaking() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleWeb = () => setWeb((w) => { void AsyncStorage.setItem(WEB_KEY, w ? '0' : '1').catch(() => {}); return !w })
  const toggleVoice = () => setVoiceOn((v) => { if (v) stopSpeaking(); void AsyncStorage.setItem(VOICE_KEY, v ? '0' : '1').catch(() => {}); return !v })

  async function ask(text: string, fresh = false, extra?: { eid?: string; spoken?: boolean }): Promise<Answer | null> {
    const question = text.trim()
    if (!question || busyRef.current) return null
    const id = fresh ? '' : chatRef.current
    if (fresh) { setMsgs([]); setChatTitle(''); setChat('') }
    busyRef.current = true
    setBusy(true)
    setErr('')
    setQ('')
    stick.current = true
    setMsgs((m) => [...(fresh ? [] : m), { role: 'user', content: question }])
    try {
      const data = await assistantApi.ask({
        question, chatId: id || undefined, web: Boolean(caps?.web && web), spoken: extra?.spoken, eid: extra?.eid, context,
      })
      if (data.chatId) setChat(data.chatId)
      if (!id) setChatTitle(question.slice(0, 80))
      const answer = toAnswer(data)
      setMsgs((m) => [...m, { role: 'assistant', content: answer.content, answer }])
      // Talk mode reads it out itself, with the card that waits for a yes.
      if (!extra?.spoken && voiceOn) speakText(answer.content)
      qc.invalidateQueries({ queryKey: ['assistant-chats'] })
      return answer
    } catch (e) {
      setErr(apiError(e))
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function decide(go: boolean, pendingId: string): Promise<string | null> {
    if (go) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    setActing(true)
    setErr('')
    try {
      const data = go ? await assistantApi.confirm(pendingId, chatRef.current) : await assistantApi.cancel(pendingId, chatRef.current)
      if (go) {
        void Haptics.notificationAsync(data.ok === false ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success).catch(() => {})
      }
      stick.current = true
      setMsgs((m) => {
        const from = m.find((x) => x.answer?.pendings.some((p) => p.id === pendingId))?.answer
        const left = (from?.pendings || []).filter((p) => p.id !== pendingId)
        // The waiting step is offered once its cards are all decided, and only after a Confirm.
        const next = go && data.ok !== false && !left.length ? from?.next || '' : ''
        const extra = 'pdfPath' in data ? data : {}
        return [
          ...m.map((x) => (x.answer?.pendings.some((p) => p.id === pendingId)
            ? { ...x, answer: { ...x.answer, pendings: left, ...(left.length ? {} : { next: '' }) } }
            : x)),
          { role: 'assistant', content: data.message, answer: toAnswer({ content: data.message, ...extra, next }) },
        ]
      })
      return data.message || null
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 410) {
        // The card itself says it has expired, with a way to prepare it again.
        const past = new Date(0).toISOString()
        setMsgs((m) => m.map((x) => (x.answer?.pendings.some((p) => p.id === pendingId)
          ? { ...x, answer: { ...x.answer, pendings: x.answer.pendings.map((p) => (p.id === pendingId ? { ...p, expiresAt: past } : p)) } }
          : x)))
        return 'That card has expired, so nothing was done.'
      }
      if (go) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setErr(apiError(e))
      return 'That did not work: ' + apiError(e)
    } finally {
      setActing(false)
    }
  }

  // Talk mode: a spoken conversation in this same chat.
  const talk = useTalk({
    ask: (text) => ask(text, false, { spoken: true }),
    decide,
    serverVoice: caps?.voice,
  })
  const talkRef = useRef(talk)
  useEffect(() => { talkRef.current = talk })

  // The human voice's common phrases, fetched once it is known the box is on.
  const ready = Boolean(caps?.enabled && caps?.allowed)
  useEffect(() => { if (ready) talkRef.current.warm() }, [ready])

  // The widget's Talk button: start talking as soon as the box is ready.
  useEffect(() => {
    if (!talkNonce || !ready) return
    const t = setTimeout(() => { stopSpeaking(); void talkRef.current.start() }, 400)
    return () => clearTimeout(t)
  }, [talkNonce, ready])
  // The widget's Type button: the cursor in the box.
  useEffect(() => {
    if (!typeNonce || !ready) return
    const t = setTimeout(() => inputRef.current?.focus(), 400)
    return () => clearTimeout(t)
  }, [typeNonce, ready])

  if (capsLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
        <Header title={title} insetTop={insets.top} onClose={onClose} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.brand} /></View>
      </View>
    )
  }
  if (!caps?.enabled || !caps?.allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
        <Header title={title} insetTop={insets.top} onClose={onClose} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="sparkles-outline" size={40} color={COLORS.faint} />
          <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink3, marginTop: 14, textAlign: 'center' }}>
            {!caps ? 'Could not reach the assistant — check your connection.' : caps.enabled ? "Your role doesn't have access to the AI assistant." : "The AI assistant isn't turned on for this account."}
          </Text>
        </View>
      </View>
    )
  }

  const lastAssistant = msgs.map((m) => m.role).lastIndexOf('assistant')
  const empty = !msgs.length && !busy && !loadingChat

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <Header title={title} insetTop={insets.top} onClose={onClose} onDashboard={onDashboard}
        subtitle={chatTitle || (context?.name ? `About ${context.name}` : 'New chat')} />

      {/* The chat's own bar: start again, earlier chats, what it learned, and the switches. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingBottom: 10 }}>
        <Chip icon="add" label="New chat" onPress={newChat} />
        <Chip icon="time-outline" label="Chats" onPress={() => setSheet('chats')} />
        <Chip icon="book-outline" label="Learned" onPress={() => setSheet('learned')} />
        <Chip icon="extension-puzzle-outline" label="Skills" onPress={() => setSheet('skills')} />
        {admin && <Chip icon="construct-outline" label="To build" onPress={() => setSheet('dev')} />}
        <Chip icon="alarm-outline" label="Scheduled" onPress={() => setSheet('scheduled')} />
        <Chip icon={voiceOn ? 'volume-high' : 'volume-mute-outline'} label="Voice" on={voiceOn} onPress={toggleVoice} />
      </ScrollView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scroller}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18, gap: 18 }}
          onContentSizeChange={() => { if (stick.current) scroller.current?.scrollToEnd({ animated: true }) }}
          onScrollBeginDrag={() => { stick.current = false }}
        >
          {loadingChat && <ActivityIndicator color={COLORS.brand} style={{ marginTop: 24 }} />}
          {empty && variant === 'home' && (
            <HomeHero
              name={user?.name}
              onTalk={() => { stopSpeaking(); void talk.start() }}
              showToday={showToday}
              onToggleToday={() => setShowToday((v) => !v)}
            />
          )}
          {empty && (variant !== 'home' || showToday) && (
            <ForYouToday starters={starters?.length ? starters : STARTERS} onDo={(t) => { void ask(t, true) }} />
          )}
          {msgs.map((m, i) => (m.role === 'user' ? (
            <View key={i} style={{ alignItems: 'flex-end' }}>
              <View style={{ maxWidth: '85%', backgroundColor: COLORS.purple100, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 15, paddingVertical: 10 }}>
                <Text selectable style={{ fontFamily: FONTS.body, fontSize: 15, lineHeight: 21, color: COLORS.ink }}>{m.content}</Text>
              </View>
            </View>
          ) : (
            <View key={i}>
              <AnswerView
                answer={m.answer || toAnswer({ content: m.content })}
                live={i === lastAssistant && !busy}
                busy={busy}
                acting={acting}
                onAsk={(t, extra) => { void ask(t, false, extra) }}
                onDecide={decide}
                onNavigate={onNavigate}
              />
              <AnswerActions
                text={(m.answer || toAnswer({ content: m.content })).content}
                onRetry={i === lastAssistant && !busy && !talk.active ? () => {
                  const prev = [...msgs.slice(0, i)].reverse().find((x) => x.role === 'user')
                  if (prev) void ask(prev.content)
                } : undefined}
              />
            </View>
          )))}
          {busy && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, ...SHADOWS.card }}>
              <ActivityIndicator size="small" color={COLORS.purple600} />
              <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink3 }}>
                {web && caps.web ? 'Thinking — checking the system and the web…' : 'Thinking — checking the system…'}
              </Text>
            </View>
          )}
          {!!err && <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.danger }}>{err}</Text>}
        </ScrollView>

        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), borderTopWidth: 1, borderTopColor: COLORS.lineSoft, backgroundColor: COLORS.paper }}>
          {talk.active || talk.error ? (
            <TalkBar state={talk.state} words={talk.words} error={talk.error} onStop={talk.stop} onInterrupt={talk.interrupt} onDismiss={talk.clearError} />
          ) : (
            <Composer
              value={q}
              onChange={setQ}
              onSend={() => { void ask(q) }}
              busy={busy}
              hasMsgs={msgs.length > 0}
              web={web}
              showWeb={!!caps.web}
              onToggleWeb={toggleWeb}
              serverVoice={!!caps.voice}
              onTalk={() => { stopSpeaking(); void talk.start() }}
              inputRef={inputRef}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      <ChatsSheet visible={sheet === 'chats'} onClose={() => setSheet('')} currentId={chatId} onOpen={(id) => { void load(id) }} onNew={newChat}
        onDeleted={(id) => { if (id === chatRef.current) newChat() }} />
      <LearnedSheet visible={sheet === 'learned'} onClose={() => setSheet('')} />
      <SkillsSheet visible={sheet === 'skills'} onClose={() => setSheet('')} admin={admin} />
      {admin && <DevRequestsSheet visible={sheet === 'dev'} onClose={() => setSheet('')} />}
      <ScheduledSheet visible={sheet === 'scheduled'} onClose={() => setSheet('')} />
    </View>
  )
}

/** The home page's empty state: a greeting and one big button to start talking. */
function HomeHero({ name, onTalk, showToday, onToggleToday }: {
  name?: string; onTalk: () => void; showToday: boolean; onToggleToday: () => void
}) {
  const h = new Date().getHours()
  const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 8, gap: 6 }}>
      <Text style={{ fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink, textAlign: 'center' }}>
        {hello}{name ? `, ${name.split(' ')[0]}` : ''}
      </Text>
      <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: COLORS.ink3, textAlign: 'center' }}>What can I do for you?</Text>
      <PressableScale onPress={onTalk} accessibilityLabel="Talk to the AI" style={{ marginTop: 26, borderRadius: 80, ...SHADOWS.raised }}>
        <LinearGradient colors={GRADIENT_PRIMARY} locations={GRADIENT_PRIMARY_LOCATIONS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="mic" size={58} color="#fff" />
        </LinearGradient>
      </PressableScale>
      <Text style={{ marginTop: 16, fontFamily: FONTS.bodyBold, fontSize: 17, color: COLORS.ink }}>Tap to talk</Text>
      <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3, textAlign: 'center', paddingHorizontal: 24 }}>
        Ask anything, or say “quote a 25 sq ft unit”. Talk over it to interrupt; say “stop” to end. Or type below.
      </Text>
      <PressableScale onPress={onToggleToday}
        style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: COLORS.control }}>
        <Ionicons name={showToday ? 'chevron-up' : 'sunny-outline'} size={16} color={COLORS.ink2} />
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: COLORS.ink2 }}>{showToday ? 'Hide what needs you today' : 'What needs you today'}</Text>
      </PressableScale>
    </View>
  )
}

function Header({ title, subtitle, insetTop, onClose, onDashboard }: {
  title: string; subtitle?: string; insetTop: number; onClose?: () => void; onDashboard?: () => void
}) {
  return (
    <View style={{ paddingTop: insetTop + 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.purple600, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="sparkles" size={16} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink }}>{title}</Text>
        {!!subtitle && <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink3 }}>{subtitle}</Text>}
      </View>
      {onDashboard && (
        <PressableScale onPress={onDashboard} accessibilityLabel="Open the dashboard"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: COLORS.control }}>
          <Ionicons name="grid-outline" size={15} color={COLORS.ink2} />
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.ink2 }}>Dashboard</Text>
        </PressableScale>
      )}
      {onClose && (
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={COLORS.ink2} />
        </Pressable>
      )}
    </View>
  )
}

function Chip({ icon, label, onPress, on }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; on?: boolean }) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 999,
        backgroundColor: on ? COLORS.purple600 : '#fff', borderWidth: on ? 0 : 1, borderColor: COLORS.line,
      }}>
      <Ionicons name={icon} size={14} color={on ? '#fff' : COLORS.ink2} />
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: on ? '#fff' : COLORS.ink2 }}>{label}</Text>
    </PressableScale>
  )
}

function RoundBtn({ icon, onPress, label, tone = 'plain', disabled, size = 44, text }: {
  icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string; tone?: 'plain' | 'brand' | 'danger' | 'on'
  disabled?: boolean; size?: number; text?: string
}) {
  const bg = tone === 'brand' ? COLORS.purple600 : tone === 'danger' ? '#DC2626' : tone === 'on' ? COLORS.purple100 : COLORS.control
  const fg = tone === 'brand' || tone === 'danger' ? '#fff' : tone === 'on' ? COLORS.purple700 : COLORS.ink2
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityLabel={label}
      style={{
        height: size, minWidth: size, paddingHorizontal: text ? 16 : 0, borderRadius: size / 2, backgroundColor: bg,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: disabled ? 0.4 : 1,
      }}>
      <Ionicons name={icon} size={19} color={fg} />
      {!!text && <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: fg }}>{text}</Text>}
    </PressableScale>
  )
}

/**
 * The input: type, or press Mic and speak (the words land in the box to check
 * before sending), Web for one question that reads the internet, Talk for a
 * hands-free conversation, and Send. Buttons sit along the bottom, large, for
 * one hand.
 */
function Composer({ value, onChange, onSend, busy, hasMsgs, web, showWeb, onToggleWeb, serverVoice, onTalk, inputRef }: {
  value: string; onChange: (t: string) => void; onSend: () => void; busy: boolean; hasMsgs: boolean
  web: boolean; showWeb: boolean; onToggleWeb: () => void; serverVoice: boolean; onTalk: () => void
  inputRef: React.RefObject<TextInput | null>
}) {
  const [mic, setMic] = useState<'idle' | 'recording' | 'working'>('idle')
  const stopRef = useRef<(() => void) | null>(null)
  const base = useRef('')
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const phone = canRecognize()
  const canMic = phone || serverVoice
  useEffect(() => () => { stopRef.current?.() }, [])

  const join = (said: string) => [base.current.trim(), said.trim()].filter(Boolean).join(' ')

  async function startMic() {
    base.current = value
    if (phone) {
      if (!(await askListenPermission())) { notify('Microphone access needed', 'Allow the microphone and speech recognition to speak instead of typing.'); return }
      setMic('recording')
      stopRef.current = startDictation((t) => onChange(join(t)), (error) => {
        stopRef.current = null
        setMic('idle')
        if (error) notify("Didn't catch that", error)
      })
      return
    }
    // No recognition on this phone: record, then the server writes it down.
    const perm = await requestRecordingPermissionsAsync()
    if (!perm.granted) { notify('Microphone access needed', 'Allow the microphone to speak instead of typing.'); return }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      setMic('recording')
      stopRef.current = () => { void finishRecording() }
    } catch (e) {
      notify('Could not use the microphone', (e as Error)?.message)
    }
  }

  async function finishRecording() {
    stopRef.current = null
    setMic('working')
    try {
      await recorder.stop()
      if (recorder.uri) {
        const text = await assistantApi.transcribe(recorder.uri)
        if (text) onChange(join(text))
      }
    } catch (e) {
      const m = apiError(e)
      notify("Didn't catch that", /429/.test(m) ? 'Voice is over its limit just now — type it instead.' : m)
    } finally {
      setMic('idle')
    }
  }

  const recording = mic === 'recording'
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: recording ? '#DC2626' : COLORS.line, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8, ...SHADOWS.card }}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={recording ? 'Listening… press stop when done' : mic === 'working' ? 'Writing it down…' : hasMsgs ? 'Reply, or ask the next thing…' : 'Ask anything, or book a unit, quote or invoice…'}
        placeholderTextColor={recording ? '#DC2626' : COLORS.faint}
        multiline
        style={{ maxHeight: 140, minHeight: 40, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6, fontFamily: FONTS.body, fontSize: 16, lineHeight: 22, color: COLORS.ink }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        {canMic && (
          mic === 'working'
            ? <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.purple600} /></View>
            : <RoundBtn icon={recording ? 'stop' : 'mic-outline'} tone={recording ? 'danger' : 'plain'} label={recording ? 'Stop listening' : 'Speak instead of typing'}
              disabled={busy} onPress={() => (recording ? stopRef.current?.() : void startMic())} />
        )}
        {showWeb && <RoundBtn icon="globe-outline" tone={web ? 'on' : 'plain'} label={web ? 'Searching the web too' : 'Search the web too'} onPress={onToggleWeb} text="Web" />}
        <View style={{ flex: 1 }} />
        {canMic && !recording && <RoundBtn icon="headset-outline" tone="on" label="Talk — hands-free, it answers out loud" text="Talk" onPress={onTalk} disabled={busy} />}
        <RoundBtn icon="arrow-up" tone="brand" label="Send" disabled={busy || !value.trim() || recording} onPress={onSend} />
      </View>
    </View>
  )
}

/** While talking: what it is doing, what it heard, and a large Stop always in reach. */
function TalkBar({ state, words, error, onStop, onInterrupt, onDismiss }: {
  state: TalkState; words: string; error: string; onStop: () => void; onInterrupt: () => void; onDismiss: () => void
}) {
  if (state === 'off') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEF3F2', borderRadius: 18, padding: 14 }}>
        <Ionicons name="alert-circle-outline" size={20} color={COLORS.danger} />
        <Text style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.danger }}>{error}</Text>
        <Pressable onPress={onDismiss} hitSlop={10}><Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink2 }}>OK</Text></Pressable>
      </View>
    )
  }
  const label = state === 'listening' ? 'Listening…' : state === 'thinking' ? 'Working on it…' : 'Speaking…'
  const color = state === 'listening' ? '#DC2626' : COLORS.purple600
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: COLORS.purple50, borderWidth: 1, borderColor: COLORS.purple200, borderRadius: 22, padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color }}>{label}</Text>
        {state === 'thinking' && <ActivityIndicator size="small" color={COLORS.purple600} />}
      </View>
      <Text numberOfLines={3} style={{ fontFamily: FONTS.body, fontSize: 17, lineHeight: 24, color: COLORS.ink, minHeight: 24 }}>
        {words || (state === 'listening' ? 'Speak now — say "stop" to finish.' : ' ')}
      </Text>
      {state === 'speaking' && (
        <PressableScale onPress={onInterrupt} accessibilityLabel="Interrupt it and speak"
          style={{ height: 48, borderRadius: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="hand-left-outline" size={18} color={COLORS.ink2} />
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink2 }}>Tap to talk over it</Text>
        </PressableScale>
      )}
      <PressableScale onPress={onStop} accessibilityLabel="Stop talking"
        style={{ height: 60, borderRadius: 30, backgroundColor: '#DC2626', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Ionicons name="stop" size={22} color="#fff" />
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 18, color: '#fff' }}>Stop</Text>
      </PressableScale>
    </View>
  )
}
