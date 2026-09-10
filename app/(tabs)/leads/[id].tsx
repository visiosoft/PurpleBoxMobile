import { useState } from 'react'
import {
  View, Text, TextInput, ActivityIndicator, ScrollView, Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { leadApi, type AttemptChannel, type AttemptOutcome, type LeadStatus, type LeadTimelineEntry } from '../../../src/lib/leads'
import { LEAD_STATUS_FLOW, statusLabel, statusMeta } from '../../../src/lib/leadStatus'
import { apiError } from '../../../src/lib/api'
import { notify, confirmAction } from '../../../src/lib/alert'
import { COLORS, FONTS, GRADIENT_PRIMARY, GRADIENT_PRIMARY_LOCATIONS, RADII, SHADOWS } from '../../../src/lib/theme'
import PickerSheet from '../../../src/components/PickerSheet'
import PressableScale from '../../../src/components/PressableScale'
import ScoreSheet from '../../../src/components/whatsapp/ScoreSheet'

const OUTCOME_LABEL: Record<AttemptOutcome, string> = {
  no_answer: 'No answer', no_reply: 'No reply', reached: 'Reached', call_back: 'Asked to call back',
  not_interested: 'Not interested', wrong_number: 'Wrong number',
}
const CHANNEL_LABEL: Record<AttemptChannel, string> = {
  call: 'Call', whatsapp: 'WhatsApp', voice_note: 'Voice note', email: 'Email', sms: 'SMS', walk_in: 'Walk-in', other: 'Other',
}
const LOST_REASONS = ['Price too high', 'Customer not interested', 'Competitor', 'No response', 'Wrong enquiry', 'Other'] as const
const TIMELINE_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; chip: string }> = {
  created: { icon: 'person-add-outline', color: COLORS.purple600, chip: COLORS.purple50 },
  updated: { icon: 'create-outline', color: COLORS.ink3, chip: COLORS.surfaceAlt },
  status_changed: { icon: 'swap-horizontal-outline', color: COLORS.warnInk, chip: COLORS.warnTint },
  converted: { icon: 'checkmark-circle-outline', color: COLORS.success, chip: COLORS.successTint },
  email: { icon: 'mail-outline', color: '#2947C9', chip: '#E8EEFF' },
  comment: { icon: 'document-text-outline', color: COLORS.noteLabel, chip: COLORS.noteSurface },
  note: { icon: 'document-text-outline', color: COLORS.noteLabel, chip: COLORS.noteSurface },
  csv_merge: { icon: 'cloud-upload-outline', color: COLORS.ink3, chip: COLORS.surfaceAlt },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function timelineMeta(type: string) {
  return TIMELINE_ICON[type] ?? TIMELINE_ICON.updated
}

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const [lostPickerOpen, setLostPickerOpen] = useState(false)
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
    onError: (e) => notify('Could not update status', apiError(e)),
  })

  const markLost = useMutation({
    mutationFn: (reason: string) => leadApi.updateStatus(id, 'lost', reason),
    onSuccess: invalidate,
    onError: (e) => notify('Could not update status', apiError(e)),
  })

  const logAttempt = useMutation({
    mutationFn: (outcome: AttemptOutcome) => leadApi.addAttempt(id, { outcome, channel, note: attemptNote.trim() || undefined }),
    onSuccess: () => { setAttemptNote(''); invalidate() },
    onError: (e) => notify('Could not log attempt', apiError(e)),
  })

  const addComment = useMutation({
    mutationFn: (text: string) => leadApi.addComment(id, text),
    onSuccess: () => { setComment(''); invalidate() },
    onError: (e) => notify('Could not add note', apiError(e)),
  })

  const convert = useMutation({
    mutationFn: () => leadApi.convertToCustomer(id),
    onSuccess: (res) => notify(res.created ? 'Customer created' : 'Already a customer', res.customer.fullName),
    onError: (e) => notify('Could not convert', apiError(e)),
  })

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paper }}>
        <ActivityIndicator color={COLORS.purple600} />
      </View>
    )
  }
  if (isError || !lead) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paper, padding: 24 }}>
        <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.danger, textAlign: 'center' }}>{apiError(error)}</Text>
      </View>
    )
  }

  const meta = statusMeta(lead.status)
  const timeline: LeadTimelineEntry[] = [...(lead.timeline ?? [])].reverse()
  const notes = [...(lead.comments ?? [])].reverse()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
        <LinearGradient
          colors={GRADIENT_PRIMARY}
          locations={GRADIENT_PRIMARY_LOCATIONS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: 46, paddingHorizontal: 16, paddingBottom: 20, borderBottomLeftRadius: RADII.hero - 2, borderBottomRightRadius: RADII.hero - 2 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <PressableScale onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={19} color="#fff" />
            </PressableScale>
            <PressableScale
              onPress={() => setScoreOpen(true)}
              style={{ width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="sparkles" size={17} color="#fff" />
            </PressableScale>
          </View>

          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            <View style={{ width: 56, height: 56, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONTS.display, fontSize: 21, color: '#fff' }}>{lead.fullName.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.3, color: '#fff' }} numberOfLines={1}>{lead.fullName}</Text>
              <Text style={{ marginTop: 3, fontFamily: FONTS.body, fontSize: 13, color: 'rgba(255,255,255,0.82)', fontVariant: ['tabular-nums'] }}>{lead.phone}</Text>
            </View>
          </View>

          <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PressableScale
              onPress={() => setStatusPickerOpen(true)}
              style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 7 }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: meta.dot }} />
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: meta.text }}>{meta.label}</Text>
              <Ionicons name="chevron-down" size={12} color={meta.text} />
            </PressableScale>
          </View>
        </LinearGradient>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
          <PressableScale
            onPress={() => router.push({ pathname: '/whatsapp/[phone]', params: { phone: lead.phoneNormalized, name: lead.fullName, leadId: lead._id } })}
            style={{ height: 52, borderRadius: 17, backgroundColor: COLORS.whatsapp, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, ...SHADOWS.whatsappGlow }}
          >
            <Ionicons name="logo-whatsapp" size={19} color="#fff" />
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: '#fff' }}>Open WhatsApp</Text>
          </PressableScale>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ActionButton icon="call-outline" label="Call" onPress={() => Linking.openURL(`tel:${lead.phone}`)} />
            {!!lead.email && <ActionButton icon="mail-outline" label="Email" onPress={() => Linking.openURL(`mailto:${lead.email}`)} />}
            <ActionButton icon="sparkles-outline" label="Score" onPress={() => setScoreOpen(true)} />
          </View>

          <Card>
            <Row label="Phone" value={lead.phone} />
            {!!lead.email && <Row label="Email" value={lead.email} />}
            <Row label="Source" value={statusLabel(lead.source)} />
            <Row label="Storage size" value={`${lead.storageSizeValue} sqft`} />
            <Row label="Duration" value={`${lead.durationValue} ${lead.durationUnit}${lead.durationValue === 1 ? '' : 's'}`} />
            <Row label="Owner" value={lead.owner?.name || 'Unassigned'} />
            <Row label="Units needed" value={String(lead.unitsNeeded)} last />
          </Card>

          <SectionTitle title="Activity timeline" />
          <Card padded>
            {timeline.length === 0 ? (
              <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink4, paddingVertical: 4 }}>Nothing logged yet.</Text>
            ) : (
              timeline.map((t, i) => {
                const tm = timelineMeta(t.type)
                return (
                  <View key={t._id ?? i} style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ alignItems: 'center', width: 26 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: tm.chip, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={tm.icon} size={13} color={tm.color} />
                      </View>
                      {i < timeline.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: COLORS.lineSoft, marginVertical: 4 }} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, paddingBottom: 16 }}>
                      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink4 }}>
                        {formatDate(t.at)}{t.user?.name ? ` · ${t.user.name}` : ''}
                      </Text>
                      <Text style={{ marginTop: 4, fontFamily: FONTS.bodyBold, fontSize: 13.5, lineHeight: 18, color: COLORS.ink }}>{t.text}</Text>
                    </View>
                  </View>
                )
              })
            )}
          </Card>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2 }}>
            <SectionTitle title="Private notes" noMargin />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Add a note…"
              placeholderTextColor={COLORS.ink4}
              multiline
              style={{
                flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.line,
                paddingHorizontal: 12, paddingVertical: 9, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
              }}
            />
            <PressableScale
              onPress={() => comment.trim() && addComment.mutate(comment.trim())}
              disabled={addComment.isPending || !comment.trim()}
              style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: comment.trim() ? COLORS.purple600 : COLORS.ink4 }}
            >
              {addComment.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
            </PressableScale>
          </View>
          {notes.length > 0 && (
            <View style={{ gap: 10 }}>
              {notes.map((n) => (
                <View key={n._id} style={{ backgroundColor: COLORS.noteSurface, borderWidth: 1, borderColor: COLORS.noteBorder, borderRadius: 16, padding: 13 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Ionicons name="document-text-outline" size={13} color={COLORS.noteLabel} />
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.noteLabel }}>
                      Note · {n.userName} · {formatDate(n.createdAt)}
                    </Text>
                  </View>
                  <Text style={{ marginTop: 7, fontFamily: FONTS.body, fontSize: 13, lineHeight: 19, color: COLORS.noteInk }}>{n.text}</Text>
                </View>
              ))}
            </View>
          )}

          <SectionTitle title="Log an attempt" />
          <Card padded>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {(Object.keys(CHANNEL_LABEL) as AttemptChannel[]).map((c) => (
                <PressableScale
                  key={c}
                  onPress={() => setChannel(c)}
                  style={{ paddingHorizontal: 10, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: channel === c ? COLORS.purple600 : COLORS.control }}
                >
                  <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: channel === c ? '#fff' : COLORS.ink2 }}>{CHANNEL_LABEL[c]}</Text>
                </PressableScale>
              ))}
            </View>
            <TextInput
              value={attemptNote}
              onChangeText={setAttemptNote}
              placeholder="Note (optional)"
              placeholderTextColor={COLORS.ink4}
              style={{
                backgroundColor: COLORS.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: COLORS.line,
                paddingHorizontal: 12, paddingVertical: 9, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, marginBottom: 10,
              }}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(Object.keys(OUTCOME_LABEL) as AttemptOutcome[]).map((o) => (
                <PressableScale
                  key={o}
                  disabled={logAttempt.isPending}
                  onPress={() => logAttempt.mutate(o)}
                  style={{ paddingHorizontal: 12, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.line }}
                >
                  <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink }}>{OUTCOME_LABEL[o]}</Text>
                </PressableScale>
              ))}
            </View>
            {logAttempt.isPending && <ActivityIndicator style={{ marginTop: 10 }} color={COLORS.purple600} />}
          </Card>

          {!!lead.attempts?.length && (
            <>
              <SectionTitle title={`Attempts (${lead.attempts.length})`} />
              <Card>
                {[...lead.attempts].reverse().map((a, i) => (
                  <Row key={i} label={`${CHANNEL_LABEL[a.channel]} · ${formatDate(a.at)}`} value={OUTCOME_LABEL[a.outcome]} last={i === lead.attempts!.length - 1} />
                ))}
              </Card>
            </>
          )}

          <View style={{ flexDirection: 'row', gap: 9, marginTop: 6 }}>
            <PressableScale
              onPress={() => confirmAction('Mark as Won', `Mark ${lead.fullName} as won?`, 'Mark as Won', () => changeStatus.mutate('won'))}
              disabled={changeStatus.isPending}
              style={{ flex: 1, height: 48, paddingHorizontal: 12, borderRadius: 15, backgroundColor: COLORS.successTint, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: COLORS.success }}>Mark as Won</Text>
            </PressableScale>
            <PressableScale
              onPress={() => setLostPickerOpen(true)}
              disabled={markLost.isPending}
              style={{ flex: 1, height: 48, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1.5, borderColor: COLORS.chevron, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: COLORS.ink3 }}>Mark as Lost</Text>
            </PressableScale>
          </View>

          <PressableScale
            onPress={() => confirmAction('Convert to customer', `Create a customer record for ${lead.fullName}?`, 'Convert', () => convert.mutate())}
            disabled={convert.isPending}
            style={{ backgroundColor: COLORS.purple600, borderRadius: 15, paddingVertical: 14, alignItems: 'center' }}
          >
            {convert.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' }}>Convert to customer</Text>}
          </PressableScale>
        </ScrollView>
      </View>

      <PickerSheet
        visible={statusPickerOpen}
        title="Change status"
        options={LEAD_STATUS_FLOW}
        selected={lead.status}
        onSelect={(s) => changeStatus.mutate(s)}
        onClose={() => setStatusPickerOpen(false)}
      />
      <PickerSheet
        visible={lostPickerOpen}
        title="Why was this lead lost?"
        options={LOST_REASONS.map((r) => ({ value: r, label: r }))}
        onSelect={(reason) => markLost.mutate(reason)}
        onClose={() => setLostPickerOpen(false)}
      />
      <ScoreSheet leadId={lead._id} leadName={lead.fullName} visible={scoreOpen} onClose={() => setScoreOpen(false)} />
    </>
  )
}

function ActionButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.line }}>
      <Ionicons name={icon} size={19} color={COLORS.purple600} />
      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.ink2 }}>{label}</Text>
    </PressableScale>
  )
}

function SectionTitle({ title, noMargin }: { title: string; noMargin?: boolean }) {
  return (
    <Text style={{ marginTop: noMargin ? 0 : -4, fontFamily: FONTS.display, fontSize: 18, letterSpacing: -0.3, color: COLORS.ink }}>{title}</Text>
  )
}

function Card({ children, padded }: { children: React.ReactNode; padded?: boolean }) {
  return (
    <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADII.card, padding: padded ? 15 : 0, paddingHorizontal: padded ? 15 : 15 }}>
      {children}
    </View>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: COLORS.lineSoft }}>
      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink3 }}>{label}</Text>
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink, textAlign: 'right' }}>{value}</Text>
    </View>
  )
}
