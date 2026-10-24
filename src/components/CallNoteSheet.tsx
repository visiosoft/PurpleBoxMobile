import { useEffect, useState } from 'react'
import { Modal, View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { COLORS, FONTS } from '../lib/theme'
import PressableScale from './PressableScale'

/** Shown when the app comes back after a phone call to a lead — the call
 *  itself is already logged from the call log; this only adds what was said. */
export default function CallNoteSheet({
  name, onSave, onClose,
}: {
  name: string | null
  onSave: (note: string) => void
  onClose: () => void
}) {
  const [note, setNote] = useState('')

  useEffect(() => { if (name) setNote('') }, [name])

  return (
    <Modal visible={!!name} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,8,31,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
          <Pressable
            style={{ backgroundColor: COLORS.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.line }} />
            </View>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink, paddingHorizontal: 20 }}>How did the call with {name} go?</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3, paddingHorizontal: 20, paddingTop: 3, paddingBottom: 12 }}>
              The call is already logged. A note is optional — saved on the lead's timeline.
            </Text>

            <View style={{ paddingHorizontal: 20, gap: 10 }}>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="What did they say? Any concerns, timing, budget…"
                placeholderTextColor={COLORS.faint}
                multiline
                autoFocus
                style={{
                  minHeight: 90, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff',
                  padding: 14, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink, textAlignVertical: 'top',
                }}
              />

              <PressableScale
                onPress={() => onSave(note.trim())}
                style={{ height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brand }}
              >
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' }}>Save note</Text>
              </PressableScale>

              <Pressable onPress={onClose} style={{ paddingVertical: 6, alignItems: 'center' }}>
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink4 }}>Skip</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}
