import { useMemo, useState, type ReactNode } from 'react'
import { Modal, View, Text, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import { COLORS, FONTS } from '../../lib/theme'
import { assistantApi, type DevRequest, type DevRequestRow } from '../../lib/assistant'
import { apiError } from '../../lib/api'
import { confirmAction, notify } from '../../lib/alert'
import PressableScale from '../PressableScale'
import PickerSheet from '../PickerSheet'

/** A bottom sheet with a title — every list beside the Ask chat uses it. */
export function Sheet({ visible, title, subtitle, onClose, children, footer }: {
  visible: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(31,31,31,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
          <Pressable
            style={{ backgroundColor: COLORS.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '86%', paddingBottom: insets.bottom + 10 }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: 'center', paddingTop: 10 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.line }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink }}>{title}</Text>
                {!!subtitle && <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3, marginTop: 2 }}>{subtitle}</Text>}
              </View>
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={COLORS.ink2} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>
              {children}
            </ScrollView>
            {footer}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const muted = { fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3 } as const
const rowStyle = { paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.lineSoft } as const
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Pill({ label, onPress, tone = 'light', icon, disabled }: {
  label: string; onPress: () => void; tone?: 'light' | 'solid'; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean
}) {
  const solid = tone === 'solid'
  return (
    <PressableScale onPress={onPress} disabled={disabled}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8,
        backgroundColor: solid ? COLORS.purple600 : '#fff', borderWidth: solid ? 0 : 1, borderColor: COLORS.line, opacity: disabled ? 0.5 : 1,
      }}>
      {icon && <Ionicons name={icon} size={14} color={solid ? '#fff' : COLORS.purple600} />}
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: solid ? '#fff' : COLORS.purple600 }}>{label}</Text>
    </PressableScale>
  )
}

/** Earlier chats, newest first: search, open, delete. */
export function ChatsSheet({ visible, onClose, currentId, onOpen, onNew, onDeleted }: {
  visible: boolean; onClose: () => void; currentId: string; onOpen: (id: string) => void; onNew: () => void; onDeleted: (id: string) => void
}) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const { data, isLoading, error } = useQuery({ queryKey: ['assistant-chats'], queryFn: assistantApi.chats, enabled: visible })
  const shown = useMemo(() => (data || []).filter((c) => !q.trim() || c.title.toLowerCase().includes(q.trim().toLowerCase())), [data, q])

  function remove(id: string, title: string) {
    confirmAction('Delete this chat?', title, 'Delete', async () => {
      try { await assistantApi.deleteChat(id); onDeleted(id) } catch (e) { notify('Could not delete it', apiError(e)) }
      qc.invalidateQueries({ queryKey: ['assistant-chats'] })
    }, { destructive: true })
  }

  return (
    <Sheet visible={visible} title="Chats" subtitle="Your chats with the AI — the same on the web." onClose={onClose}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6, marginBottom: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, paddingHorizontal: 12, height: 42 }}>
          <Ionicons name="search" size={15} color={COLORS.ink4} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search chats" placeholderTextColor={COLORS.faint}
            style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.ink }} />
        </View>
        <Pill label="New" icon="add" tone="solid" onPress={() => { onNew(); onClose() }} />
      </View>
      {isLoading && <ActivityIndicator color={COLORS.brand} style={{ marginTop: 16 }} />}
      {!!error && <Text style={[muted, { color: COLORS.danger }]}>{apiError(error)}</Text>}
      {data && !shown.length && <Text style={[muted, { marginTop: 12 }]}>{q ? 'No chat matches that.' : 'No earlier chats.'}</Text>}
      {shown.map((c) => (
        <View key={c.id} style={[rowStyle, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Pressable onPress={() => { onOpen(c.id); onClose() }} style={{ flex: 1, paddingVertical: 2 }}>
            <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyBold, fontSize: 14.5, color: c.id === currentId ? COLORS.purple600 : COLORS.ink }}>
              {c.title || 'Chat'}
            </Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>{when(c.updatedAt)}{c.id === currentId ? ' · open now' : ''}</Text>
          </Pressable>
          <Pressable onPress={() => remove(c.id, c.title)} hitSlop={10} accessibilityLabel="Delete this chat" style={{ padding: 6 }}>
            <Ionicons name="trash-outline" size={17} color={COLORS.ink3} />
          </Pressable>
        </View>
      ))}
    </Sheet>
  )
}

/** What it has been taught — the same list it reads before every answer. */
export function LearnedSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['assistant-memories'], queryFn: assistantApi.memories, enabled: visible })
  const [text, setText] = useState('')
  const [scope, setScope] = useState<'company' | 'personal'>('company')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['assistant-memories'] })

  async function add() {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try { await assistantApi.addMemory(text, data?.canTeachCompany ? scope : 'personal'); setText(''); refresh() } catch (e) { setErr(apiError(e)) } finally { setBusy(false) }
  }
  function remove(id: string) {
    confirmAction('Forget this?', undefined, 'Forget', async () => {
      try { await assistantApi.deleteMemory(id); refresh() } catch (e) { setErr(apiError(e)) }
    }, { destructive: true })
  }

  return (
    <Sheet visible={visible} title="Learned" subtitle="It follows these in every chat. Say “remember…” in the chat, or add one here." onClose={onClose}>
      {isLoading && <ActivityIndicator color={COLORS.brand} style={{ marginTop: 16 }} />}
      {data && !data.memories.length && <Text style={[muted, { marginTop: 10 }]}>Nothing taught yet.</Text>}
      {data?.memories.map((m) => (
        <View key={m.id} style={[rowStyle, { flexDirection: 'row', gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.body, fontSize: 14, lineHeight: 20, color: COLORS.ink }}>{m.text}</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink3, marginTop: 2 }}>{m.scope === 'company' ? 'Everyone' : 'Only you'}{m.by ? ` · ${m.by}` : ''}</Text>
          </View>
          {(m.mine || data.canTeachCompany) && (
            <Pressable onPress={() => remove(m.id)} hitSlop={10} accessibilityLabel="Forget this" style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={17} color={COLORS.ink3} />
            </Pressable>
          )}
        </View>
      ))}
      <View style={{ marginTop: 12, gap: 8 }}>
        <TextInput value={text} onChangeText={setText} multiline placeholder="e.g. Long-stay offer: 20% off the first 4 weeks, then 10%" placeholderTextColor={COLORS.faint}
          style={{ minHeight: 70, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: '#fff', padding: 12, textAlignVertical: 'top', fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {data?.canTeachCompany && (
            <>
              <Pill label="For everyone" tone={scope === 'company' ? 'solid' : 'light'} onPress={() => setScope('company')} />
              <Pill label="Only me" tone={scope === 'personal' ? 'solid' : 'light'} onPress={() => setScope('personal')} />
            </>
          )}
          <View style={{ flex: 1 }} />
          <Pill label={busy ? 'Saving…' : 'Teach it'} tone="solid" onPress={add} disabled={busy || !text.trim()} />
        </View>
        {!!err && <Text style={[muted, { color: COLORS.danger }]}>{err}</Text>}
      </View>
    </Sheet>
  )
}

/** Claude skills the assistant follows when a question fits one. Admins import and switch them. */
export function SkillsSheet({ visible, onClose, admin }: { visible: boolean; onClose: () => void; admin: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['assistant-skills'], queryFn: assistantApi.skills, enabled: visible })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['assistant-skills'] })

  async function importOne() {
    setErr('')
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
    if (picked.canceled || !picked.assets?.[0]) return
    const f = picked.assets[0]
    if (!/\.(md|markdown|txt|zip|skill)$/i.test(f.name)) { setErr('Choose a SKILL.md, .zip or .skill file.'); return }
    setBusy(true)
    try { await assistantApi.importSkill({ uri: f.uri, name: f.name, mimeType: f.mimeType }); refresh() } catch (e) { setErr(apiError(e)) } finally { setBusy(false) }
  }
  async function toggle(id: string, enabled: boolean) {
    try { await assistantApi.setSkill(id, !enabled); refresh() } catch (e) { setErr(apiError(e)) }
  }
  function remove(id: string, name: string) {
    confirmAction(`Remove the skill "${name}"?`, undefined, 'Remove', async () => {
      try { await assistantApi.deleteSkill(id); refresh() } catch (e) { setErr(apiError(e)) }
    }, { destructive: true })
  }

  return (
    <Sheet visible={visible} title="Skills" subtitle="Claude skills the assistant follows when a question fits one." onClose={onClose}>
      {isLoading && <ActivityIndicator color={COLORS.brand} style={{ marginTop: 16 }} />}
      {data && !data.length && <Text style={[muted, { marginTop: 10 }]}>No skills yet.</Text>}
      {data?.map((s) => (
        <View key={s.id} style={[rowStyle, { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: s.enabled ? COLORS.ink : COLORS.ink3 }}>{s.name}</Text>
            <Text numberOfLines={2} style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>{s.description || 'No description'}</Text>
            {s.files > 0 && <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink3 }}>+ {s.files} reference file{s.files === 1 ? '' : 's'}</Text>}
          </View>
          {admin && (
            <>
              <Pill label={s.enabled ? 'On' : 'Off'} tone={s.enabled ? 'solid' : 'light'} onPress={() => toggle(s.id, s.enabled)} />
              <Pressable onPress={() => remove(s.id, s.name)} hitSlop={10} accessibilityLabel={`Remove ${s.name}`} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={17} color={COLORS.ink3} />
              </Pressable>
            </>
          )}
        </View>
      ))}
      {admin && (
        <View style={{ marginTop: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row' }}>
            <Pill label={busy ? 'Importing…' : 'Import a skill'} icon="cloud-upload-outline" tone="solid" onPress={importOne} disabled={busy} />
          </View>
          <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>SKILL.md, or the skill folder as .zip / .skill</Text>
        </View>
      )}
      {!!err && <Text style={[muted, { color: COLORS.danger, marginTop: 6 }]}>{err}</Text>}
    </Sheet>
  )
}

const STATUS: Record<DevRequestRow['status'], string> = { open: 'Open', in_progress: 'Being built', done: 'Done', wont_do: "Won't do" }

function CopyPill({ text, label = 'Copy prompt' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Pill label={done ? 'Copied' : label} icon={done ? 'checkmark' : 'copy-outline'} tone="solid"
      onPress={async () => { await Clipboard.setStringAsync(text); setDone(true); setTimeout(() => setDone(false), 1500) }} />
  )
}

/** Everything the Ask box could not do yet — most asked first, each with its prompt. */
export function DevRequestsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['dev-requests'], queryFn: assistantApi.devRequests, enabled: visible })
  const [err, setErr] = useState('')
  const [statusFor, setStatusFor] = useState<DevRequestRow | null>(null)
  async function setStatus(id: string, status: DevRequestRow['status']) {
    try { await assistantApi.setDevRequest(id, status); qc.invalidateQueries({ queryKey: ['dev-requests'] }) } catch (e) { setErr(apiError(e)) }
  }
  return (
    <Sheet visible={visible} title="To build" subtitle="What the Ask box could not do yet — copy a prompt for the developer; mark it done once built." onClose={onClose}>
      {isLoading && <ActivityIndicator color={COLORS.brand} style={{ marginTop: 16 }} />}
      {data && !data.length && <Text style={[muted, { marginTop: 10 }]}>Nothing yet.</Text>}
      {data?.map((r) => (
        <View key={r.id} style={[rowStyle, { opacity: r.status === 'done' || r.status === 'wont_do' ? 0.55 : 1 }]}>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink }}>{r.title}</Text>
          <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>
            “{r.asked}” · asked {r.count}×{r.lastAskedBy ? ` · last by ${r.lastAskedBy}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <CopyPill text={r.prompt} label="Copy" />
            <Pill label={`${STATUS[r.status]} ▾`} onPress={() => setStatusFor(r)} />
          </View>
        </View>
      ))}
      {!!err && <Text style={[muted, { color: COLORS.danger }]}>{err}</Text>}
      <PickerSheet
        visible={!!statusFor}
        title="Status"
        options={Object.entries(STATUS).map(([value, label]) => ({ value: value as DevRequestRow['status'], label }))}
        selected={statusFor?.status}
        onSelect={(v) => statusFor && setStatus(statusFor.id, v)}
        onClose={() => setStatusFor(null)}
      />
    </Sheet>
  )
}

/** Cards set to run later: when, what, and Cancel while it is still waiting. */
export function ScheduledSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['assistant-scheduled-all'], queryFn: assistantApi.scheduled, enabled: visible })
  const [err, setErr] = useState('')
  function cancel(id: string) {
    confirmAction('Cancel this?', 'It will not run.', 'Cancel it', async () => {
      try { await assistantApi.cancelScheduled(id) } catch (e) { setErr(apiError(e)) }
      qc.invalidateQueries({ queryKey: ['assistant-scheduled-all'] })
      qc.invalidateQueries({ queryKey: ['assistant-scheduled'] })
    }, { destructive: true, cancelLabel: 'Keep it' })
  }
  return (
    <Sheet visible={visible} title="Scheduled" subtitle="Cards set to run later. Cancel one before it runs." onClose={onClose}>
      {isLoading && <ActivityIndicator color={COLORS.brand} style={{ marginTop: 16 }} />}
      {data && !data.length && <Text style={[muted, { marginTop: 10 }]}>Nothing scheduled. Ask it to do something “tomorrow at 9” to schedule a card.</Text>}
      {data?.map((s) => (
        <View key={s.id} style={[rowStyle, { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }]}>
          <Ionicons name={s.status === 'scheduled' ? 'time-outline' : s.status === 'done' ? 'checkmark-circle-outline' : 'close-circle-outline'} size={18} color={COLORS.purple600} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink2 }}>
              {new Date(s.runAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })} · {s.status}
            </Text>
            {(s.summary || []).map((l, i) => <Text key={i} style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink }}>• {l}</Text>)}
            {!!s.result && <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3, marginTop: 2 }}>{s.result}</Text>}
          </View>
          {s.status === 'scheduled' && (
            <Pressable onPress={() => cancel(s.id)} hitSlop={10} accessibilityLabel="Cancel this" style={{ padding: 4 }}>
              <Ionicons name="close" size={19} color={COLORS.ink3} />
            </Pressable>
          )}
        </View>
      ))}
      {!!err && <Text style={[muted, { color: COLORS.danger }]}>{err}</Text>}
    </Sheet>
  )
}

/** Under an answer it could not give: the developer's prompt, ready to copy and share. */
export function DevRequestCard({ req }: { req: DevRequest }) {
  const [open, setOpen] = useState(false)
  return (
    <View style={{ marginTop: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.purple600, borderRadius: 12, padding: 12, backgroundColor: '#FBF9FF' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="construct-outline" size={15} color={COLORS.purple600} />
        <Text style={{ flex: 1, fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink }}>Needs a developer: {req.title}</Text>
      </View>
      <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3, marginVertical: 6 }}>
        Saved in To build{req.count > 1 ? ` · asked ${req.count} times` : ''}. Share this prompt with the developer to add it to the Ask box.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <CopyPill text={req.prompt} />
        <Pill label={open ? 'Hide prompt' : 'Show prompt'} onPress={() => setOpen((v) => !v)} />
      </View>
      {open && (
        <Text selectable style={{ marginTop: 10, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 18, color: COLORS.ink, backgroundColor: '#fff', borderRadius: 8, padding: 10 }}>
          {req.prompt}
        </Text>
      )}
    </View>
  )
}

export { Pill }
