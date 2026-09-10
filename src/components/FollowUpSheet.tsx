import { Modal, View, Text, Pressable } from 'react-native'
import { COLORS, FONTS, GRADIENT_PRIMARY, GRADIENT_PRIMARY_LOCATIONS } from '../lib/theme'
import { LinearGradient } from 'expo-linear-gradient'
import PressableScale from './PressableScale'

/** Quick-pick presets instead of a native datetime picker — the same fix
 *  applied to the web app's follow-up scheduler after "cannot select fast"
 *  feedback on the raw datetime-local input. */
function presetDate(preset: string): Date {
  const d = new Date()
  if (preset === 'today') { d.setHours(d.getHours() + 3); return d }
  if (preset === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d }
  if (preset === '3days') { d.setDate(d.getDate() + 3); d.setHours(10, 0, 0, 0); return d }
  d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0)
  return d
}
const PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'Later today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: '3days', label: 'In 3 days' },
  { key: 'week', label: 'Next week' },
]

export default function FollowUpSheet({
  visible, current, onSchedule, onClose,
}: { visible: boolean; current?: string | null; onSchedule: (iso: string) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,8,31,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: COLORS.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 }} onPress={(e) => e.stopPropagation()}>
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.line }} />
          </View>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink, paddingHorizontal: 20, paddingBottom: 4 }}>Schedule follow-up</Text>
          {!!current && (
            <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3, paddingHorizontal: 20, paddingBottom: 10 }}>
              Currently {new Date(current).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            </Text>
          )}
          <View style={{ paddingHorizontal: 20, paddingTop: 6, gap: 9 }}>
            {PRESETS.map((p) => (
              <PressableScale
                key={p.key}
                onPress={() => onSchedule(presetDate(p.key).toISOString())}
                style={{ borderRadius: 14, overflow: 'hidden' }}
              >
                <LinearGradient colors={GRADIENT_PRIMARY} locations={GRADIENT_PRIMARY_LOCATIONS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' }}>{p.label}</Text>
                </LinearGradient>
              </PressableScale>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
