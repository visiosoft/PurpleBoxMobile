import { useState } from 'react'
import { View, Text, TextInput, Platform, Pressable } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS } from '../../lib/theme'
import type { AskField, AskFormSpec } from '../../lib/assistant'
import PressableScale from '../PressableScale'
import PickerSheet from '../PickerSheet'

const KEYBOARD: Partial<Record<AskField['type'], 'phone-pad' | 'email-address' | 'decimal-pad' | 'number-pad'>> = {
  phone: 'phone-pad', email: 'email-address', number: 'decimal-pad', eid: 'number-pad',
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const asDate = (v: string) => { const d = v ? new Date(`${v.slice(0, 10)}T12:00:00`) : new Date(); return Number.isNaN(d.getTime()) ? new Date() : d }

/**
 * The details the assistant asked for, as boxes to fill in — the web's
 * AskForm. What it already knew is filled in; the person checks it, fills
 * the gaps, and the answers go back to it as the next message.
 *
 * An Emirates ID goes to the server on its own (`eid`), never in the
 * message: the chat only ever says one was given, and its last four digits.
 */
export default function AskForm({ form, busy, onSubmit }: {
  form: AskFormSpec
  busy: boolean
  onSubmit: (text: string, extra?: { eid?: string }) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(form.fields.map((f) => [f.key, f.value ?? ''])))
  const [tried, setTried] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [dating, setDating] = useState<string | null>(null)
  const missing = form.fields.filter((f) => f.required !== false && !String(values[f.key] ?? '').trim())
  const set = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }))

  function submit() {
    setTried(true)
    if (missing.length || busy) return
    const eid = form.fields.filter((f) => f.type === 'eid').map((f) => String(values[f.key] ?? '').trim()).find(Boolean)
    const lines = form.fields
      .map((f) => [f.label, f.type === 'eid' && values[f.key]?.trim() ? `given (ending ${values[f.key].replace(/\D/g, '').slice(-4)})` : String(values[f.key] ?? '').trim()] as const)
      .filter(([, v]) => v)
      .map(([l, v]) => `- ${l}: ${v}`)
    onSubmit(`${form.title ? `${form.title} details` : 'The details'}:\n${lines.join('\n')}`, eid ? { eid } : undefined)
  }

  const pickField = form.fields.find((f) => f.key === picking)
  const dateField = form.fields.find((f) => f.key === dating)

  return (
    <View style={{ marginTop: 12, backgroundColor: '#FCFBFE', borderWidth: 1, borderColor: COLORS.purple200, borderRadius: 14, padding: 14, gap: 12 }}>
      {!!form.title && <Text style={{ fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink }}>{form.title}</Text>}
      {form.fields.map((f) => {
        const bad = tried && f.required !== false && !String(values[f.key] ?? '').trim()
        const box = {
          minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: bad ? COLORS.danger : COLORS.line, backgroundColor: '#fff',
          paddingHorizontal: 12, fontFamily: FONTS.body, fontSize: 15, color: COLORS.ink,
        } as const
        return (
          <View key={f.key}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.ink3, marginBottom: 6 }}>
              {f.label}{f.required === false && <Text style={{ fontFamily: FONTS.body }}> · optional</Text>}
            </Text>
            {f.type === 'select' && f.options?.length ? (
              <Pressable onPress={() => setPicking(f.key)} style={[box, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: values[f.key] ? COLORS.ink : COLORS.faint }}>{values[f.key] || 'Choose…'}</Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.ink3} />
              </Pressable>
            ) : f.type === 'date' ? (
              <Pressable onPress={() => setDating(f.key)} style={[box, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: values[f.key] ? COLORS.ink : COLORS.faint }}>
                  {values[f.key] ? asDate(values[f.key]).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a day'}
                </Text>
                <Ionicons name="calendar-outline" size={16} color={COLORS.ink3} />
              </Pressable>
            ) : (
              <TextInput
                value={values[f.key]}
                onChangeText={(v) => set(f.key, v)}
                keyboardType={KEYBOARD[f.type] || 'default'}
                autoCapitalize={f.type === 'email' || f.type === 'eid' ? 'none' : 'sentences'}
                autoComplete={f.type === 'eid' ? 'off' : undefined}
                autoCorrect={f.type === 'text' || f.type === 'textarea'}
                placeholder={f.type === 'eid' ? '784-XXXX-XXXXXXX-X' : undefined}
                placeholderTextColor={COLORS.faint}
                multiline={f.type === 'textarea'}
                style={[box, f.type === 'textarea' ? { minHeight: 72, paddingTop: 10, textAlignVertical: 'top' } : null]}
              />
            )}
          </View>
        )
      })}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <PressableScale onPress={submit} disabled={busy}
          style={{ backgroundColor: COLORS.purple600, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22, opacity: busy ? 0.5 : 1 }}>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14.5, color: '#fff' }}>{busy ? 'Working…' : form.submitLabel || 'Continue'}</Text>
        </PressableScale>
        {tried && missing.length > 0 && (
          <Text style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13, color: COLORS.danger }}>
            Fill in {missing.map((f) => f.label.toLowerCase()).join(', ')}.
          </Text>
        )}
      </View>

      <PickerSheet
        visible={!!pickField}
        title={pickField?.label || ''}
        options={(pickField?.options || []).map((o) => ({ value: o, label: o }))}
        selected={pickField ? values[pickField.key] : undefined}
        onSelect={(v) => pickField && set(pickField.key, v)}
        onClose={() => setPicking(null)}
      />
      {dateField && (
        <DateTimePicker
          value={asDate(values[dateField.key])}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, date) => {
            setDating(null)
            if (event.type === 'set' && date) set(dateField.key, ymd(date))
          }}
        />
      )}
    </View>
  )
}
