import { useMemo } from 'react'
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { messageTemplateApi, type MessageTemplate } from '../../lib/whatsapp'
import { COLORS, FONTS } from '../../lib/theme'
import PressableScale from '../PressableScale'

/** Settings → Message Templates, reused as the quick-reply library — the
 *  same list and grouping the web console's chat panel shows. */
export default function QuickRepliesSheet({
  visible, onSelect, onClose,
}: { visible: boolean; onSelect: (template: MessageTemplate) => void; onClose: () => void }) {
  const { data: templates, isLoading } = useQuery({
    queryKey: ['message-templates', 'quick_reply'],
    queryFn: messageTemplateApi.quickReplies,
    enabled: visible,
    staleTime: 60_000,
  })

  const groups = useMemo(() => {
    const list = (templates ?? []).filter((t) => (t.whatsappBody ?? '').trim().length > 0 || t.mediaKind)
    const map = new Map<string, MessageTemplate[]>()
    for (const t of list) {
      const cat = (t.category || '').trim() || 'Other'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(t)
    }
    return [...map.entries()]
  }, [templates])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,8,31,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          style={{ backgroundColor: COLORS.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24, maxHeight: '75%' }}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.line }} />
          </View>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink, paddingHorizontal: 20, paddingBottom: 10 }}>Quick replies</Text>

          {isLoading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={COLORS.purple600} />
          ) : groups.length === 0 ? (
            <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink4, paddingHorizontal: 20, paddingBottom: 20 }}>
              No quick replies set up yet — add some under Settings → Message Templates on the web console.
            </Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              {groups.map(([category, items]) => (
                <View key={category} style={{ marginBottom: 14 }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.ink4, marginBottom: 6 }}>
                    {category}
                  </Text>
                  {items.map((t) => (
                    <PressableScale
                      key={t._id}
                      onPress={() => { onSelect(t); onClose() }}
                      style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 12, marginBottom: 8 }}
                    >
                      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: COLORS.ink }}>{t.label}</Text>
                      {!!t.whatsappBody && (
                        <Text numberOfLines={2} style={{ marginTop: 4, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>
                          {t.whatsappBody}
                        </Text>
                      )}
                      {t.mediaKind === 'location' && (
                        <Text style={{ marginTop: 4, fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.purple600 }}>📍 Sends a location pin</Text>
                      )}
                      {t.mediaKind === 'video' && (
                        <Text style={{ marginTop: 4, fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.purple600 }}>🎥 Sends a video</Text>
                      )}
                    </PressableScale>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}
