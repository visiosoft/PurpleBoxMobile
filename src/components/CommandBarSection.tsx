import { useState, useImperativeHandle, forwardRef, type ReactNode, type Ref } from 'react'
import { View, Text, TextInput, ScrollView, ActivityIndicator, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation } from '@tanstack/react-query'
import {
  useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio'
import { COLORS, FONTS, SHADOWS } from '../lib/theme'
import PressableScale from './PressableScale'
import AssistantResultCard from './AssistantResultCard'
import { assistantApi, type AssistantAskResponse, type AssistantMessage } from '../lib/assistant'
import { apiError, API_BASE_URL } from '../lib/api'
import { notify } from '../lib/alert'

function formatRecordingTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

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
  const [transcribing, setTranscribing] = useState(false)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder, 200)

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

  async function startVoiceCommand() {
    const perm = await requestRecordingPermissionsAsync()
    if (!perm.granted) { notify('Microphone access needed', 'Allow microphone access to speak a command.'); return }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
    await recorder.prepareToRecordAsync()
    recorder.record()
  }

  async function stopVoiceCommand(send: boolean) {
    await recorder.stop()
    const uri = recorder.uri
    if (!send || !uri) return
    setTranscribing(true)
    try {
      const text = await assistantApi.transcribe(uri)
      if (!text) { notify("Didn't catch that", 'Try again, or type it instead.'); return }
      runCommand(text)
    } catch (e) {
      notify('Could not transcribe', apiError(e))
    } finally {
      setTranscribing(false)
    }
  }

  return (
    <>
      {recorderState.isRecording ? (
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10, height: 48,
            borderRadius: 999, backgroundColor: '#fff', paddingHorizontal: 8, marginBottom: 10, ...SHADOWS.card,
          }}
        >
          <PressableScale
            onPress={() => stopVoiceCommand(false)}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.control, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
          </PressableScale>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.danger }} />
            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13.5, color: COLORS.ink, fontVariant: ['tabular-nums'] }}>
              {formatRecordingTime(recorderState.durationMillis)}
            </Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>Listening…</Text>
          </View>
          <PressableScale
            onPress={() => stopVoiceCommand(true)}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
          </PressableScale>
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: 48,
            borderRadius: 999,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: COLORS.line,
            paddingLeft: 6,
            paddingRight: 6,
            marginBottom: 10,
            ...SHADOWS.card,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: COLORS.brand,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
            }}
          >
            {transcribing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sparkles" size={16} color="#fff" />}
          </View>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => runCommand(draft)}
            placeholder={transcribing ? 'Listening to that…' : 'Ask BayOps anything…'}
            placeholderTextColor={COLORS.faint}
            returnKeyType="send"
            editable={!transcribing}
            style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.ink }}
          />
          {draft.trim() ? (
            <PressableScale
              onPress={() => runCommand(draft)}
              disabled={ask.isPending}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brand }}
            >
              <Ionicons name="arrow-up" size={17} color="#fff" />
            </PressableScale>
          ) : (
            <PressableScale
              onPress={startVoiceCommand}
              disabled={transcribing}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.control }}
            >
              <Ionicons name="mic" size={17} color={COLORS.brandDark} />
            </PressableScale>
          )}
        </View>
      )}

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
