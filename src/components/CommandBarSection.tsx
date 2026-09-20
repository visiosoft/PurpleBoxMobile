import { useState, useImperativeHandle, forwardRef, type ReactNode, type Ref } from 'react'
import { View, Text, TextInput, ScrollView, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation } from '@tanstack/react-query'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { COLORS, FONTS, SHADOWS } from '../lib/theme'
import PressableScale from './PressableScale'
import AssistantResultCard from './AssistantResultCard'
import { assistantApi, type AssistantAskResponse, type AssistantMessage } from '../lib/assistant'
import { apiError, API_BASE_URL } from '../lib/api'
import { notify } from '../lib/alert'

/**
 * BayOps' command bar, as one self-contained piece — everywhere it's used
 * (rep Home, admin Overview), it works exactly the same: typed or spoken,
 * asks the same "Ask the system" assistant the full Assistant tab uses, and
 * its answer replaces `children` until "‹ Priorities" is tapped, rather than
 * opening a separate chat screen. Same endpoints as the Assistant tab, just
 * a different frame around the same answers.
 */
export type CommandBarHandle = { runCommand: (question: string) => void }

function CommandBarSection(
  { children, backLabel = '‹ Priorities' }: { children: ReactNode; backLabel?: string },
  ref: Ref<CommandBarHandle>,
) {
  const [mode, setMode] = useState<'default' | 'results'>('default')
  const [draft, setDraft] = useState('')
  const [asked, setAsked] = useState('')
  const [history, setHistory] = useState<AssistantMessage[]>([])
  const [result, setResult] = useState<AssistantAskResponse | null>(null)
  const [recognizing, setRecognizing] = useState(false)

  const ask = useMutation({
    mutationFn: (question: string) => assistantApi.ask(question, history),
    onSuccess: (res, question) => {
      setResult(res)
      const turns: AssistantMessage[] = [{ role: 'user', content: question }, { role: 'assistant', content: res.answer }]
      setHistory((prev) => [...prev, ...turns].slice(-8))
    },
    onError: (e) => {
      setResult({ answer: apiError(e), tools: [], model: '', rounds: 0, grounded: false })
    },
  })

  const confirm = useMutation({
    mutationFn: (id: string) => assistantApi.confirm(id),
    onSuccess: (res) => {
      setResult((prev) => (prev ? { ...prev, answer: res.message, pending: null, links: [] } : prev))
      if (res.pdfPath) {
        const url = res.pdfPath.startsWith('http') ? res.pdfPath : `${API_BASE_URL.replace(/\/api$/, '')}${res.pdfPath}`
        Linking.openURL(url).catch(() => {})
      }
    },
    onError: (e) => notify('Could not confirm', apiError(e)),
  })

  const cancel = useMutation({
    mutationFn: (id: string) => assistantApi.cancel(id),
    onSuccess: (res) => {
      setResult((prev) => (prev ? { ...prev, answer: res.message, pending: null, links: [] } : prev))
    },
    onError: (e) => notify('Could not cancel', apiError(e)),
  })

  function runCommand(question: string) {
    const text = question.trim()
    if (!text || ask.isPending) return
    setMode('results')
    setAsked(text)
    setDraft('')
    setResult(null)
    ask.mutate(text)
  }

  function backToDefault() {
    setMode('default')
    setResult(null)
  }

  useImperativeHandle(ref, () => ({ runCommand }), [runCommand])

  // On-device speech recognition (not a record-then-upload round trip) —
  // the transcript streams into `draft` as interim results arrive, so the
  // input visibly fills in while speaking, the same way typing would. It
  // never runs on its own: stopping just leaves the text sitting there to
  // read, edit or clear, exactly like anything typed by hand.
  useSpeechRecognitionEvent('start', () => setRecognizing(true))
  useSpeechRecognitionEvent('end', () => setRecognizing(false))
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript
    if (text != null) setDraft(text)
  })
  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return
    notify("Didn't catch that", event.message || 'Try again, or type it instead.')
  })

  async function startVoiceCommand() {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!perm.granted) { notify('Microphone access needed', 'Allow microphone and speech recognition access to speak a command.'); return }
    setDraft('')
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      // Avoids Android's own start/stop beep (a hardcoded SpeechRecognizer
      // behavior, not something this app can silence otherwise) and keeps
      // listening through a brief pause mid-sentence instead of cutting off.
      continuous: true,
    })
  }

  function stopVoiceCommand() {
    ExpoSpeechRecognitionModule.stop()
  }

  return (
    <>
      {/* One persistent bar, typed or spoken — while listening, the
          transcript fills the same box live instead of hiding behind a
          separate "Listening…" state, so what's being heard is always the
          thing on screen, not something to find out only after stopping. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          minHeight: 48,
          borderRadius: 22,
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: recognizing ? COLORS.danger : COLORS.line,
          paddingLeft: 6,
          paddingRight: 6,
          paddingVertical: 6,
          marginBottom: 10,
          ...SHADOWS.card,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: recognizing ? COLORS.danger : COLORS.brand,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
            marginBottom: 2,
          }}
        >
          <Ionicons name={recognizing ? 'mic' : 'sparkles'} size={16} color="#fff" />
        </View>
        {/* Multiline and tall enough to actually read a spoken sentence back
            — a single clipped line was the whole complaint: you could not
            see what it heard, only guess from what fit. */}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => runCommand(draft)}
          placeholder={recognizing ? 'Listening…' : 'Ask BayOps anything…'}
          placeholderTextColor={COLORS.faint}
          returnKeyType="send"
          multiline
          style={{ flex: 1, maxHeight: 140, paddingVertical: 6, fontFamily: FONTS.body, fontSize: 14.5, lineHeight: 20, color: COLORS.ink }}
        />
        {recognizing ? (
          <PressableScale
            onPress={stopVoiceCommand}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.danger, marginBottom: 2 }}
          >
            <Ionicons name="stop" size={15} color="#fff" />
          </PressableScale>
        ) : draft.trim() ? (
          <PressableScale
            onPress={() => runCommand(draft)}
            disabled={ask.isPending}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brand, marginBottom: 2 }}
          >
            <Ionicons name="arrow-up" size={17} color="#fff" />
          </PressableScale>
        ) : (
          <PressableScale
            onPress={startVoiceCommand}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.control, marginBottom: 2 }}
          >
            <Ionicons name="mic" size={17} color={COLORS.brandDark} />
          </PressableScale>
        )}
      </View>

      {mode === 'results' ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text
              style={{ flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink3, marginRight: 8 }}
              numberOfLines={1}
            >
              You asked: "{asked}"
            </Text>
            <PressableScale
              onPress={backToDefault}
              style={{
                paddingHorizontal: 12,
                height: 30,
                borderRadius: 999,
                backgroundColor: COLORS.control,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11.5, color: COLORS.ink }}>{backLabel}</Text>
            </PressableScale>
          </View>
          <AssistantResultCard
            result={result}
            busyLabel={ask.isPending ? 'Checking…' : null}
            confirmBusy={confirm.isPending || cancel.isPending}
            onConfirm={(id) => confirm.mutate(id)}
            onCancel={(id) => cancel.mutate(id)}
          />
        </ScrollView>
      ) : (
        children
      )}
    </>
  )
}

export default forwardRef(CommandBarSection)
