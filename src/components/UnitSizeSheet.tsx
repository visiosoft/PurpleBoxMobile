import { useEffect, useState } from 'react'
import { Modal, View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { COLORS, FONTS } from '../lib/theme'
import PressableScale from './PressableScale'

/** How much storage a lead needs, and for how long — editable right from
 *  wherever a rep is talking to them (the WhatsApp chat), not only from the
 *  lead's own detail screen. */
export default function UnitSizeSheet({
  visible, storageSizeValue, durationValue, durationUnit, onSave, onClose,
}: {
  visible: boolean
  storageSizeValue: number
  durationValue: number
  durationUnit: 'week' | 'month'
  onSave: (v: { storageSizeValue: number; durationValue: number; durationUnit: 'week' | 'month' }) => void
  onClose: () => void
}) {
  const [size, setSize] = useState(String(storageSizeValue || ''))
  const [duration, setDuration] = useState(String(durationValue || ''))
  const [unit, setUnit] = useState<'week' | 'month'>(durationUnit)

  useEffect(() => {
    if (visible) {
      setSize(storageSizeValue > 0 ? String(storageSizeValue) : '')
      setDuration(durationValue > 0 ? String(durationValue) : '')
      setUnit(durationUnit)
    }
  }, [visible, storageSizeValue, durationValue, durationUnit])

  const sizeNum = Number(size)
  const durationNum = Number(duration)
  const valid = Number.isFinite(sizeNum) && sizeNum > 0 && Number.isFinite(durationNum) && durationNum >= 1

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,8,31,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
          <Pressable
            style={{ backgroundColor: COLORS.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.line }} />
            </View>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink, paddingHorizontal: 20, paddingBottom: 14 }}>
              Storage size & duration
            </Text>

            <View style={{ paddingHorizontal: 20, gap: 14 }}>
              <View>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: COLORS.ink4, marginBottom: 6 }}>
                  Size needed (sqft)
                </Text>
                <TextInput
                  value={size}
                  onChangeText={setSize}
                  keyboardType="number-pad"
                  placeholder="e.g. 75"
                  placeholderTextColor={COLORS.faint}
                  style={{
                    height: 46, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff',
                    paddingHorizontal: 14, fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink,
                  }}
                />
              </View>

              <View>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: COLORS.ink4, marginBottom: 6 }}>
                  Duration
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="number-pad"
                    placeholder="e.g. 1"
                    placeholderTextColor={COLORS.faint}
                    style={{
                      flex: 1, height: 46, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff',
                      paddingHorizontal: 14, fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink,
                    }}
                  />
                  {(['week', 'month'] as const).map((u) => (
                    <PressableScale
                      key={u}
                      onPress={() => setUnit(u)}
                      style={{
                        flex: 1, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1, borderColor: unit === u ? COLORS.brand : COLORS.line,
                        backgroundColor: unit === u ? COLORS.brandTint : '#fff',
                      }}
                    >
                      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: unit === u ? COLORS.brandDark : COLORS.ink3 }}>
                        {u === 'week' ? 'Week(s)' : 'Month(s)'}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              </View>

              <PressableScale
                disabled={!valid}
                onPress={() => onSave({ storageSizeValue: sizeNum, durationValue: durationNum, durationUnit: unit })}
                style={{
                  height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: valid ? COLORS.brand : COLORS.faint,
                }}
              >
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' }}>Save</Text>
              </PressableScale>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}
