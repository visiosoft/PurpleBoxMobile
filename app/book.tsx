import { useState } from 'react'
import { View, Text, TextInput, ScrollView, ActivityIndicator, Pressable, Platform, Linking, KeyboardAvoidingView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import { leadApi, type Lead } from '../src/lib/leads'
import { whatsappApi } from '../src/lib/whatsapp'
import { apiError } from '../src/lib/api'
import { confirmAction } from '../src/lib/alert'
import {
  bookingApi, STEPS, WEEK_OPTIONS, DEFAULT_ADDONS, ID_DOC_TYPES, DOC_TYPE_LABELS,
  isoDay, addWeeksISO, daysBetween, unitPeriodTotal, quoteTotals, waPhone,
  type AvailableUnit, type BookingCustomer, type Quote, type UnitRow, type AddOnRow, type AccessPerson,
} from '../src/lib/booking'
import { COLORS, FONTS, RADII } from '../src/lib/theme'
import PressableScale from '../src/components/PressableScale'

/**
 * Book a unit for a lead: Customer → Units → Quotation → Contract, the web's
 * Book Unit wizard step for step (client/src/pages/NewQuote.tsx), so a
 * booking started on the phone can be finished on the web and the other way
 * round. Opened with ?leadId=, and optionally ?unit=<unit number> when the
 * rep started from a unit.
 */
export default function BookScreen() {
  const { leadId, unit } = useLocalSearchParams<{ leadId: string; unit?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // Everything the wizard starts from, loaded once: the lead, the booking
  // already under way for it (newest quote, as the web resumes), and the
  // customer record their number already has.
  const init = useQuery({
    queryKey: ['book-init', leadId],
    enabled: !!leadId,
    gcTime: 0,
    queryFn: async () => {
      const [lead, quotes] = await Promise.all([leadApi.get(leadId), bookingApi.quotesForLead(leadId)])
      const quote = quotes[0] ?? null
      const customer = quote?.customer && typeof quote.customer === 'object'
        ? quote.customer
        : await bookingApi.findCustomer(lead.phone).catch(() => null)
      return { lead, quote, customer }
    },
  })

  if (!init.data) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.paper, paddingTop: insets.top + 6 }}>
        <Header title="Book unit" subtitle="" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {init.isError
            ? <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.danger, textAlign: 'center' }}>{apiError(init.error)}</Text>
            : <ActivityIndicator color={COLORS.purple600} />}
        </View>
      </View>
    )
  }
  return <Wizard lead={init.data.lead} resume={init.data.quote} matched={init.data.customer} unitParam={unit} />
}

function Wizard({ lead, resume, matched, unitParam }: { lead: Lead; resume: Quote | null; matched: BookingCustomer | null; unitParam?: string }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()

  const resumeContract = resume?.contract && typeof resume.contract === 'object' ? resume.contract : null
  const resumeUnits: UnitRow[] = (resume?.units ?? []).map((u) => ({
    unitId: typeof u.unit === 'object' ? u.unit._id : u.unit,
    unitNumber: u.unitNumber, sizeSqf: u.sizeSqf, floor: u.floor,
    startDate: u.startDate ? u.startDate.slice(0, 10) : '', endDate: u.endDate ? u.endDate.slice(0, 10) : '',
    rate: u.rate, discountPct: u.discountPct,
  }))

  const [step, setStepRaw] = useState(() => {
    if (!resume) return 0
    if (typeof resume.flowStep === 'number' && resume.flowStep >= 0) return Math.min(3, resume.flowStep)
    return resumeContract ? 3 : 2
  })
  const [customer, setCustomer] = useState<BookingCustomer | null>(matched)
  const [quoteId, setQuoteId] = useState(resume?._id ?? '')
  const [quoteNo, setQuoteNo] = useState(resume?.quoteNo ?? '')
  const [contractId, setContractId] = useState(resumeContract?._id ?? '')
  const [note, setNote] = useState<{ ok: boolean; text: string; waUrl?: string } | null>(null)

  // The period. A new booking starts from what the lead told us — the date
  // they need it from, and how long once a rep has confirmed it.
  const [from, setFrom] = useState(() => {
    if (resumeUnits[0]?.startDate) return resumeUnits[0].startDate
    const today = isoDay(new Date())
    const wanted = String(lead.storageStartAt || lead.intendedStartDate || '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(wanted) && wanted >= today) return wanted
    const t = new Date(); t.setDate(t.getDate() + 1)
    return isoDay(t)
  })
  const [to, setTo] = useState(() => {
    if (resumeUnits[0]?.endDate) return resumeUnits[0].endDate
    const n = Number(lead.durationValue) || 0
    if (!lead.lengthOfStayConfirmedAt || n <= 0) return ''
    return lead.durationUnit === 'week' ? addWeeksISO(from, n) : monthsLater(from, n)
  })
  const [picking, setPicking] = useState<'start' | 'end' | null>(null)
  const [units, setUnits] = useState<UnitRow[]>(resumeUnits)

  // The quotation
  const [addOns, setAddOns] = useState<AddOnRow[]>(resume?.addOns?.map((a) => ({ name: a.name, description: a.description || '', quantity: a.quantity, rate: a.rate })) ?? [])
  const [notes, setNotes] = useState(resume?.notes ?? '')
  const [deposit, setDeposit] = useState(resume?.deposit ?? 0)
  const [holdAdvance, setHoldAdvance] = useState(resume?.holdAdvance !== false)
  const [vatEnabled, setVatEnabled] = useState(resume?.vatEnabled !== false)
  const [cardFeeEnabled, setCardFeeEnabled] = useState(Boolean(resume?.cardFeeEnabled))
  const cardFeePct = resume?.cardFeePct ?? 3
  const adjustment = resume?.adjustment ?? 0
  const terms = resume?.termsAndConditions ?? ''

  const days = from && to ? daysBetween(from, to) : 0
  const weeks = days > 0 && days % 7 === 0 ? days / 7 : null
  const totals = quoteTotals({ units, addOns, adjustment, deposit, holdAdvance, vatEnabled, cardFeeEnabled, cardFeePct })
  const name = customer?.fullName || lead.fullName
  const phone = customer?.phone || lead.phone

  function setRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    setUnits((prev) => prev.map((u) => ({ ...u, startDate: nextFrom, endDate: nextTo || u.endDate })))
  }

  function quoteBody(overrides: Record<string, unknown> = {}) {
    const expiry = new Date(); expiry.setDate(expiry.getDate() + 30)
    return {
      customer: customer?._id,
      lead: lead._id,
      billingPeriod: 'monthly',
      expiryDate: isoDay(expiry),
      notes,
      ...(terms ? { termsAndConditions: terms } : {}),
      deposit, holdAdvance, vatEnabled, cardFeeEnabled, cardFeePct, adjustment,
      units: units.map((u) => ({
        unit: u.unitId, unitNumber: u.unitNumber, sizeSqf: u.sizeSqf, floor: u.floor,
        startDate: u.startDate, endDate: u.endDate, rate: u.rate, discountPct: u.discountPct,
      })),
      addOns: addOns.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), description: a.description, quantity: a.quantity, rate: a.rate })),
      items: [],
      ...overrides,
    }
  }

  function unitsProblem(): string | null {
    if (!from || !to) return 'Set the start date and how long.'
    if (to <= from) return 'The end date must be after the start date.'
    if (!units.length) return 'Pick at least one unit.'
    return null
  }

  // Saved on the quote, as the web does, so either side resumes where the
  // other left off — and reaching the quotation step is what holds the unit.
  function setStep(next: number, ids?: { quote?: string; contract?: string }) {
    const s = Math.max(0, Math.min(3, next))
    setStepRaw(s)
    setNote(null)
    const q = ids?.quote ?? quoteId
    if (q) {
      bookingApi.setStep(q, s, [!!customer, units.length > 0, true, !!(ids?.contract ?? contractId), false, false]).catch(() => {})
    }
  }

  function goTo(i: number) {
    if (i === step) return
    if (i >= 1 && !customer) { setNote({ ok: false, text: 'Choose the customer first.' }); return }
    if (i >= 2 && unitsProblem()) { setNote({ ok: false, text: unitsProblem()! }); setStepRaw(1); return }
    setStep(i)
  }

  // ── Customer ──────────────────────────────────────────────────────────────
  const createCustomer = useMutation({
    mutationFn: () => bookingApi.createCustomer({ fullName: lead.fullName, phone: lead.phone || '', email: lead.email || '', notes: lead.notes || '' }),
    onSuccess: (c) => { setCustomer(c); setNote(null) },
    onError: (e) => setNote({ ok: false, text: apiError(e) }),
  })

  // ── Sending on WhatsApp ───────────────────────────────────────────────────
  /** Through our own number, so it lands in the CRM chat. When WhatsApp
   *  refuses (they have not written in 24 hours) the rep gets a button that
   *  opens WhatsApp on their own phone with the message ready. */
  async function sendOnWhatsApp(text: string, what: string): Promise<boolean> {
    const to = waPhone(phone || '')
    const waUrl = `https://wa.me/${to}?text=${encodeURIComponent(text)}`
    if (!to) { setNote({ ok: false, text: `No phone number for ${name}.`, waUrl }); return false }
    try {
      await whatsappApi.send(to, text)
      setNote({ ok: true, text: `${what} sent on WhatsApp — it is in the chat.` })
      return true
    } catch (e) {
      const closed = Boolean((e as { response?: { data?: { windowClosed?: boolean } } })?.response?.data?.windowClosed)
      setNote({
        ok: false,
        text: closed ? `They have not written in the last 24 hours, so WhatsApp will only take the ${what.toLowerCase()} from your phone.` : `Could not send the ${what.toLowerCase()}: ${apiError(e)}`,
        waUrl,
      })
      return false
    }
  }

  // ── Quotation ─────────────────────────────────────────────────────────────
  const saveQuote = useMutation({
    mutationFn: (overrides?: Record<string, unknown>) => bookingApi.saveQuote(quoteId || null, quoteBody(overrides)),
    onSuccess: (q) => {
      setQuoteId(q._id); setQuoteNo(q.quoteNo || '')
      qc.invalidateQueries({ queryKey: ['lead', lead._id] })
    },
    onError: (e) => setNote({ ok: false, text: apiError(e) }),
  })

  const sendQuote = useMutation({
    mutationFn: async () => {
      const q = await bookingApi.saveQuote(quoteId || null, quoteBody())
      setQuoteId(q._id); setQuoteNo(q.quoteNo || '')
      const { url } = await bookingApi.share(q._id, 'whatsapp')
      return { q, url }
    },
    onSuccess: async ({ q, url }) => {
      qc.invalidateQueries({ queryKey: ['lead', lead._id] })
      const ok = await sendOnWhatsApp(
        `Hello ${name},\n\nPlease find your storage quotation ${q.quoteNo} — ${AED(q.total)}.\nView the quote here: ${url}\n\nThank you — PurpleBox`,
        'Quotation',
      )
      if (ok) setStep(3, { quote: q._id })
    },
    onError: (e) => setNote({ ok: false, text: apiError(e) }),
  })

  /** A toggle on a saved quote is saved the moment it changes, as on the web. */
  function toggle(field: string, value: unknown, apply: () => void) {
    apply()
    if (quoteId) saveQuote.mutate({ [field]: value })
  }

  // ── Contract ──────────────────────────────────────────────────────────────
  const [awaitingId, setAwaitingId] = useState(false)
  const docs = useQuery({
    queryKey: ['customer-docs', customer?._id],
    queryFn: () => bookingApi.documents(customer!._id),
    enabled: !!customer && step === 3,
    // After asking for the ID on WhatsApp, look for it until it arrives.
    refetchInterval: awaitingId ? 15000 : false,
  })
  const hasId = (docs.data ?? []).some((d) => ID_DOC_TYPES.includes(d.type))
  const [docType, setDocType] = useState('emirates_id')
  const [persons, setPersons] = useState<AccessPerson[]>([])

  const upload = useMutation({
    mutationFn: async (source: 'camera' | 'library') => {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) throw new Error(source === 'camera' ? 'Allow the camera to photograph the ID.' : 'Allow access to your photos to pick the ID.')
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 }
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
      if (result.canceled || !result.assets?.[0]) return null
      const a = result.assets[0]
      const mimeType = a.mimeType || 'image/jpeg'
      const fileName = a.fileName || `${docType}-${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`
      return bookingApi.uploadDocument(customer!._id, { uri: a.uri, name: fileName, mimeType }, docType)
    },
    onSuccess: (d) => { if (d) docs.refetch() },
    onError: (e) => setNote({ ok: false, text: e instanceof Error && !('response' in e) ? e.message : apiError(e) }),
  })

  const requestId = useMutation({
    mutationFn: () => bookingApi.requestId(waPhone(phone || ''), name),
    onSuccess: () => { setAwaitingId(true); setNote({ ok: true, text: `ID & details form sent to ${name} on WhatsApp. Their ID shows here once they submit it.` }) },
    onError: (e) => setNote({ ok: false, text: `Could not send the ID form: ${apiError(e)}` }),
  })

  const removeDoc = useMutation({
    mutationFn: (id: string) => bookingApi.removeDocument(id),
    onSuccess: () => docs.refetch(),
    onError: (e) => setNote({ ok: false, text: apiError(e) }),
  })

  const createContract = useMutation({
    mutationFn: () => bookingApi.createContract(quoteId, persons.filter((p) => p.name.trim())),
    onSuccess: (r) => {
      setContractId(r.contractId)
      setAwaitingId(false)
      bookingApi.setStep(quoteId, 3, [true, true, true, true, false, false]).catch(() => {})
      qc.invalidateQueries({ queryKey: ['lead', lead._id] })
      setNote({ ok: true, text: `Contract ${r.contractNo} created, with its first invoice.` })
    },
    onError: (e) => setNote({ ok: false, text: apiError(e) }),
  })

  const contract = useQuery({
    queryKey: ['flow-contract', contractId],
    queryFn: () => bookingApi.contract(contractId),
    enabled: !!contractId,
  })

  const sendSigning = useMutation({
    mutationFn: () => bookingApi.signingLink(contractId),
    onSuccess: (url) => {
      contract.refetch()
      sendOnWhatsApp(`Hello ${name},\n\nPlease review and sign your storage contract ${contract.data?.contractNo ?? ''}:\n${url}\n\nThank you — PurpleBox`, 'Signing link')
    },
    onError: (e) => setNote({ ok: false, text: apiError(e) }),
  })

  const cancelContract = useMutation({
    mutationFn: () => bookingApi.cancelContract(contractId),
    onSuccess: () => contract.refetch(),
    onError: (e) => setNote({ ok: false, text: apiError(e) }),
  })

  const busy = saveQuote.isPending || sendQuote.isPending

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <Header title="Book unit" subtitle={`For ${name}`} onBack={() => router.back()} />
        <Stepper step={step} done={[!!customer, units.length > 0, !!quoteId, !!contractId]} onPress={goTo} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}>
        {step === 0 && (
          <Card title="Customer" subtitle="Who is this rental for?">
            {customer ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: COLORS.surfaceAlt }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.purple100, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person" size={18} color={COLORS.purple600} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14.5, color: COLORS.ink }}>{customer.fullName}</Text>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>{[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No contact'}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <View style={{ padding: 12, borderRadius: 14, backgroundColor: COLORS.surfaceAlt }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14.5, color: COLORS.ink }}>{lead.fullName}</Text>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>{lead.phone}{lead.email ? ` · ${lead.email}` : ''} — from lead</Text>
                </View>
                <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>
                  There is no customer record under this number yet. Create one from the lead to quote them.
                </Text>
                <PrimaryButton icon="person-add-outline" label="Create customer from lead" busy={createCustomer.isPending} onPress={() => createCustomer.mutate()} />
              </View>
            )}
          </Card>
        )}

        {step === 1 && (
          <UnitsStep
            from={from} to={to} weeks={weeks} days={days} units={units} setUnits={setUnits}
            onPickStart={() => setPicking('start')} onPickEnd={() => setPicking('end')}
            onWeeks={(w) => setRange(from, addWeeksISO(from, w))}
            defaultSize={Number(lead.storageSizeValue) || 0} unitParam={unitParam}
          />
        )}

        {step === 2 && (
          <>
            <Card title="Quotation" subtitle={quoteNo ? `${quoteNo} · saved` : 'Add-ons and final pricing'}>
              {units.map((u) => (
                <View key={u.unitId} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: COLORS.ink }}>{u.unitNumber} · {u.sizeSqf} sq ft</Text>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: COLORS.purple600 }}>{AED(unitPeriodTotal(u.rate, u.discountPct, u.startDate, u.endDate))}</Text>
                  </View>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink3, marginTop: 2 }}>
                    {fmtDate(u.startDate)} → {fmtDate(u.endDate)} · {Math.ceil(daysBetween(u.startDate, u.endDate) / 7)} weeks{u.discountPct ? ` · ${u.discountPct}% off first 4 weeks` : ''}
                  </Text>
                </View>
              ))}
              <Pressable onPress={() => setStep(1)} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 8 }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.purple600 }}>Edit units</Text>
              </Pressable>
            </Card>

            <Card title="Add-ons" subtitle="Optional">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {DEFAULT_ADDONS.map((p) => (
                  <Chip key={p.name} label={`+ ${p.name} (${AED(p.rate)})`} onPress={() => setAddOns((a) => [...a, { ...p, quantity: 1 }])} />
                ))}
                <Chip label="+ Custom" onPress={() => setAddOns((a) => [...a, { name: '', description: '', quantity: 1, rate: 0 }])} />
              </View>
              {addOns.map((a, i) => {
                const set = (patch: Partial<AddOnRow>) => setAddOns((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
                return (
                  <View key={i} style={{ marginTop: 10, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TextInput value={a.name} onChangeText={(t) => set({ name: t })} placeholder="Name" placeholderTextColor={COLORS.ink4} style={[inputStyle, { flex: 2 }]} />
                    <TextInput value={a.quantity ? String(a.quantity) : ''} onChangeText={(t) => set({ quantity: num(t) })} placeholder="Qty" keyboardType="number-pad" placeholderTextColor={COLORS.ink4} style={[inputStyle, { width: 52 }]} />
                    <TextInput value={a.rate ? String(a.rate) : ''} onChangeText={(t) => set({ rate: num(t) })} placeholder="Rate" keyboardType="decimal-pad" placeholderTextColor={COLORS.ink4} style={[inputStyle, { width: 72 }]} />
                    <Pressable onPress={() => setAddOns((rows) => rows.filter((_, j) => j !== i))} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    </Pressable>
                  </View>
                )
              })}
              <TextInput value={notes} onChangeText={setNotes} placeholder="Notes on the quotation…" placeholderTextColor={COLORS.ink4} multiline style={[inputStyle, { marginTop: 12, height: 64, paddingTop: 10, textAlignVertical: 'top' }]} />
            </Card>

            <Card title="Total">
              <Line label={`Units (${units.length})`} value={AED(totals.unitsTotal)} />
              {addOns.length > 0 && <Line label={`Add-ons (${addOns.length})`} value={AED(totals.addOnsTotal)} />}
              <ToggleLine on={holdAdvance} label="Refundable deposit" value={AED(totals.advance)} offText="Refundable deposit removed"
                onToggle={(v) => toggle('holdAdvance', v, () => setHoldAdvance(v))} />
              {deposit > 0 && (
                <ToggleLine on label="Security deposit" value={AED(deposit)} offText="" onToggle={() => toggle('deposit', 0, () => setDeposit(0))} />
              )}
              <ToggleLine on={vatEnabled} label="VAT (5%)" value={AED(totals.vat)} offText="VAT removed"
                onToggle={(v) => toggle('vatEnabled', v, () => setVatEnabled(v))} />
              <ToggleLine on={cardFeeEnabled} label={`Card fee if paid online (${cardFeePct}%)`} value={`+${AED(totals.cardFee)}`} offText="Card fee off" addText="+ Turn on (3%)"
                onToggle={(v) => toggle('cardFeeEnabled', v, () => setCardFeeEnabled(v))} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.purple100 }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 16, color: COLORS.ink }}>Total</Text>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 16, color: COLORS.purple600 }}>{AED(totals.total)}</Text>
              </View>
            </Card>
          </>
        )}

        {step === 3 && !contractId && (
          <>
            <Card title="Contract" subtitle="Made from the quotation — its terms carry over">
              <Line label="Customer" value={name} />
              <Line label="Period" value={`${fmtDate(from)} → ${fmtDate(to)}`} />
              <Line label="Units" value={units.map((u) => u.unitNumber).join(', ')} />
              <Line label={`Total (${Math.ceil(days / 7)} weeks)`} value={AED(totals.total)} />
            </Card>

            <Card title="ID documents" subtitle="An Emirates ID or passport is needed before the contract">
              {(docs.data ?? []).map((d) => (
                <View key={d._id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft }}>
                  <Ionicons name="document-text-outline" size={16} color={COLORS.purple600} />
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>{d.name}</Text>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: ID_DOC_TYPES.includes(d.type) ? '#1D4ED8' : COLORS.ink3 }}>{DOC_TYPE_LABELS[d.type] ?? d.type}</Text>
                  <Pressable onPress={() => confirmAction('Remove this document?', d.name, 'Remove', () => removeDoc.mutate(d._id), { destructive: true })} hitSlop={8}>
                    <Ionicons name="close" size={16} color={COLORS.danger} />
                  </Pressable>
                </View>
              ))}
              {docs.isLoading && <ActivityIndicator color={COLORS.purple600} style={{ marginVertical: 8 }} />}
              <Text style={[labelStyle, { marginTop: 12 }]}>Upload as</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['emirates_id', 'passport', 'visa', 'trade_license', 'other'].map((t) => (
                  <Chip key={t} label={DOC_TYPE_LABELS[t]} active={docType === t} onPress={() => setDocType(t)} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <SecondaryButton icon="camera-outline" label="Camera" busy={upload.isPending} onPress={() => upload.mutate('camera')} />
                <SecondaryButton icon="images-outline" label="Photos" busy={upload.isPending} onPress={() => upload.mutate('library')} />
              </View>
              <PressableScale
                onPress={() => requestId.mutate()}
                disabled={requestId.isPending}
                style={{ marginTop: 8, height: 44, borderRadius: 12, backgroundColor: COLORS.whatsapp, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: requestId.isPending ? 0.6 : 1 }}
              >
                <Ionicons name="logo-whatsapp" size={17} color="#fff" />
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: '#fff' }}>Ask them for it on WhatsApp</Text>
              </PressableScale>
              {awaitingId && !hasId && (
                <Text style={{ marginTop: 8, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>Waiting for their ID — checking every 15 seconds.</Text>
              )}
            </Card>

            <Card title={`Authorized persons (${persons.length})`} subtitle="Family or staff who may also access the unit">
              {persons.map((p, i) => {
                const set = (patch: Partial<AccessPerson>) => setPersons((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
                return (
                  <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <TextInput value={p.name} onChangeText={(t) => set({ name: t })} placeholder="Full name" placeholderTextColor={COLORS.ink4} style={[inputStyle, { flex: 1.4 }]} />
                    <TextInput value={p.phone} onChangeText={(t) => set({ phone: t })} placeholder="Phone" keyboardType="phone-pad" placeholderTextColor={COLORS.ink4} style={[inputStyle, { flex: 1 }]} />
                    <Pressable onPress={() => setPersons((rows) => rows.filter((_, j) => j !== i))} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    </Pressable>
                  </View>
                )
              })}
              <Chip label="+ Add person" onPress={() => setPersons((rows) => [...rows, { name: '', phone: '', relation: '', idType: '', idNumber: '' }])} />
            </Card>
          </>
        )}

        {step === 3 && !!contractId && (
          <ContractDone
            contract={contract.data} loading={contract.isLoading} customerName={name}
            onSend={() => sendSigning.mutate()} sending={sendSigning.isPending}
            onCancel={() => confirmAction('Cancel this contract?', 'The units are released.', 'Cancel contract', () => cancelContract.mutate(), { destructive: true, cancelLabel: 'Keep' })}
            onNote={setNote}
          />
        )}

        {note && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: note.ok ? COLORS.successTint : COLORS.warnTint }}>
            <Text style={{ flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 13, color: note.ok ? COLORS.success : COLORS.warnInk }}>{note.text}</Text>
            {!!note.waUrl && (
              <Pressable onPress={() => { Linking.openURL(note.waUrl!); setNote(null) }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.whatsapp }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: '#fff' }}>Open WhatsApp</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* What moves the booking on, always in reach. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.line }}>
        {step > 0 && (
          <Pressable onPress={() => setStep(step - 1)} hitSlop={8} style={{ paddingHorizontal: 8, height: 46, justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink3 }}>Back</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        {step === 0 && <PrimaryButton label="Next" icon="chevron-forward" disabled={!customer} onPress={() => goTo(1)} />}
        {step === 1 && <PrimaryButton label="Next" icon="chevron-forward" onPress={() => goTo(2)} />}
        {step === 2 && (
          <>
            <SecondaryButton label={saveQuote.isPending ? 'Saving…' : 'Save only'} disabled={busy} onPress={() => saveQuote.mutate(undefined, { onSuccess: (q) => setNote({ ok: true, text: `${q.quoteNo} saved.` }) })} />
            {!!quoteId && <SecondaryButton label="Next ›" disabled={busy} onPress={() => setStep(3)} />}
            <PrimaryButton label="Send" icon="logo-whatsapp" busy={sendQuote.isPending} disabled={busy} onPress={() => sendQuote.mutate()} />
          </>
        )}
        {step === 3 && !contractId && (
          <PrimaryButton
            label={hasId ? 'Create contract' : 'Add the ID first'}
            icon="briefcase-outline"
            busy={createContract.isPending}
            disabled={!hasId || !quoteId}
            onPress={() => createContract.mutate()}
          />
        )}
        {step === 3 && !!contractId && <PrimaryButton label="Done" icon="checkmark" onPress={() => router.back()} />}
      </View>

      {picking && (
        <DateTimePicker
          value={new Date(`${(picking === 'start' ? from : to || from)}T00:00:00`)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={picking === 'end' ? new Date(`${from}T00:00:00`) : new Date()}
          onChange={(event, date) => {
            const which = picking
            setPicking(null)
            if (event.type !== 'set' || !date) return
            const d = isoDay(date)
            // Moving the start keeps the length already chosen.
            if (which === 'start') setRange(d, weeks ? addWeeksISO(d, weeks) : to)
            else setRange(from, d)
          }}
        />
      )}
    </KeyboardAvoidingView>
  )
}

// ── Units step ──────────────────────────────────────────────────────────────

type UnitFilter = 'available' | 'free' | 'all'
const UNIT_FILTERS: { key: UnitFilter; label: string }[] = [
  { key: 'available', label: 'Available' }, { key: 'free', label: 'Free in period' }, { key: 'all', label: 'All' },
]
const PAGE = 40

function UnitsStep({ from, to, weeks, days, units, setUnits, onPickStart, onPickEnd, onWeeks, defaultSize, unitParam }: {
  from: string; to: string; weeks: number | null; days: number
  units: UnitRow[]; setUnits: (fn: (u: UnitRow[]) => UnitRow[]) => void
  onPickStart: () => void; onPickEnd: () => void; onWeeks: (w: number) => void
  defaultSize: number; unitParam?: string
}) {
  const [filter, setFilter] = useState<UnitFilter>('available')
  const [size, setSize] = useState<number | null>(defaultSize || null)
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(PAGE)
  const ready = !!from && !!to && to > from

  const all = useQuery({
    queryKey: ['available-units', from, to],
    queryFn: () => bookingApi.availableUnits(from, to),
    enabled: ready,
  })

  const addUnit = (u: AvailableUnit) => setUnits((prev) => (prev.some((r) => r.unitId === u._id) ? prev : [...prev, {
    unitId: u._id, unitNumber: u.unitNumber, sizeSqf: u.sizeSqf, floor: u.floor,
    startDate: from, endDate: to, rate: u.price || 0, discountPct: u.discountPct || 0,
  }]))

  // The unit the rep started from, added once the list is in.
  const [preselected, setPreselected] = useState(!unitParam)
  if (!preselected && all.data) {
    setPreselected(true)
    const u = all.data.find((x) => x._id === unitParam || x.unitNumber === unitParam)
    if (u) addUnit(u)
  }

  const sizes = [...new Set((all.data ?? []).map((u) => u.sizeSqf))].sort((a, b) => a - b)
  const sizeOn = size && sizes.includes(size) ? size : null
  const selected = new Set(units.map((u) => u.unitId))
  const list = (all.data ?? []).filter((u) => {
    if (search && !u.unitNumber.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (sizeOn && u.sizeSqf !== sizeOn) return false
    if (filter === 'available') return u.status === 'available'
    if (filter === 'free') return !u.bookedInPeriod && u.status !== 'maintenance'
    return true
  })

  return (
    <>
      <Card title="Rental period">
        <Text style={labelStyle}>Start</Text>
        <PressableScale onPress={onPickStart} style={[inputStyle, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Ionicons name="calendar-outline" size={16} color={COLORS.purple600} />
          <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.ink }}>{fmtDate(from)}</Text>
        </PressableScale>
        <Text style={[labelStyle, { marginTop: 14 }]}>How long</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {WEEK_OPTIONS.map((w) => <Chip key={w} label={`${w} wks`} active={weeks === w} onPress={() => onWeeks(w)} />)}
          <Chip label="End date…" active={!!to && !weeks} onPress={onPickEnd} />
        </ScrollView>
        {!!from && !!to && (
          <Text style={{ marginTop: 10, fontFamily: FONTS.body, fontSize: 12.5, color: days > 0 ? COLORS.ink3 : COLORS.danger }}>
            {days > 0 ? `Ends ${fmtDate(to)} · ${days} days · ${Math.ceil(days / 7)} weeks` : 'The end date must be after the start date'}
          </Text>
        )}
      </Card>

      {units.length > 0 && (
        <Card title={`Selected (${units.length})`} subtitle="Rate is per 4 weeks; the discount applies to the first 4 weeks">
          {units.map((u, i) => {
            const set = (patch: Partial<UnitRow>) => setUnits((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
            return (
              <View key={u.unitId} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink }}>{u.unitNumber} <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>· {u.sizeSqf} sq ft · Floor {u.floor || '—'}</Text></Text>
                  <Pressable onPress={() => setUnits((rows) => rows.filter((_, j) => j !== i))} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={smallLabel}>Rate / 4 wks</Text>
                    <TextInput value={u.rate ? String(u.rate) : ''} onChangeText={(t) => set({ rate: num(t) })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.ink4} style={inputStyle} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={smallLabel}>Discount %</Text>
                    <TextInput value={u.discountPct ? String(u.discountPct) : ''} onChangeText={(t) => set({ discountPct: Math.min(100, num(t)) })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.ink4} style={inputStyle} />
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={smallLabel}>For the period</Text>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.purple600, marginTop: 12 }}>{AED(unitPeriodTotal(u.rate, u.discountPct, u.startDate, u.endDate))}</Text>
                  </View>
                </View>
              </View>
            )
          })}
        </Card>
      )}

      {ready && (
        <Card title="Pick units">
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {UNIT_FILTERS.map((f) => <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => { setFilter(f.key); setShown(PAGE) }} />)}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            <Chip label="All sizes" active={!sizeOn} onPress={() => { setSize(null); setShown(PAGE) }} />
            {sizes.map((s) => <Chip key={s} label={`${s} sq ft`} active={sizeOn === s} onPress={() => { setSize(s); setShown(PAGE) }} />)}
          </ScrollView>
          <View style={[inputStyle, { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <Ionicons name="search" size={15} color={COLORS.ink4} />
            <TextInput value={search} onChangeText={(t) => { setSearch(t); setShown(PAGE) }} placeholder="Unit number" placeholderTextColor={COLORS.ink4} autoCapitalize="characters" style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink }} />
          </View>
          {all.isLoading ? (
            <ActivityIndicator color={COLORS.purple600} style={{ marginVertical: 20 }} />
          ) : all.isError ? (
            <Text style={{ marginTop: 12, fontFamily: FONTS.body, fontSize: 13, color: COLORS.danger }}>{apiError(all.error)}</Text>
          ) : (
            <>
              <Text style={{ marginTop: 10, fontFamily: FONTS.bodyBold, fontSize: 11.5, color: COLORS.ink3 }}>{list.length} unit{list.length === 1 ? '' : 's'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {list.slice(0, shown).map((u) => {
                  const on = selected.has(u._id)
                  const blocked = u.status === 'maintenance'
                  const badge = u.bookedInPeriod ? ['Booked', COLORS.danger] : u.status === 'occupied' ? ['Rented', COLORS.danger]
                    : u.status === 'reserved' ? ['Reserved', COLORS.warnInk] : blocked ? ['Maintenance', COLORS.ink3] : ['Available', COLORS.success]
                  return (
                    <PressableScale
                      key={u._id}
                      disabled={blocked}
                      onPress={() => (on ? setUnits((rows) => rows.filter((r) => r.unitId !== u._id)) : addUnit(u))}
                      style={{
                        width: '48.5%', padding: 12, borderRadius: 14, borderWidth: on ? 2 : 1,
                        borderColor: on ? COLORS.purple600 : COLORS.line, backgroundColor: on ? COLORS.purple50 : '#fff', opacity: blocked ? 0.5 : 1,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink }}>{u.unitNumber}</Text>
                        {on ? <Ionicons name="checkmark-circle" size={18} color={COLORS.purple600} />
                          : <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 9.5, color: badge[1] }}>{badge[0]}</Text>}
                      </View>
                      <Text style={{ marginTop: 2, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>{u.sizeSqf} sq ft · Floor {u.floor || '—'}</Text>
                      <Text style={{ marginTop: 6, fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.purple700 }}>{AED(u.price || 0)}/4 wks</Text>
                    </PressableScale>
                  )
                })}
              </View>
              {list.length > shown && (
                <Pressable onPress={() => setShown((n) => n + PAGE)} style={{ alignSelf: 'center', marginTop: 12, padding: 8 }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.purple600 }}>Show more ({list.length - shown})</Text>
                </Pressable>
              )}
              {list.length === 0 && (
                <Text style={{ marginTop: 12, textAlign: 'center', fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3 }}>No units match. Try “Free in period” or another size.</Text>
              )}
            </>
          )}
        </Card>
      )}
    </>
  )
}

// ── Contract created ────────────────────────────────────────────────────────

function ContractDone({ contract, loading, customerName, onSend, sending, onCancel, onNote }: {
  contract?: { _id: string; contractNo: string; status: string; startDate: string; endDate: string }
  loading: boolean; customerName: string
  onSend: () => void; sending: boolean; onCancel: () => void
  onNote: (n: { ok: boolean; text: string }) => void
}) {
  const accounts = useQuery({ queryKey: ['accounts-users'], queryFn: bookingApi.accountsUsers, staleTime: 5 * 60_000 })
  const tasks = useQuery({
    queryKey: ['contract-tasks', contract?._id],
    queryFn: () => bookingApi.contractTasks(contract!._id),
    enabled: !!contract,
  })
  const [title, setTitle] = useState('Raise the invoice in Zoho Books')
  const [owner, setOwner] = useState('')
  const [taskNotes, setTaskNotes] = useState('')
  // With one accounts user there is no choice to make.
  const ownerId = owner || (accounts.data?.length === 1 ? accounts.data[0]._id : '')

  const addTask = useMutation({
    mutationFn: () => bookingApi.addTask({ title: title.trim(), assignedTo: ownerId, contractId: contract!._id, contractNo: contract!.contractNo, notes: taskNotes, customerName }),
    onSuccess: () => {
      onNote({ ok: true, text: `Assigned to ${accounts.data?.find((u) => u._id === ownerId)?.name ?? 'accounts'}.` })
      setTitle(''); setTaskNotes('')
      tasks.refetch()
    },
    onError: (e) => onNote({ ok: false, text: apiError(e) }),
  })

  if (loading || !contract) return <ActivityIndicator color={COLORS.purple600} style={{ marginTop: 24 }} />
  const live = ['draft', 'pending_signature', 'active'].includes(contract.status)

  return (
    <>
      <Card title={`Contract ${contract.contractNo}`} subtitle={contract.status.replace(/_/g, ' ')}>
        <Line label="Term" value={`${fmtDate(contract.startDate.slice(0, 10))} → ${fmtDate(contract.endDate.slice(0, 10))}`} />
        {contract.status === 'cancelled' && (
          <Text style={{ marginTop: 8, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.danger }}>
            This contract was cancelled. Edit the quotation and create a new contract if needed.
          </Text>
        )}
        {live && (
          <View style={{ gap: 8, marginTop: 12 }}>
            <PressableScale
              onPress={onSend}
              disabled={sending}
              style={{ height: 46, borderRadius: 12, backgroundColor: COLORS.whatsapp, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: sending ? 0.6 : 1 }}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="logo-whatsapp" size={17} color="#fff" />}
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' }}>{contract.status === 'active' ? 'Re-send for signing' : 'Send signing link on WhatsApp'}</Text>
            </PressableScale>
            <Pressable onPress={onCancel} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.danger }}>Cancel contract</Text>
            </Pressable>
          </View>
        )}
      </Card>

      <Card title="What happens next?" subtitle="Hand the rest to accounts — it lands on their board, due today">
        <TextInput value={title} onChangeText={setTitle} placeholder="Raise the invoice in Zoho Books" placeholderTextColor={COLORS.ink4} style={inputStyle} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {(accounts.data ?? []).map((u) => <Chip key={u._id} label={u.name} active={ownerId === u._id} onPress={() => setOwner(u._id)} />)}
          {accounts.data?.length === 0 && <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>No accounts user set up.</Text>}
        </View>
        <TextInput
          value={taskNotes} onChangeText={setTaskNotes} multiline
          placeholder="Notes for them — security deposit, payment method, Stripe auto-payment, billing cycle…"
          placeholderTextColor={COLORS.ink4} style={[inputStyle, { marginTop: 10, height: 76, paddingTop: 10, textAlignVertical: 'top' }]}
        />
        <View style={{ marginTop: 10 }}>
          <PrimaryButton label="Add task" icon="add" busy={addTask.isPending} disabled={!title.trim() || !ownerId} onPress={() => addTask.mutate()} />
        </View>
        {(tasks.data ?? []).length > 0 && (
          <View style={{ marginTop: 12, gap: 6 }}>
            <Text style={labelStyle}>Already assigned</Text>
            {tasks.data!.map((t) => (
              <View key={t._id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: t.status === 'done' ? COLORS.success : COLORS.warnInk }}>
                  {t.status === 'done' ? 'DONE' : t.status === 'in_progress' ? 'IN PROGRESS' : 'TO DO'}
                </Text>
                <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>{t.title}</Text>
                <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>{t.assignedTo?.name ?? ''}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

const inputStyle = {
  height: 44, borderRadius: RADII.input, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff',
  paddingHorizontal: 12, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink,
}
const labelStyle = { fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' as const, color: COLORS.ink4, marginBottom: 8 }
const smallLabel = { fontFamily: FONTS.bodyBold, fontSize: 10.5, color: COLORS.ink4, marginBottom: 4 }

/** Quotes are in fils, so two decimals, as on the PDF. */
const AED = (n: number) => `AED ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (t: string) => Number(t.replace(/[^\d.]/g, '')) || 0
const fmtDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—')
function monthsLater(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10)
}

function Header({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 8 }}>
      <Pressable onPress={onBack} hitSlop={12} style={{ padding: 4 }}>
        <Ionicons name="chevron-back" size={24} color={COLORS.ink} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.display, fontSize: 21, color: COLORS.ink }}>{title}</Text>
        {!!subtitle && <Text numberOfLines={1} style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>{subtitle}</Text>}
      </View>
    </View>
  )
}

function Stepper({ step, done, onPress }: { step: number; done: boolean[]; onPress: (i: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 12, gap: 4 }}>
      {STEPS.map((label, i) => {
        const active = i === step
        const ok = done[i] && !active
        return (
          <Pressable key={label} onPress={() => onPress(i)} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{
              width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
              backgroundColor: ok ? COLORS.success : active ? COLORS.purple600 : COLORS.control,
            }}>
              {ok ? <Ionicons name="checkmark" size={15} color="#fff" />
                : <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: active ? '#fff' : COLORS.ink3 }}>{i + 1}</Text>}
            </View>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: active ? COLORS.ink : ok ? COLORS.success : COLORS.ink3 }}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.lineSoft, padding: 16 }}>
      <Text style={{ fontFamily: FONTS.display, fontSize: 16.5, color: COLORS.ink }}>{title}</Text>
      {!!subtitle && <Text style={{ marginTop: 2, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3, textTransform: 'none' }}>{subtitle}</Text>}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 }}>
      <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3 }}>{label}</Text>
      <Text style={{ flexShrink: 1, textAlign: 'right', fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink }}>{value}</Text>
    </View>
  )
}

/** A line of the total that can be taken off this quote and put back. */
function ToggleLine({ on, label, value, offText, addText = '+ Add back', onToggle }: {
  on: boolean; label: string; value: string; offText: string; addText?: string; onToggle: (v: boolean) => void
}) {
  if (!on && !offText) return null
  return on ? (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink }}>{value}</Text>
        <Pressable onPress={() => onToggle(false)} hitSlop={10}><Ionicons name="close-circle" size={17} color={COLORS.danger} /></Pressable>
      </View>
    </View>
  ) : (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink4 }}>{offText}</Text>
      <Pressable onPress={() => onToggle(true)} hitSlop={10}><Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.purple600 }}>{addText}</Text></Pressable>
    </View>
  )
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      style={{
        paddingHorizontal: 13, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? COLORS.purple600 : '#fff', borderWidth: 1, borderColor: active ? COLORS.purple600 : COLORS.line,
      }}
    >
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: active ? '#fff' : COLORS.ink2 }}>{label}</Text>
    </PressableScale>
  )
}

function PrimaryButton({ label, icon, busy, disabled, onPress }: {
  label: string; icon?: keyof typeof Ionicons.glyphMap; busy?: boolean; disabled?: boolean; onPress: () => void
}) {
  const off = disabled || busy
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      style={{ height: 46, paddingHorizontal: 18, borderRadius: 14, backgroundColor: COLORS.purple600, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: off ? 0.5 : 1 }}
    >
      {busy ? <ActivityIndicator color="#fff" /> : !!icon && <Ionicons name={icon} size={16} color="#fff" />}
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' }}>{label}</Text>
    </PressableScale>
  )
}

function SecondaryButton({ label, icon, busy, disabled, onPress }: {
  label: string; icon?: keyof typeof Ionicons.glyphMap; busy?: boolean; disabled?: boolean; onPress: () => void
}) {
  const off = disabled || busy
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      style={{ flexGrow: icon ? 1 : 0, height: 46, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: off ? 0.5 : 1 }}
    >
      {busy ? <ActivityIndicator color={COLORS.purple600} /> : !!icon && <Ionicons name={icon} size={16} color={COLORS.purple600} />}
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: COLORS.ink2 }}>{label}</Text>
    </PressableScale>
  )
}
