import { useState } from 'react'
import { Modal, View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SHADOWS } from '../lib/theme'
import type { AssistantContext } from '../lib/assistant'
import PressableScale from './PressableScale'
import AskChat from './ask/AskChat'

/**
 * The "Ask AI anything" bar that sits at the top of every main screen.
 *
 * It's one component on purpose: the bar on the dashboard, the Leads list,
 * the WhatsApp inbox and a single chat are the same assistant, only told
 * which screen (and lead) it was opened from — so "reply to her" from inside
 * a chat needs no name. Tapping it opens the full Ask chat (AskChat) in a
 * full-height sheet, rather than squeezing answers and Confirm cards into
 * the screen underneath.
 */
export default function AskAiBar({
  context,
  suggestions,
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
 *  a question already asked ("Book a unit", a dashboard tile). It is the
 *  whole Ask chat: kept chats, cards, forms, For you today and Talk mode.
 *  Opened from a person's screen it starts a new chat about them; from
 *  anywhere else it carries on the last chat. */
export function AiSheet({
  visible, onClose, context, suggestions, initialQuestion,
}: {
  visible: boolean
  onClose: () => void
  context?: AssistantContext
  /** This screen's own starters, shown under "Try" in a new chat. */
  suggestions?: string[]
  initialQuestion?: string
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      {visible && (
        <AskChat
          context={context}
          initialQuestion={initialQuestion}
          starters={suggestions}
          startFresh={Boolean(context?.name || context?.leadId)}
          onClose={onClose}
          onNavigate={onClose}
        />
      )}
    </Modal>
  )
}
