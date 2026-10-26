import { useState } from 'react'
import { Modal, View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
import { useMutation } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { leadApi, type QuotePreview } from '../lib/leads'
import { apiError } from '../lib/api'
import { COLORS, FONTS } from '../lib/theme'
import PressableScale from './PressableScale'

const START_OPTIONS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In a week', days: 7 },
] as const

/** YYYY-MM-DD in the phone's own day, which is Dubai for every rep. */
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rangeFor(startInDays: number, duration: number, unit: 'week' | 'month') {
  const start = new Date()
  start.setDate(start.getDate() + startInDays)
  const end = new Date(start)
  if (unit === 'month') end.setMonth(end.getMonth() + duration)
  else end.setDate(end.getDate() + duration * 7)
  return { startDate: dayKey(start), endDate: dayKey(end) }
}

/**
 * Quote this customer without leaving the chat: the cheapest free unit of
 * their size for their dates, priced by the same quote maths as the Book
 * Unit page. Two steps on purpose — the rep sees the unit, dates and total
 * before anything is created, and only "Send quote" holds the unit and sends
 * the PDF on WhatsApp.
 */
export default function QuoteSheet({
  visible, leadId, customerName, storageSizeValue, durationValue, durationUnit, onSent, onClose,
}: {
  visible: boolean
  leadId: string
  customerName: string
  storageSizeValue: number
  durationValue: number
  durationUnit: 'week' | 'month'
  onSent: (message: string) => void
  onClose: () => void
}) {
  // Mounted fresh for each opening, so the lead's own size and duration are the starting point.
  const [size, setSize] = useState(storageSizeValue > 0 ? String(storageSizeValue) : '')
  const [duration, setDuration] = useState(durationValue > 0 ? String(durationValue) : '1')
  const [unit, setUnit] = useState<'week' | 'month'>(durationUnit || 'month')
  const [startInDays, setStartInDays] = useState(0)
  const [preview, setPreview] = useState<QuotePreview | null>(null)
  const [error, setError] = useState('')

  const sizeNum = Number(size)
  const durationNum = Number(duration)
  const valid = sizeNum > 0 && durationNum >= 1

  const prepare = useMutation({
    mutationFn: () => leadApi.quotePreview(leadId, { sizeSqf: sizeNum, ...rangeFor(startInDays, durationNum, unit) }),
    onSuccess: (p) => { setPreview(p); setError('') },
    onError: (e) => setError(apiError(e)),
  })
  const send = useMutation({
    mutationFn: () => leadApi.quoteConfirm(leadId, preview!.proposalId),
    onSuccess: (r) => onSent(r.message),
    onError: (e) => setError(apiError(e)),
  })

  const label = { fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: COLORS.ink4, marginBottom: 6 }
  const input = {
    height: 46, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff',
    paddingHorizontal: 14, fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink,
  }
  const chip = (on: boolean) => ({
    flex: 1, height: 42, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 1, borderColor: on ? COLORS.brand : COLORS.line, backgroundColor: on ? COLORS.brandTint : '#fff',
  })

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
              Quote {customerName}
            </Text>

            {!preview ? (
              <View style={{ paddingHorizontal: 20, gap: 14 }}>
                <View>
                  <Text style={label}>Size (sqft)</Text>
                  <TextInput value={size} onChangeText={setSize} keyboardType="number-pad" placeholder="e.g. 75" placeholderTextColor={COLORS.faint} style={input} />
                </View>
                <View>
                  <Text style={label}>Starts</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {START_OPTIONS.map((o) => (
                      <PressableScale key={o.label} onPress={() => setStartInDays(o.days)} style={chip(startInDays === o.days)}>
                        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: startInDays === o.days ? COLORS.brandDark : COLORS.ink3 }}>{o.label}</Text>
                      </PressableScale>
                    ))}
                  </View>
                </View>
                <View>
                  <Text style={label}>For</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholderTextColor={COLORS.faint} style={[input, { flex: 1 }]} />
                    {(['week', 'month'] as const).map((u) => (
                      <PressableScale key={u} onPress={() => setUnit(u)} style={[chip(unit === u), { height: 46 }]}>
                        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: unit === u ? COLORS.brandDark : COLORS.ink3 }}>
                          {u === 'week' ? 'Week(s)' : 'Month(s)'}
                        </Text>
                      </PressableScale>
                    ))}
                  </View>
                </View>
                {!!error && <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.danger }}>{error}</Text>}
                <PressableScale
                  disabled={!valid || prepare.isPending}
                  onPress={() => prepare.mutate()}
                  style={{ height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: valid ? COLORS.brand : COLORS.faint }}
                >
                  {prepare.isPending
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' }}>Check price</Text>}
                </PressableScale>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 20, gap: 12 }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: COLORS.line, padding: 14, gap: 8 }}>
                  <Text style={{ fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink }}>
                    AED {preview.total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </Text>
                  {/* The proposal's own lines: customer, unit and rate, dates, breakdown, how it will be sent. */}
                  {preview.summary.slice(1).map((line) => (
                    <View key={line} style={{ flexDirection: 'row', gap: 8 }}>
                      <Ionicons name="checkmark" size={14} color={COLORS.success} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13, lineHeight: 18, color: COLORS.ink2 }}>{line}</Text>
                    </View>
                  ))}
                </View>
                {!!error && <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.danger }}>{error}</Text>}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PressableScale
                    onPress={() => { setPreview(null); setError('') }}
                    style={{ flex: 1, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff' }}
                  >
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink2 }}>Change</Text>
                  </PressableScale>
                  <PressableScale
                    disabled={send.isPending}
                    onPress={() => send.mutate()}
                    style={{ flex: 2, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brand }}
                  >
                    {send.isPending
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' }}>Send quote</Text>}
                  </PressableScale>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}
