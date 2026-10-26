import { useEffect, useRef, useState } from 'react'
import { Modal, View, Text, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SHADOWS } from '../lib/theme'
import type { AssistantContext } from '../lib/assistant'
import PressableScale from './PressableScale'
import CommandBarSection, { type CommandBarHandle } from './CommandBarSection'

/**
 * The "Ask AI anything" bar that sits at the top of every main screen.
 *
 * It's one component on purpose: the bar on the dashboard, the Leads list,
 * the WhatsApp inbox and a single chat are the same assistant, only told
 * which screen (and lead) it was opened from — so "reply to her" from inside
 * a chat needs no name. Tapping it opens a full-height sheet with the real
 * CommandBarSection inside, rather than squeezing answers and Confirm cards
 * into the screen underneath.
 */
const DEFAULT_SUGGESTIONS = [
  'Who is waiting for my reply?',
  'My follow-ups due today — what should I send each one?',
  'Which 50 sq ft units are free from next week?',
  'Quote a 25 sq ft unit for 3 months from the 1st',
]

export default function AskAiBar({
  context,
  suggestions = DEFAULT_SUGGESTIONS,
  tone = 'light',
}: {
  context?: AssistantContext
  suggestions?: string[]
  /** 'glass' sits on the purple dashboard header; 'light' on a white screen. */
  tone?: 'light' | 'glass'
}) {
  const [open, setOpen] = useState(false)
  const glass = tone === 'glass'
  return (
    <>
      <PressableScale
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: 23, paddingHorizontal: 6, paddingRight: 14,
          backgroundColor: glass ? 'rgba(255,255,255,0.96)' : '#fff',
          borderWidth: 1, borderColor: glass ? 'transparent' : COLORS.line,
          ...SHADOWS.card,
        }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.purple600, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={16} color="#fff" />
        </View>
        <Text style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink4 }} numberOfLines={1}>Ask AI anything…</Text>
        <Ionicons name="mic-outline" size={18} color={COLORS.purple600} />
      </PressableScale>
      <AiSheet visible={open} onClose={() => setOpen(false)} context={context} suggestions={suggestions} />
    </>
  )
}

/** The sheet on its own — for a button that should open the assistant with
 *  a question already asked ("Book a unit", a dashboard tile). */
export function AiSheet({
  visible, onClose, context, suggestions = DEFAULT_SUGGESTIONS, initialQuestion,
}: {
  visible: boolean
  onClose: () => void
  context?: AssistantContext
  suggestions?: string[]
  initialQuestion?: string
}) {
  const insets = useSafeAreaInsets()
  const barRef = useRef<CommandBarHandle>(null)

  // Asked once per opening, after the bar has mounted inside the modal.
  useEffect(() => {
    if (!visible || !initialQuestion) return
    const t = setTimeout(() => barRef.current?.runCommand(initialQuestion), 250)
    return () => clearTimeout(t)
  }, [visible, initialQuestion])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="sparkles" size={18} color={COLORS.purple600} />
            <Text style={{ fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink }}>Ask AI</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={COLORS.ink2} />
          </Pressable>
        </View>
        {!!context?.name && (
          <Text style={{ paddingHorizontal: 16, marginTop: -4, marginBottom: 8, fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink3 }}>
            About {context.name}
          </Text>
        )}
        <View style={{ flex: 1, paddingHorizontal: 14, paddingBottom: insets.bottom + 6 }}>
          {visible && (
            <CommandBarSection ref={barRef} context={context} autoFocus={!initialQuestion} backLabel="‹ Suggestions" onNavigate={onClose}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink4, marginTop: 4 }}>
                  Try
                </Text>
                {suggestions.map((s) => (
                  <PressableScale
                    key={s}
                    onPress={() => barRef.current?.runCommand(s)}
                    style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}
                  >
                    <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13.5, color: COLORS.ink }}>{s}</Text>
                  </PressableScale>
                ))}
                <Text style={{ marginTop: 6, fontFamily: FONTS.body, fontSize: 12, lineHeight: 17, color: COLORS.ink3 }}>
                  It can reply to customers, set follow-ups and site visits, move a lead’s stage, quote and book units, and raise or send invoices.
                  Anything that reaches a customer or moves money waits for you to press Confirm.
                </Text>
              </ScrollView>
            </CommandBarSection>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
