import { useState } from 'react'
import { Modal, View, Text, Pressable, ActivityIndicator, ScrollView, Platform } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { leadScoreApi, type LeadScoreBand } from '../../lib/whatsapp'
import { apiError } from '../../lib/api'
import { COLORS, FONTS } from '../../lib/theme'
import PressableScale from '../PressableScale'

const BAND_STYLE: Record<LeadScoreBand, { bg: string; fg: string; label: string }> = {
  high: { bg: COLORS.goodBg, fg: COLORS.good, label: 'High intent' },
  medium: { bg: COLORS.warnBg, fg: COLORS.warn, label: 'Medium intent' },
  low: { bg: COLORS.badBg, fg: COLORS.bad, label: 'Low intent' },
}

/**
 * The mobile equivalent of the web console's right-hand score panel — same
 * endpoints (GET /leads/:id/score, POST .../score-confirm, .../intended-
 * date), same idea: don't clutter the chat itself, but make the AI's read
 * on a lead, and a rep's own correction to it, one tap away.
 */
export default function ScoreSheet({
  leadId, leadName, visible, onClose,
}: { leadId: string; leadName: string; visible: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: score, isLoading, error } = useQuery({
    queryKey: ['lead-score', leadId],
    queryFn: () => leadScoreApi.score(leadId),
    enabled: visible && !!leadId,
    staleTime: 60_000,
  })

  const confirm = useMutation({
    mutationFn: (decision: 'qualifying' | 'not_interested' | '') => leadScoreApi.confirm(leadId, decision),
    onSuccess: (next) => queryClient.setQueryData(['lead-score', leadId], next),
  })

  const setDate = useMutation({
    mutationFn: (date: string) => leadScoreApi.setIntendedDate(leadId, date),
    onSuccess: (next) => queryClient.setQueryData(['lead-score', leadId], next),
  })

  const [showPicker, setShowPicker] = useState(false)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
          <View>
            <Text style={{ fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink }}>Lead score</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.muted }}>{leadName}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={COLORS.muted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {isLoading && <ActivityIndicator color={COLORS.brand} />}
          {!!error && <Text style={{ color: COLORS.bad, fontFamily: FONTS.body }}>{apiError(error)}</Text>}

          {score && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {score.band ? (
                  <View style={{ backgroundColor: BAND_STYLE[score.band].bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: BAND_STYLE[score.band].fg }}>{BAND_STYLE[score.band].label}</Text>
                  </View>
                ) : (
                  <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.muted }}>Not scored yet</Text>
                )}
                {score.score != null && <Text style={{ fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink }}>{score.score}</Text>}
              </View>

              {!!score.reason && <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink, lineHeight: 20 }}>{score.reason}</Text>}

              {!!score.aiSummary?.nextAction && (
                <View style={{ backgroundColor: COLORS.brandTint, borderRadius: 14, padding: 14, gap: 4 }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: COLORS.brandDark, letterSpacing: 0.4 }}>SUGGESTED NEXT ACTION</Text>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink }}>{score.aiSummary.nextAction}</Text>
                </View>
              )}

              <View style={{ gap: 2 }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: COLORS.muted, letterSpacing: 0.4, marginBottom: 6 }}>SIGNALS</Text>
                <SignalRow label="Temperature" value={score.signals.temperature || '—'} />
                <SignalRow label="Lead type" value={score.signals.leadType || '—'} />
                <SignalRow label="Gave a specific need" value={score.signals.specific ? 'Yes' : 'No'} />
                <SignalRow label="Messages exchanged" value={score.signals.turnCount != null ? String(score.signals.turnCount) : '—'} />
                <SignalRow label="Median reply time" value={score.signals.medianReplyMinutes != null ? `${score.signals.medianReplyMinutes} min` : '—'} last />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: COLORS.muted, letterSpacing: 0.4 }}>WHEN DO THEY NEED IT?</Text>
                <PressableScale
                  onPress={() => setShowPicker(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, padding: 12 }}
                >
                  <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink }}>{score.signals.intendedStartDate || 'Not set'}</Text>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.muted} />
                </PressableScale>
                {!!score.signals.intendedStartDate && (
                  <Pressable onPress={() => setDate.mutate('')}>
                    <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.bad }}>Clear date</Text>
                  </Pressable>
                )}
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: COLORS.muted, letterSpacing: 0.4 }}>YOUR CALL</Text>
                {score.override ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, padding: 12 }}>
                    <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink }}>
                      {score.override === 'qualifying' ? '✅ Marked qualifying' : '❌ Marked not interested'}
                    </Text>
                    <Pressable onPress={() => confirm.mutate('')}>
                      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.muted }}>Undo</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <PressableScale
                      onPress={() => confirm.mutate('qualifying')}
                      disabled={confirm.isPending}
                      style={{ flex: 1, backgroundColor: COLORS.goodBg, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                    >
                      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.good }}>✅ Qualifying</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => confirm.mutate('not_interested')}
                      disabled={confirm.isPending}
                      style={{ flex: 1, backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                    >
                      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.muted }}>❌ Not interested</Text>
                    </PressableScale>
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>

        {showPicker && (
          <DateTimePicker
            value={score?.signals.intendedStartDate ? new Date(score.signals.intendedStartDate) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={new Date()}
            onChange={(_, date) => {
              setShowPicker(false)
              if (date) setDate.mutate(date.toISOString().slice(0, 10))
            }}
          />
        )}
      </View>
    </Modal>
  )
}

function SignalRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: COLORS.line,
      }}
    >
      <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.muted }}>{label}</Text>
      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink }}>{value}</Text>
    </View>
  )
}
