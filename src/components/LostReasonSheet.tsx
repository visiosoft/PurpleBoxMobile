import { Modal, View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { leadApi } from '../lib/leads'
import { LOST_REASONS } from '../lib/leadStatus'
import { COLORS, FONTS } from '../lib/theme'
import PressableScale from './PressableScale'

/**
 * Why was this lead lost? Every way of closing a lead as lost comes through
 * here, because the server will not take one without a reason — and a
 * reason is how the business learns what it is losing to. Claude reads the
 * chat and marks the reason it supports; the rep still makes the call.
 */
export default function LostReasonSheet({
  visible, leadId, onSelect, onClose,
}: { visible: boolean; leadId: string; onSelect: (reason: string) => void; onClose: () => void }) {
  const { data: suggestion, isFetching } = useQuery({
    queryKey: ['suggest-lost-reason', leadId],
    queryFn: () => leadApi.suggestLostReason(leadId),
    enabled: visible && !!leadId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,8,31,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: COLORS.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 }} onPress={(e) => e.stopPropagation()}>
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.line }} />
          </View>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink, paddingHorizontal: 20 }}>Why was this lead lost?</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, minHeight: 24 }}>
            {isFetching ? (
              <>
                <ActivityIndicator size="small" color={COLORS.brandDark} />
                <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>Reading the conversation…</Text>
              </>
            ) : suggestion?.why ? (
              <>
                <Ionicons name="sparkles" size={13} color={COLORS.brandDark} />
                <Text style={{ flex: 1, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink2 }}>{suggestion.why}</Text>
              </>
            ) : null}
          </View>
          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            {LOST_REASONS.map((r) => {
              const suggested = suggestion?.reason === r.value
              return (
                <PressableScale
                  key={r.value}
                  onPress={() => onSelect(r.value)}
                  style={{
                    height: 46, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8,
                    borderWidth: suggested ? 1.5 : 1, borderColor: suggested ? COLORS.brand : COLORS.line,
                    backgroundColor: suggested ? COLORS.brandTint : '#fff',
                  }}
                >
                  <Text style={{ flex: 1, fontFamily: FONTS.bodyBold, fontSize: 14, color: suggested ? COLORS.brandDark : COLORS.ink }}>{r.label}</Text>
                  {suggested && (
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.4, color: COLORS.brandDark }}>SUGGESTED</Text>
                  )}
                </PressableScale>
              )
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
