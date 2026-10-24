import { useState } from 'react'
import {
  View, Text, TextInput, FlatList, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import {
  assistantApi, EXAMPLE_PROMPTS, toolLabel, assistantLinkRoute,
  type AssistantLink, type AssistantMessage, type AssistantPending, type AssistantTool,
} from '../../src/lib/assistant'
import { apiError, API_BASE_URL } from '../../src/lib/api'
import { notify } from '../../src/lib/alert'
import { COLORS, FONTS } from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'
import ScreenHeader from '../../src/components/ScreenHeader'

type ChatMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools?: AssistantTool[]
  grounded?: boolean
  links?: AssistantLink[]
  pending?: AssistantPending | null
}

let seq = 0
const nextId = () => String(seq++)

export default function AssistantScreen() {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')

  const { data: caps, isLoading: capsLoading } = useQuery({
    queryKey: ['assistant-capabilities'],
    queryFn: assistantApi.capabilities,
    staleTime: 5 * 60_000,
  })

  const ask = useMutation({
    mutationFn: (question: string) => {
      const history: AssistantMessage[] = messages.map((m) => ({ role: m.role, content: m.content }))
      return assistantApi.ask(question, history)
    },
    onSuccess: (res) => {
      setMessages((prev) => [...prev, {
        id: nextId(), role: 'assistant', content: res.answer, tools: res.tools, grounded: res.grounded, links: res.links, pending: res.pending ?? null,
      }])
    },
    onError: (e) => {
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', content: apiError(e), grounded: false }])
    },
  })

  const confirmAction = useMutation({
    mutationFn: (id: string) => assistantApi.confirm(id),
    onSuccess: (res, id) => {
      setMessages((prev) => [
        ...prev.map((m) => (m.pending?.id === id ? { ...m, pending: null } : m)),
        { id: nextId(), role: 'assistant', content: res.message },
      ])
      if (res.pdfPath) {
        const url = res.pdfPath.startsWith('http') ? res.pdfPath : `${API_BASE_URL.replace(/\/api$/, '')}${res.pdfPath}`
        Linking.openURL(url).catch(() => { })
      }
    },
    onError: (e) => notify('Could not confirm', apiError(e)),
  })

  const cancelAction = useMutation({
    mutationFn: (id: string) => assistantApi.cancel(id),
    onSuccess: (res, id) => {
      setMessages((prev) => [
        ...prev.map((m) => (m.pending?.id === id ? { ...m, pending: null } : m)),
        { id: nextId(), role: 'assistant', content: res.message },
      ])
    },
    onError: (e) => notify('Could not cancel', apiError(e)),
  })

  function send(question: string) {
    const text = question.trim()
    if (!text || ask.isPending) return
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: text }])
    setDraft('')
    ask.mutate(text)
  }

  function openLink(link: AssistantLink) {
    const route = assistantLinkRoute(link)
    if (route) { router.push(route); return }
    notify(link.label, 'Open this on the web app to view it.')
  }

  if (capsLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
        <ScreenHeader title="Assistant" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      </View>
    )
  }

  if (caps && !(caps.enabled && caps.allowed)) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
        <ScreenHeader title="Assistant" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="sparkles-outline" size={40} color={COLORS.faint} />
          <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.muted, marginTop: 14, textAlign: 'center' }}>
            {caps.enabled ? "Your role doesn't have access to Ask the system." : "Ask the system isn't turned on for this account."}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <ScreenHeader title="Assistant" />
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
          {messages.length === 0 ? (
            <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: 'flex-end', gap: 10, paddingBottom: 16 }}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.brandTint, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Ionicons name="sparkles" size={26} color={COLORS.brand} />
                </View>
                <Text style={{ fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink, textAlign: 'center' }}>Ask about units, contracts, or leads</Text>
                <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.muted, textAlign: 'center', marginTop: 4 }}>Plain language — it reads the real data.</Text>
              </View>
              {EXAMPLE_PROMPTS.map((p) => (
                <PressableScale key={p} onPress={() => send(p)} style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, padding: 14 }}>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink }}>{p}</Text>
                </PressableScale>
              ))}
            </View>
          ) : (
            <FlatList
              data={[...messages].reverse()}
              keyExtractor={(m) => m.id}
              inverted
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item }) => (
                <ChatBubble msg={item} onOpenLink={openLink} onConfirm={(id) => confirmAction.mutate(id)} onCancel={(id) => cancelAction.mutate(id)} busy={confirmAction.isPending || cancelAction.isPending} />
              )}
            />
          )}

          {ask.isPending && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 6 }}>
              <ActivityIndicator size="small" color={COLORS.brand} />
              <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted }}>Thinking…</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask a question…"
              placeholderTextColor={COLORS.faint}
              multiline
              style={{
                flex: 1, maxHeight: 100, backgroundColor: '#fff', borderRadius: 20,
                paddingHorizontal: 16, paddingVertical: 10, fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.ink,
              }}
            />
            <PressableScale
              onPress={() => send(draft)}
              disabled={ask.isPending || !draft.trim()}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: ask.isPending || !draft.trim() ? COLORS.faint : COLORS.brand }}
            >
              <Ionicons name="send" size={17} color="#fff" />
            </PressableScale>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  )
}

function ChatBubble({
  msg, onOpenLink, onConfirm, onCancel, busy,
}: { msg: ChatMsg; onOpenLink: (l: AssistantLink) => void; onConfirm: (id: string) => void; onCancel: (id: string) => void; busy: boolean }) {
  const outbound = msg.role === 'user'
  return (
    <View style={{ alignItems: outbound ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
          backgroundColor: outbound ? COLORS.brand : msg.grounded === false ? '#FFF7E6' : '#fff',
        }}
      >
        <Text style={{ fontFamily: FONTS.body, fontSize: 14.5, color: outbound ? '#fff' : COLORS.ink, lineHeight: 20 }}>{msg.content}</Text>

        {!!msg.tools?.length && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {msg.tools.map((t, i) => (
              <View key={i} style={{ backgroundColor: COLORS.brandTint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name={t.ok ? 'checkmark-circle' : 'alert-circle'} size={11} color={COLORS.brandDark} />
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: COLORS.brandDark }}>{toolLabel(t.name)}</Text>
              </View>
            ))}
          </View>
        )}

        {!!msg.links?.length && (
          <View style={{ gap: 6, marginTop: 8 }}>
            {msg.links.map((l, i) => (
              <Pressable key={i} onPress={() => onOpenLink(l)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="arrow-forward-circle-outline" size={15} color={COLORS.brand} />
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.brand }}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {msg.pending && (
          <View style={{ marginTop: 10, backgroundColor: COLORS.brandTint, borderRadius: 12, padding: 12, gap: 8 }}>
            {msg.pending.summary.map((line, i) => (
              <Text key={i} style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>• {line}</Text>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
              <PressableScale
                disabled={busy}
                onPress={() => onConfirm(msg.pending!.id)}
                style={{ flex: 1, backgroundColor: COLORS.brand, borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: '#fff' }}>Confirm</Text>
              </PressableScale>
              <PressableScale
                disabled={busy}
                onPress={() => onCancel(msg.pending!.id)}
                style={{ flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.muted }}>Cancel</Text>
              </PressableScale>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}
