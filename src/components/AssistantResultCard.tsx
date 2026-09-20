import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { COLORS, FONTS, SHADOWS } from '../lib/theme'
import PressableScale from './PressableScale'
import { toolLabel, type AssistantAskResponse, type AssistantLink } from '../lib/assistant'
import { notify } from '../lib/alert'

/**
 * The command bar's answer, as a standalone card rather than a chat bubble —
 * this is BayOps' "results replace the feed" idea (see home.tsx), so the
 * card needs to stand on its own with nothing above or below it implying a
 * conversation. Same pending/Confirm/Cancel logic as assistant.tsx's
 * ChatBubble (the full-screen "Assistant" tab) — same assistant, same rules,
 * just a different frame around it.
 */
export default function AssistantResultCard({
  result,
  busyLabel,
  confirmBusy,
  onConfirm,
  onCancel,
}: {
  result: AssistantAskResponse | null
  busyLabel?: string | null
  confirmBusy: boolean
  onConfirm: (id: string) => void
  onCancel: (id: string) => void
}) {
  const router = useRouter()

  if (busyLabel) {
    return (
      <View style={{ borderRadius: 18, backgroundColor: '#fff', padding: 20, alignItems: 'center', gap: 10, ...SHADOWS.card }}>
        <ActivityIndicator color={COLORS.brand} />
        <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink3 }}>{busyLabel}</Text>
      </View>
    )
  }
  if (!result) return null

  function openLink(link: AssistantLink) {
    const leadMatch = link.path.match(/^\/leads\/([a-f0-9]{24})/i)
    if (leadMatch) { router.push(`/leads/${leadMatch[1]}`); return }
    notify(link.label, 'Open this on the web app to view it.')
  }

  return (
    <View
      style={{
        borderRadius: 18,
        backgroundColor: result.grounded === false ? '#FFF7E6' : '#fff',
        padding: 16,
        ...SHADOWS.card,
      }}
    >
      <Text style={{ fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.ink, lineHeight: 21 }}>{result.answer}</Text>

      {!!result.tools?.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {result.tools.map((t, i) => (
            <View key={i} style={{ backgroundColor: COLORS.brandTint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={t.ok ? 'checkmark-circle' : 'alert-circle'} size={11} color={COLORS.brandDark} />
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: COLORS.brandDark }}>{toolLabel(t.name)}</Text>
            </View>
          ))}
        </View>
      )}

      {!!result.links?.length && (
        <View style={{ gap: 8, marginTop: 12 }}>
          {result.links.map((l, i) => (
            <Pressable key={i} onPress={() => openLink(l)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="arrow-forward-circle-outline" size={16} color={COLORS.brand} />
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13.5, color: COLORS.brand }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {result.pending && (
        <View style={{ marginTop: 14, backgroundColor: COLORS.brandTint, borderRadius: 12, padding: 12, gap: 8 }}>
          {result.pending.summary.map((line, i) => (
            <Text key={i} style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>• {line}</Text>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <PressableScale
              disabled={confirmBusy}
              onPress={() => onConfirm(result.pending!.id)}
              style={{ flex: 1, backgroundColor: COLORS.brand, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: '#fff' }}>Confirm</Text>
            </PressableScale>
            <PressableScale
              disabled={confirmBusy}
              onPress={() => onCancel(result.pending!.id)}
              style={{ flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink3 }}>Cancel</Text>
            </PressableScale>
          </View>
        </View>
      )}
    </View>
  )
}
