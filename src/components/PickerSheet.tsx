import { Modal, View, Text, Pressable, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS } from '../lib/theme'

/** A native-feeling action sheet for picking one of a short list of options
 *  — status, attempt outcome, attempt channel. Used instead of Alert.alert
 *  wherever there are more options than Alert can present cleanly. */
export default function PickerSheet<T extends string>({
  visible, title, options, selected, onSelect, onClose,
}: {
  visible: boolean
  title: string
  options: { value: T; label: string }[]
  selected?: T
  onSelect: (value: T) => void
  onClose: () => void
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,8,31,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          style={{ backgroundColor: COLORS.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24, maxHeight: '70%' }}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.line }} />
          </View>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink, paddingHorizontal: 20, paddingBottom: 6 }}>{title}</Text>
          <ScrollView>
            {options.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => { onSelect(opt.value); onClose() }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.line,
                }}
              >
                <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: COLORS.ink }}>{opt.label}</Text>
                {selected === opt.value && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
