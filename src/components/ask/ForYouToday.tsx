import { useState } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, Linking, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { COLORS, FONTS } from '../../lib/theme'
import { assistantApi, assistantLinkRoute, webUrlFor, type ClientSendResult, type Nudge, type NudgeItem } from '../../lib/assistant'
import { userApi } from '../../lib/users'
import { api, apiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { confirmAction } from '../../lib/alert'
import { openApiFile } from '../../lib/files'
import PressableScale from '../PressableScale'
import PickerSheet from '../PickerSheet'
import { Sheet } from './AskSheets'

const DOT: Record<string, string> = { high: '#D93F3F', medium: '#E59A1A', low: '#9A93A6' }

/** Anything else — the way people use ChatGPT or Claude. */
const ANYTHING = [
  'Write an Instagram post for our 20% off first month offer',
  'What is 5% VAT on AED 12,400?',
  'Reply politely to a customer asking for a discount',
]

const head = { fontFamily: FONTS.bodyBold, fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.ink4, marginBottom: 8 } as const

function Small({ label, onPress, icon, solid, disabled, tone }: {
  label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; solid?: boolean; disabled?: boolean; tone?: 'muted'
}) {
  const color = solid ? '#fff' : tone === 'muted' ? COLORS.ink3 : COLORS.purple600
  return (
    <PressableScale onPress={onPress} disabled={disabled}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34, paddingHorizontal: 12, borderRadius: 999,
        backgroundColor: solid ? COLORS.purple600 : '#fff', borderWidth: solid ? 0 : 1, borderColor: COLORS.line, opacity: disabled ? 0.5 : 1,
      }}>
      {icon && <Ionicons name={icon} size={14} color={color} />}
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color }}>{label}</Text>
    </PressableScale>
  )
}

/**
 * What a new chat opens with — the web's ForYouToday: what needs this person
 * today, worked out from the live records, each with one button that gets
 * the assistant to do it; what they set to run later; and a few "ask
 * anything" examples.
 */
export default function ForYouToday({ onDo, starters }: { onDo: (prompt: string) => void; starters: string[] }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const admin = user?.role === 'admin'
  const { data, isLoading, error } = useQuery({ queryKey: ['assistant-nudges'], queryFn: assistantApi.nudges, staleTime: 5 * 60_000 })
  const { data: later } = useQuery({
    queryKey: ['assistant-scheduled'],
    queryFn: () => assistantApi.scheduled().then((s) => s.filter((x) => x.status === 'scheduled')),
    staleTime: 60_000,
  })
  const { data: people } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: userApi.assignable,
    enabled: admin,
    staleTime: 10 * 60_000,
  })
  const [seeing, setSeeing] = useState('')
  const [picking, setPicking] = useState('')
  const [note, setNote] = useState('')
  const [flash, setFlash] = useState('')

  async function assign(key: string, to: string) {
    setFlash('')
    try {
      const r = await assistantApi.assignNudge(key, to, note)
      setFlash(`Given to ${r.to}${r.notified.phone || r.notified.browser ? ' — notified' : ' — they will see it on their dashboard and Tasks'}.`)
      setPicking(''); setNote('')
      qc.invalidateQueries({ queryKey: ['assistant-nudges'] })
    } catch (e) { setFlash(apiError(e)) }
  }
  async function done(taskId: string) {
    try { await api.patch(`/tasks/${taskId}`, { status: 'done' }) } catch (e) { setFlash(apiError(e)) } finally { qc.invalidateQueries({ queryKey: ['assistant-nudges'] }) }
  }
  async function cancelLater(id: string) {
    try { await assistantApi.cancelScheduled(id) } catch (e) { setFlash(apiError(e)) } finally { qc.invalidateQueries({ queryKey: ['assistant-scheduled'] }) }
  }

  return (
    <View style={{ gap: 22 }}>
      <View>
        <Text style={head}>For you today</Text>
        {isLoading && <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink3 }}>Checking the system…</Text>}
        {!!error && <Text style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.danger }}>{apiError(error)}</Text>}
        {data && !data.length && <Text style={{ fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.ink3 }}>Nothing is waiting on you. All clear.</Text>}
        <View style={{ gap: 8 }}>
          {data?.map((n) => (
            <NudgeRow
              key={n.taskId || n.key}
              n={n}
              open={seeing === n.key}
              onToggle={() => setSeeing(seeing === n.key ? '' : n.key)}
              onDo={() => onDo(n.prompt)}
              admin={admin}
              onAssign={() => { setPicking(n.key); setFlash('') }}
              onDone={n.taskId ? () => done(n.taskId!) : undefined}
            />
          ))}
          {!!flash && <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.purple600 }}>{flash}</Text>}
        </View>
      </View>

      {!!later?.length && (
        <View>
          <Text style={head}>Scheduled</Text>
          <View style={{ gap: 6 }}>
            {later.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.purple50, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 }}>
                <Ionicons name="time-outline" size={15} color={COLORS.purple600} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: COLORS.ink3 }}>
                    {new Date(s.runAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })}
                  </Text>
                  <Text numberOfLines={2} style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink }}>{s.summary?.[0] || 'Scheduled action'}</Text>
                </View>
                <Pressable onPress={() => confirmAction('Cancel this?', s.summary?.[0], 'Cancel it', () => cancelLater(s.id), { destructive: true, cancelLabel: 'Keep it' })}
                  hitSlop={10} accessibilityLabel="Cancel this" style={{ padding: 4 }}>
                  <Ionicons name="close" size={18} color={COLORS.ink3} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}

      <View>
        <Text style={head}>Try</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {starters.map((s) => (
            <PressableScale key={s} onPress={() => onDo(s)}
              style={{ backgroundColor: COLORS.purple50, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 }}>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.purple700 }}>{s}</Text>
            </PressableScale>
          ))}
        </View>
      </View>

      <View>
        <Text style={head}>Or ask anything</Text>
        <View style={{ gap: 8 }}>
          {ANYTHING.map((s) => (
            <PressableScale key={s} onPress={() => onDo(s)}
              style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13.5, color: COLORS.ink }}>{s}</Text>
            </PressableScale>
          ))}
        </View>
        <Text style={{ marginTop: 10, fontFamily: FONTS.body, fontSize: 12, lineHeight: 17, color: COLORS.ink3 }}>
          It answers from the live records, and can quote, book, invoice and message. Anything that reaches a customer or moves money waits for you to press Confirm.
        </Text>
      </View>

      {/* Give an item to a colleague, with a note: they get a task and a push notification. */}
      <Sheet visible={!!picking} title="Give this to…" subtitle={data?.find((n) => n.key === picking)?.title} onClose={() => setPicking('')}>
        <TextInput value={note} onChangeText={setNote} placeholder="A note for them (optional)" placeholderTextColor={COLORS.faint}
          style={{ marginTop: 6, minHeight: 44, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#fff', fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink }} />
        {!people && <ActivityIndicator color={COLORS.brand} style={{ marginTop: 14 }} />}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {(people || []).filter((p) => p._id !== user?.id).map((p) => (
            <Small key={p._id} label={p.name} onPress={() => { void assign(picking, p._id) }} />
          ))}
        </View>
      </Sheet>
    </View>
  )
}

function NudgeRow({ n, open, onToggle, onDo, admin, onAssign, onDone }: {
  n: Nudge; open: boolean; onToggle: () => void; onDo: () => void; admin: boolean; onAssign: () => void; onDone?: () => void
}) {
  const hasItems = !!n.items?.length
  return (
    <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: n.taskId ? COLORS.purple600 : COLORS.line, borderRadius: 16, padding: 12 }}>
      <Pressable onPress={hasItems ? onToggle : undefined} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }} accessibilityState={{ expanded: hasItems ? open : undefined }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: DOT[n.tone] || DOT.low, marginTop: 6 }} />
        <View style={{ flex: 1 }}>
          {!!n.from && <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: COLORS.purple600 }}>From {n.from}</Text>}
          <Text style={{ fontFamily: FONTS.display, fontSize: 15.5, color: COLORS.ink }}>{n.title}</Text>
          {!!n.detail && !open && <Text numberOfLines={2} style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3, marginTop: 1 }}>{n.detail}</Text>}
          {!!n.assignedTo && <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: COLORS.purple600 }}>With {n.assignedTo}</Text>}
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginLeft: 19 }}>
        <Small label="Do it" solid onPress={onDo} icon="sparkles" />
        {hasItems && <Small label={open ? 'Hide' : 'Details'} icon={open ? 'chevron-up' : 'chevron-down'} onPress={onToggle} />}
        {admin && !n.taskId && <Small label="Assign" icon="person-add-outline" onPress={onAssign} />}
        {onDone && <Small label="Done" icon="checkmark" onPress={onDone} />}
      </View>
      {open && <SendList items={n.items || []} total={n.count} />}
    </View>
  )
}

const label = (i: NudgeItem) => i.name || i.customer || i.lead || i.title || i.phone || ''
const why = (i: NudgeItem) => [
  i.reason || i.lastWord || (i.lastMessage ? `"${i.lastMessage.slice(0, 90)}"` : '') || (i.ends ? `ends ${i.ends}` : '') || (i.due ? `due ${i.due}` : ''),
  i.waiting, i.quoteNo || i.contractNo, i.phone && i.phone !== label(i) ? i.phone : '',
].filter(Boolean).join(' · ')

function useOpenRecord() {
  const router = useRouter()
  return (path: string) => {
    const route = assistantLinkRoute({ label: '', path })
    if (route) router.push(route)
    else void Linking.openURL(webUrlFor(path))
  }
}

/**
 * Each person on an item, with why, and the message that asks them to do it
 * themselves — with the link. Nothing goes until WhatsApp or Email is pressed.
 */
function SendList({ items, total }: { items: NudgeItem[]; total: number }) {
  const openRecord = useOpenRecord()
  const [open, setOpen] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [res, setRes] = useState<Record<number, ClientSendResult | string>>({})
  const [busy, setBusy] = useState('')

  async function preview(i: number) {
    if (open === i) { setOpen(null); return }
    setOpen(i)
    if (draft[i] !== undefined || !items[i].send) return
    try {
      const d = await assistantApi.draft(items[i].send!)
      setDraft((x) => ({ ...x, [i]: d.text }))
    } catch (e) { setRes((r) => ({ ...r, [i]: apiError(e) })) }
  }
  async function send(i: number, via: 'whatsapp' | 'email') {
    const s = items[i].send
    if (!s) return
    setBusy(`${i}:${via}`)
    try {
      const r = await assistantApi.clientSend({ ...s, via, text: s.kind === 'sign' ? '' : draft[i] })
      setRes((x) => ({ ...x, [i]: r }))
    } catch (e) { setRes((x) => ({ ...x, [i]: apiError(e) })) } finally { setBusy('') }
  }
  function sendAll() {
    const todo = items.map((it, i) => i).filter((i) => items[i].send && !items[i].notice && !(res[i] as ClientSendResult)?.sent)
    confirmAction(
      `Send to all ${todo.length} on WhatsApp?`,
      'Each gets their message as written. Anyone who has not written in 24 hours gets an "Open WhatsApp" button instead.',
      'Send all',
      async () => { for (const i of todo) await send(i, 'whatsapp') },
    )
  }
  function confirmSend(i: number, via: 'whatsapp' | 'email') {
    confirmAction(`Send to ${label(items[i])} on ${via === 'email' ? 'email' : 'WhatsApp'}?`, draft[i] ? undefined : 'Press Preview first to see or change the message.', 'Send', () => { void send(i, via) })
  }

  return (
    <View style={{ marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.lineSoft }}>
      {items.map((it, i) => {
        const r = res[i]
        return (
          <View key={i} style={{ paddingVertical: 10, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: COLORS.lineSoft, gap: 6 }}>
            <View>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink }}>{label(it)}</Text>
              {!!why(it) && <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>{why(it)}</Text>}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {!!it.open && (
                <Small label={it.open.startsWith('/contracts') ? 'Open contract' : it.open === '/whatsapp' ? 'Open chats' : 'Open'} icon="open-outline" onPress={() => openRecord(it.open!)} />
              )}
              {!!it.phone && !it.send && (
                <Small label="Call" icon="call-outline" onPress={() => { void Linking.openURL(`tel:${it.phone}`) }} />
              )}
              {it.send && !it.notice && (
                <>
                  <Small label={open === i ? 'Hide preview' : 'Preview'} tone="muted" onPress={() => preview(i)} />
                  <Small label={busy === `${i}:whatsapp` ? 'Sending…' : 'WhatsApp'} icon="logo-whatsapp" disabled={!!busy} onPress={() => confirmSend(i, 'whatsapp')} />
                  <Small label={busy === `${i}:email` ? 'Sending…' : 'Email'} icon="mail-outline" disabled={!!busy} onPress={() => confirmSend(i, 'email')} />
                </>
              )}
            </View>
            {it.notice && it.send && <NoticePicker item={it} />}
            {open === i && draft[i] === undefined && typeof r !== 'string' && (
              <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>Writing the message…</Text>
            )}
            {open === i && draft[i] !== undefined && (
              <View style={{ gap: 4 }}>
                <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>
                  {it.send?.kind === 'sign' ? 'What they get — with their signing link:' : 'What they get — change it here before sending if you like:'}
                </Text>
                <TextInput
                  value={draft[i]}
                  onChangeText={(t) => setDraft((d) => ({ ...d, [i]: t }))}
                  editable={it.send?.kind !== 'sign'}
                  multiline
                  style={{ minHeight: 90, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, padding: 10, backgroundColor: '#fff', textAlignVertical: 'top', fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 19, color: COLORS.ink }}
                />
              </View>
            )}
            {typeof r === 'string' && <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.danger }}>{r}</Text>}
            {r && typeof r !== 'string' && (r.sent ? (
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.success }}>✓ Sent{r.form ? ' — the WhatsApp ID form' : ''}</Text>
            ) : (
              <View style={{ gap: 4 }}>
                <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>{r.reason || 'Not sent.'}</Text>
                {!!r.waLink && <Small label="Open WhatsApp" icon="logo-whatsapp" onPress={() => { void Linking.openURL(r.waLink!) }} />}
              </View>
            ))}
          </View>
        )
      })}
      {total > items.length && (
        <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3, paddingTop: 8 }}>
          Showing {items.length} of {total} — press Do it to work through all of them.
        </Text>
      )}
      {items.filter((x) => x.send && !x.notice).length > 1 && (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Small label="Send all on WhatsApp" icon="logo-whatsapp" solid disabled={!!busy} onPress={sendAll} />
        </View>
      )}
    </View>
  )
}

const dubaiToday = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10)
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * A notice is the person's choice: the suggested template is picked already,
 * any other notice template can be chosen instead, and it goes today or on a
 * day they pick (then it waits under Scheduled, where it can be cancelled).
 */
function NoticePicker({ item }: { item: NudgeItem }) {
  const qc = useQueryClient()
  const [today] = useState(dubaiToday)
  const { data: templates } = useQuery({ queryKey: ['notice-templates'], queryFn: assistantApi.noticeTemplates, staleTime: 10 * 60_000 })
  const [templateId, setTemplateId] = useState(item.notice?.templateId || '')
  const [day, setDay] = useState(today)
  const [choosing, setChoosing] = useState(false)
  const [dating, setDating] = useState(false)
  const [busy, setBusy] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [out, setOut] = useState<{ ok: boolean; text: string; waLink?: string } | null>(null)
  const kind = item.send!.kind.slice(7)
  const name = templates?.find((t) => t.id === templateId)?.name

  async function preview() {
    setPreviewing(true)
    try {
      await openApiFile('/assistant/notices/preview', { kind: 'pdf', label: name || 'notice', params: { contractId: item.send!.ref, templateId, kind } })
    } catch (e) { setOut({ ok: false, text: (e as Error).message }) } finally { setPreviewing(false) }
  }
  function go(via: 'email' | 'whatsapp') {
    if (!templateId) { setOut({ ok: false, text: 'Pick a notice first.' }); return }
    const later = day > today
    confirmAction(
      `${later ? 'Schedule' : 'Send'} "${name || 'the notice'}"?`,
      `To ${label(item)} by ${via === 'email' ? 'email' : 'WhatsApp'}${later ? ` on ${day} at 9:00` : ' now'}.`,
      later ? 'Schedule' : 'Send',
      async () => {
        setBusy(via); setOut(null)
        try {
          if (later) {
            await assistantApi.scheduleNotice({ contractId: item.send!.ref, templateId, kind, via, runAt: day })
            setOut({ ok: true, text: `Scheduled for ${day}, 9:00 — see Scheduled to cancel.` })
            qc.invalidateQueries({ queryKey: ['assistant-scheduled'] })
          } else {
            const r = await assistantApi.clientSend({ kind: item.send!.kind, ref: item.send!.ref, via, templateId })
            setOut(r.sent ? { ok: true, text: 'Sent — logged on the contract.' } : { ok: false, text: r.reason || 'Not sent.', waLink: r.waLink })
          }
        } catch (e) { setOut({ ok: false, text: apiError(e) }) } finally { setBusy('') }
      },
    )
  }

  const later = day > today
  return (
    <View style={{ gap: 6, backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 10 }}>
      <Pressable onPress={() => setChoosing(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 10, minHeight: 38 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13, color: name ? COLORS.ink : COLORS.faint }}>
          {name ? `${name}${templateId === item.notice?.templateId ? ' (suggested)' : ''}` : 'Choose a notice…'}
        </Text>
        <Ionicons name="chevron-down" size={15} color={COLORS.ink3} />
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Small label={previewing ? 'Opening…' : 'Preview'} tone="muted" icon="document-text-outline" disabled={!templateId || previewing} onPress={preview} />
        <Small label={later ? `On ${day}` : 'Today'} tone="muted" icon="calendar-outline" onPress={() => setDating(true)} />
        <Small label={busy === 'email' ? '…' : later ? 'Email on that day' : 'Email now'} icon="mail-outline" disabled={!!busy} onPress={() => go('email')} />
        <Small label={busy === 'whatsapp' ? '…' : later ? 'WhatsApp on that day' : 'WhatsApp now'} icon="logo-whatsapp" disabled={!!busy} onPress={() => go('whatsapp')} />
      </View>
      {out && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12.5, color: out.ok ? COLORS.purple600 : COLORS.danger }}>{out.text}</Text>
          {!!out.waLink && <Small label="Open WhatsApp" icon="logo-whatsapp" onPress={() => { void Linking.openURL(out.waLink!) }} />}
        </View>
      )}
      <PickerSheet
        visible={choosing}
        title="Which notice"
        options={(templates || []).map((t) => ({ value: t.id, label: `${t.name}${t.id === item.notice?.templateId ? ' (suggested)' : ''}` }))}
        selected={templateId}
        onSelect={setTemplateId}
        onClose={() => setChoosing(false)}
      />
      {dating && (
        <DateTimePicker
          value={new Date(`${day}T12:00:00`)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={new Date(`${today}T00:00:00`)}
          onChange={(event, d) => { setDating(false); if (event.type === 'set' && d) setDay(ymd(d) < today ? today : ymd(d)) }}
        />
      )}
    </View>
  )
}
