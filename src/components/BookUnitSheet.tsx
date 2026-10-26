import { useState } from 'react'
import { Modal, View, Text, TextInput, Pressable, ScrollView, Platform, KeyboardAvoidingView } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADII } from '../lib/theme'
import { notify } from '../lib/alert'
import PressableScale from './PressableScale'
import { AiSheet } from './AskAiBar'

/**
 * Book (or just quote) a unit for any customer, from the phone.
 *
 * Deliberately not a second booking engine: the form only gathers who, what
 * and when, then hands the assistant one exact instruction. Its quotation /
 * contract tools price it the way the Book Unit page does, hold the unit,
 * and show the Confirm card — nothing is created until the rep confirms
 * there. A rep confirms their own bookings; no admin step.
 */
export type BookMode = 'contract' | 'quote'

const SIZES = [10, 25, 50, 75, 100, 150, 200]
const DURATIONS: { label: string; months: number }[] = [
  { label: '1 month', months: 1 }, { label: '3 months', months: 3 }, { label: '6 months', months: 6 }, { label: '12 months', months: 12 },
]

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function addMonths(d: Date, n: number) {
  const out = new Date(d)
  out.setMonth(out.getMonth() + n)
  return out
}

export default function BookUnitSheet({
  visible, onClose, mode: initialMode = 'contract', unitNumber, sizeSqf, customer,
}: {
  visible: boolean
  onClose: () => void
  mode?: BookMode
  /** Preset when opened from a unit's own sheet. */
  unitNumber?: string
  sizeSqf?: number
  /** Preset when opened from a lead. */
  customer?: { name?: string; phone?: string; leadId?: string }
}) {
  const [mode, setMode] = useState<BookMode>(initialMode)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [size, setSize] = useState<number | null>(null)
  const [start, setStart] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d })
  const [months, setMonths] = useState(1)
  const [send, setSend] = useState(true)
  const [picking, setPicking] = useState(false)
  const [question, setQuestion] = useState<string | null>(null)

  // Fresh each time it opens, with whatever it was opened for — reset while
  // rendering the opening, not in an effect after it.
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setMode(initialMode)
      setName(customer?.name || '')
      setPhone(customer?.phone || '')
      setSize(sizeSqf ?? null)
      setQuestion(null)
    }
  }

  const end = addMonths(start, months)

  function submit() {
    if (!name.trim() || phone.replace(/\D/g, '').length < 7) { notify('Who is it for?', 'Add the customer’s name and phone number.'); return }
    if (!unitNumber && !size) { notify('Which size?', 'Pick a unit size.'); return }
    const what = unitNumber ? `unit ${unitNumber}` : `the cheapest free ${size} sq ft unit`
    const who = `${name.trim()}, phone ${phone.trim()}`
    const when = `from ${ymd(start)} to ${ymd(end)}`
    const delivery = send ? 'and send it to them on WhatsApp' : 'without sending it yet'
    setQuestion(mode === 'contract'
      ? `Book ${what} for ${who}, ${when}. Prepare the contract ${delivery}.`
      : `Quote ${what} for ${who}, ${when}. Prepare the quotation ${delivery}.`)
  }

  const chip = (active: boolean) => ({
    paddingHorizontal: 14, height: 36, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: active ? COLORS.purple600 : '#fff', borderWidth: 1, borderColor: active ? COLORS.purple600 : COLORS.line,
  })
  const chipText = (active: boolean) => ({ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: active ? '#fff' : COLORS.ink2 })
  const label = { fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' as const, color: COLORS.ink4, marginBottom: 8, marginTop: 16 }
  const input = {
    height: 46, borderRadius: RADII.input, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff',
    paddingHorizontal: 14, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink,
  }

  return (
    <>
      <Modal visible={visible && !question} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 }}>
            <Text style={{ fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink }}>{unitNumber ? `Unit ${unitNumber}` : 'Book a unit'}</Text>
            <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={24} color={COLORS.ink2} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {(['contract', 'quote'] as BookMode[]).map((m) => (
                <PressableScale key={m} onPress={() => setMode(m)} style={{ ...chip(mode === m), flex: 1 }}>
                  <Text style={chipText(mode === m)}>{m === 'contract' ? 'Book (contract)' : 'Quote only'}</Text>
                </PressableScale>
              ))}
            </View>

            <Text style={label}>Customer</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={COLORS.ink4} style={input} />
            <TextInput value={phone} onChangeText={setPhone} placeholder="Phone, e.g. 050 123 4567" placeholderTextColor={COLORS.ink4} keyboardType="phone-pad" style={{ ...input, marginTop: 8 }} />

            {!unitNumber && (
              <>
                <Text style={label}>Unit size (sq ft)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {SIZES.map((s) => (
                    <PressableScale key={s} onPress={() => setSize(s)} style={chip(size === s)}>
                      <Text style={chipText(size === s)}>{s}</Text>
                    </PressableScale>
                  ))}
                </View>
              </>
            )}

            <Text style={label}>Start</Text>
            <PressableScale onPress={() => setPicking(true)} style={{ ...input, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.purple600} />
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.ink }}>
                {start.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </PressableScale>
            {picking && (
              <DateTimePicker
                value={start}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                onChange={(event, date) => {
                  setPicking(false)
                  if (event.type === 'set' && date) setStart(date)
                }}
              />
            )}

            <Text style={label}>For how long</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DURATIONS.map((d) => (
                <PressableScale key={d.months} onPress={() => setMonths(d.months)} style={chip(months === d.months)}>
                  <Text style={chipText(months === d.months)}>{d.label}</Text>
                </PressableScale>
              ))}
            </View>
            <Text style={{ marginTop: 8, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>
              Ends {end.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>

            <PressableScale onPress={() => setSend((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }}>
              <Ionicons name={send ? 'checkbox' : 'square-outline'} size={22} color={COLORS.purple600} />
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13.5, color: COLORS.ink }}>Send it to the customer on WhatsApp</Text>
            </PressableScale>

            <PressableScale
              onPress={submit}
              style={{ marginTop: 24, height: 50, borderRadius: 16, backgroundColor: COLORS.purple600, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
            >
              <Ionicons name="sparkles" size={16} color="#fff" />
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: '#fff' }}>{mode === 'contract' ? 'Prepare booking' : 'Prepare quote'}</Text>
            </PressableScale>
            <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>
              You’ll see the price and unit first. Nothing is created until you press Confirm.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <AiSheet
        visible={visible && !!question}
        onClose={() => { setQuestion(null); onClose() }}
        initialQuestion={question || undefined}
        context={{ screen: mode === 'contract' ? 'Book a unit' : 'Quote', leadId: customer?.leadId, name: name || undefined, phone: phone || undefined }}
      />
    </>
  )
}
