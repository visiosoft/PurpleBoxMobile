import { useState } from 'react'
import {
  View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Linking, Alert,
} from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { leadApi, type AttemptChannel, type AttemptOutcome, type LeadStatus } from '../../../src/lib/leads'
import { LEAD_STATUS_FLOW, statusLabel, statusTone, TEMPERATURE_LABEL } from '../../../src/lib/leadStatus'
import { apiError } from '../../../src/lib/api'
import { COLORS, FONTS } from '../../../src/lib/theme'
import Avatar from '../../../src/components/Avatar'
import PickerSheet from '../../../src/components/PickerSheet'
import ScoreSheet from '../../../src/components/whatsapp/ScoreSheet'

const OUTCOME_LABEL: Record<AttemptOutcome, string> = {
  no_answer: 'No answer', no_reply: 'No reply', reached: 'Reached', call_back: 'Asked to call back',
  not_interested: 'Not interested', wrong_number: 'Wrong number',
}
const CHANNEL_LABEL: Record<AttemptChannel, string> = {
  call: 'Call', whatsapp: 'WhatsApp', voice_note: 'Voice note', email: 'Email', sms: 'SMS', walk_in: 'Walk-in', other: 'Other',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [channel, setChannel] = useState<AttemptChannel>('call')
  const [attemptNote, setAttemptNote] = useState('')
  const [comment, setComment] = useState('')

  const { data: lead, isLoading, isError, error } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadApi.get(id),
    enabled: !!id,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lead', id] })

  const changeStatus = useMutation({
    mutationFn: (status: LeadStatus) => leadApi.updateStatus(id, status),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Could not update status', apiError(e)),
  })

  const logAttempt = useMutation({
    mutationFn: (outcome: AttemptOutcome) => leadApi.addAttempt(id, { outcome, channel, note: attemptNote.trim() || undefined }),
    onSuccess: () => { setAttemptNote(''); invalidate() },
    onError: (e) => Alert.alert('Could not log attempt', apiError(e)),
  })

  const addComment = useMutation({
    mutationFn: (text: string) => leadApi.addComment(id, text),
    onSuccess: () => { setComment(''); invalidate() },
    onError: (e) => Alert.alert('Could not add note', apiError(e)),
  })

  const convert = useMutation({
    mutationFn: () => leadApi.convertToCustomer(id),
    onSuccess: (res) => Alert.alert(res.created ? 'Customer created' : 'Already a customer', res.customer.fullName),
    onError: (e) => Alert.alert('Could not convert', apiError(e)),
  })

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paper }}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    )
  }
  if (isError || !lead) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paper, padding: 24 }}>
        <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.bad, textAlign: 'center' }}>{apiError(error)}</Text>
      </View>
    )
  }

  const tone = statusTone(lead.status)
  const timelineFeed = [
    ...(lead.timeline ?? []).map((t) => ({ at: t.at, who: t.user?.name || 'System', text: t.text })),
    ...(lead.comments ?? []).map((c) => ({ at: c.createdAt, who: c.userName, text: c.text })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <>
      <Stack.Screen options={{ title: lead.fullName }} />
      <ScrollView style={{ flex: 1, backgroundColor: COLORS.paper }} contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={lead.fullName} size={56} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink }}>{lead.fullName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: tone.fg }}>{statusLabel(lead.status)}</Text>
              </View>
              {!!lead.temperature && <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted }}>{TEMPERATURE_LABEL[lead.temperature]}</Text>}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <ActionButton icon="call" label="Call" onPress={() => Linking.openURL(`tel:${lead.phone}`)} />
          <ActionButton
            icon="logo-whatsapp"
            label="WhatsApp"
            onPress={() => router.push({ pathname: '/whatsapp/[phone]', params: { phone: lead.phoneNormalized, name: lead.fullName, leadId: lead._id } })}
          />
          {!!lead.email && <ActionButton icon="mail" label="Email" onPress={() => Linking.openURL(`mailto:${lead.email}`)} />}
          <ActionButton icon="sparkles" label="Score" onPress={() => setScoreOpen(true)} accent />
        </View>

        <Section title="DETAILS">
          <Row label="Phone" value={lead.phone} />
          {!!lead.email && <Row label="Email" value={lead.email} />}
          <Row label="Source" value={statusLabel(lead.source)} />
          <Row label="Owner" value={lead.owner?.name || 'Unassigned'} />
          <Row label="Units needed" value={String(lead.unitsNeeded)} last />
        </Section>

        <Section title="STATUS">
          <Pressable
            onPress={() => setStatusPickerOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
          >
            <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: tone.fg }}>{statusLabel(lead.status)}</Text>
            </View>
            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.brand }}>Change</Text>
          </Pressable>
        </Section>

        <Section title="LOG AN ATTEMPT">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {(Object.keys(CHANNEL_LABEL) as AttemptChannel[]).map((c) => (
              <Pressable
                key={c}
                onPress={() => setChannel(c)}
                style={{
                  paddingHorizontal: 10, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: channel === c ? COLORS.brand : '#F3F4F6',
                }}
              >
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: channel === c ? '#fff' : COLORS.muted }}>{CHANNEL_LABEL[c]}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={attemptNote}
            onChangeText={setAttemptNote}
            placeholder="Note (optional)"
            placeholderTextColor={COLORS.faint}
            style={{
              backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: COLORS.line,
              paddingHorizontal: 12, paddingVertical: 9, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, marginBottom: 10,
            }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(Object.keys(OUTCOME_LABEL) as AttemptOutcome[]).map((o) => (
              <Pressable
                key={o}
                disabled={logAttempt.isPending}
                onPress={() => logAttempt.mutate(o)}
                style={{ paddingHorizontal: 12, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: COLORS.line }}
              >
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink }}>{OUTCOME_LABEL[o]}</Text>
              </Pressable>
            ))}
          </View>
          {logAttempt.isPending && <ActivityIndicator style={{ marginTop: 10 }} color={COLORS.brand} />}
        </Section>

        {!!lead.attempts?.length && (
          <Section title={`ATTEMPTS (${lead.attempts.length})`}>
            {[...lead.attempts].reverse().map((a, i) => (
              <Row key={i} label={`${CHANNEL_LABEL[a.channel]} · ${formatDate(a.at)}`} value={OUTCOME_LABEL[a.outcome]} last={i === lead.attempts!.length - 1} />
            ))}
          </Section>
        )}

        <Section title="NOTES">
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Add a note…"
              placeholderTextColor={COLORS.faint}
              multiline
              style={{
                flex: 1, backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: COLORS.line,
                paddingHorizontal: 12, paddingVertical: 9, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
              }}
            />
            <Pressable
              onPress={() => comment.trim() && addComment.mutate(comment.trim())}
              disabled={addComment.isPending || !comment.trim()}
              style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: comment.trim() ? COLORS.brand : COLORS.faint }}
            >
              {addComment.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
            </Pressable>
          </View>
          {timelineFeed.length === 0 ? (
            <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.faint }}>Nothing logged yet.</Text>
          ) : (
            timelineFeed.map((t, i) => (
              <View key={i} style={{ paddingVertical: 8, borderBottomWidth: i === timelineFeed.length - 1 ? 0 : 1, borderBottomColor: COLORS.line }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.brandDark }}>{t.who}</Text>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.faint }}>{formatDate(t.at)}</Text>
                </View>
                <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>{t.text}</Text>
              </View>
            ))
          )}
        </Section>

        <Pressable
          onPress={() => Alert.alert('Convert to customer', `Create a customer record for ${lead.fullName}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Convert', onPress: () => convert.mutate() },
          ])}
          disabled={convert.isPending}
          style={{ backgroundColor: COLORS.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
        >
          {convert.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' }}>Convert to customer</Text>}
        </Pressable>
      </ScrollView>

      <PickerSheet
        visible={statusPickerOpen}
        title="Change status"
        options={LEAD_STATUS_FLOW}
        selected={lead.status}
        onSelect={(s) => changeStatus.mutate(s)}
        onClose={() => setStatusPickerOpen(false)}
      />
      <ScoreSheet leadId={lead._id} leadName={lead.fullName} visible={scoreOpen} onClose={() => setScoreOpen(false)} />
    </>
  )
}

function ActionButton({ icon, label, onPress, accent }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12 }}>
      <Ionicons name={icon} size={20} color={accent ? COLORS.brand : COLORS.brandDark} />
      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.ink }}>{label}</Text>
    </Pressable>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: COLORS.muted, letterSpacing: 0.4, marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: last ? 0 : 1, borderBottomColor: COLORS.line }}>
      <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.muted }}>{label}</Text>
      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink }}>{value}</Text>
    </View>
  )
}
