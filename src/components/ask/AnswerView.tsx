import { useState } from 'react'
import { View, Text, Pressable, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { COLORS, FONTS } from '../../lib/theme'
import {
  assistantApi, assistantLinkRoute, toolLabel, webUrlFor, WEB_APP_URL,
  type Answer, type AssistantLink, type AssistantPending, type Compose, type PreviewMessage,
} from '../../lib/assistant'
import { api, apiError } from '../../lib/api'
import { confirmAction, notify } from '../../lib/alert'
import { openApiFile } from '../../lib/files'
import { speakText, stopSpeaking } from '../../lib/speech'
import PressableScale from '../PressableScale'
import RichText from './RichText'
import ChartView from './ChartView'
import AskForm from './AskForm'
import DataCard from './DataCards'
import { DevRequestCard } from './AskSheets'

export type Decide = (go: boolean, id: string) => Promise<string | null>

function Btn({ label, onPress, icon, kind = 'soft', disabled, grow }: {
  label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap
  kind?: 'solid' | 'soft' | 'outline' | 'excel'; disabled?: boolean; grow?: boolean
}) {
  const bg = kind === 'solid' ? COLORS.purple600 : kind === 'excel' ? '#107C41' : kind === 'soft' ? COLORS.purple100 : '#fff'
  const fg = kind === 'solid' || kind === 'excel' ? '#fff' : kind === 'soft' ? COLORS.purple700 : COLORS.ink3
  return (
    <PressableScale onPress={onPress} disabled={disabled}
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 12,
        backgroundColor: bg, borderWidth: kind === 'outline' ? 1 : 0, borderColor: COLORS.line, opacity: disabled ? 0.5 : 1,
        ...(grow ? { flex: 1 } : null),
      }}>
      {icon && <Ionicons name={icon} size={15} color={fg} />}
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13.5, color: fg }}>{label}</Text>
    </PressableScale>
  )
}

const expired = (c: AssistantPending, now: number) => !!c.expiresAt && Date.parse(c.expiresAt) < now
const composeCount = (c: Compose) => (c.kind === 'email_customers' ? c.customerIds?.length ?? 0 : c.contracts?.length ?? 0)

/**
 * One answer in the chat — the web's AnswerView. Only the latest is live: its
 * form, answer buttons and "Prepare it again" can be used; earlier ones read
 * as what was said. Cards stay usable wherever they are until decided.
 */
export default function AnswerView({ answer, live, busy, acting, onAsk, onDecide, onNavigate, superseded }: {
  answer: Answer
  live: boolean
  busy: boolean
  acting: boolean
  onAsk: (text: string, extra?: { eid?: string }) => void
  onDecide: Decide
  /** Called before a link opens a screen — the Ask sheet closes itself. */
  onNavigate?: () => void
  /** Cards a later card in the chat redid (same kind, same person): not confirmable. */
  superseded?: Set<string>
}) {
  const router = useRouter()
  // When this answer was drawn — a card past its time shows as expired.
  const [now] = useState(() => Date.now())
  const open = answer.pendings.filter((c) => !expired(c, now) && !superseded?.has(c.id))

  function openLink(l: AssistantLink) {
    const route = assistantLinkRoute(l)
    if (route) { onNavigate?.(); router.push(route); return }
    void Linking.openURL(webUrlFor(l.path))
  }
  async function file(path: string, kind: 'pdf' | 'excel', label: string) {
    try { await openApiFile(path, { kind, label }) } catch (e) { notify('Could not open it', (e as Error).message) }
  }
  function confirmAll() {
    confirmAction(`Do all ${open.length}?`, 'Read them first — each one goes as written.', `Confirm all ${open.length}`, async () => {
      for (const c of open) await onDecide(true, c.id)
    })
  }

  return (
    <View>
      <RichText text={answer.content} color={answer.grounded === false ? '#6B4500' : COLORS.ink} />

      {answer.card && <DataCard card={answer.card} />}
      {answer.charts.map((c, i) => <ChartView key={i} chart={c} />)}

      {live && answer.setup === 'twilio' && (
        <View style={{ marginTop: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 12, gap: 8 }}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink2 }}>Text messages need Twilio connected once — do it in Settings on the web app.</Text>
          <View style={{ flexDirection: 'row' }}><Btn label="Open the web app" icon="open-outline" onPress={() => { void Linking.openURL(`${WEB_APP_URL}/settings`) }} /></View>
        </View>
      )}

      {answer.devRequest && <DevRequestCard req={answer.devRequest} />}

      {answer.form && !answer.pendings.length && (live ? (
        <AskForm key={answer.content + answer.form.fields.map((f) => f.key).join()} form={answer.form} busy={busy} onSubmit={onAsk} />
      ) : (
        <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3, marginTop: 6 }}>
          Form: {answer.form.title || answer.form.fields.map((f) => f.label).slice(0, 4).join(', ')}
        </Text>
      ))}

      {answer.sources.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink4, marginBottom: 6 }}>From the web</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {answer.sources.map((s) => (
              <Pressable key={s.url} onPress={() => { void Linking.openURL(s.url) }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 260, borderWidth: 1, borderColor: COLORS.purple200, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#fff' }}>
                <Ionicons name="globe-outline" size={12} color={COLORS.purple700} />
                <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.purple700, flexShrink: 1 }}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {live && answer.options.length > 0 && !answer.pendings.length && !answer.form && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {answer.options.map((o) => (
            <PressableScale key={o} onPress={() => onAsk(o)} disabled={busy}
              style={{ backgroundColor: COLORS.purple600, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: '#fff' }}>{o}</Text>
            </PressableScale>
          ))}
        </View>
      )}

      {open.length > 1 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <Btn label={`Confirm all ${open.length}`} kind="solid" icon="checkmark-done" disabled={acting} onPress={confirmAll} />
          <Text style={{ flex: 1, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>or go one by one below.</Text>
        </View>
      )}
      {answer.pendings.map((card, k, all) => (superseded?.has(card.id) ? (
        <View key={card.id} style={{ marginTop: 12, backgroundColor: '#FAFAFA', borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.line, borderRadius: 14, padding: 14 }}>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink3, marginBottom: 6 }}>Replaced by the newer card below — nothing was done</Text>
          {card.summary.slice(0, 3).map((line, n) => <Text key={n} style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink4, lineHeight: 19 }}>• {line}</Text>)}
        </View>
      ) : expired(card, now) ? (
        <View key={card.id} style={{ marginTop: 12, backgroundColor: '#FAFAFA', borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.line, borderRadius: 14, padding: 14 }}>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14.5, color: COLORS.ink3, marginBottom: 6 }}>This card has expired — nothing was done</Text>
          {card.summary.slice(0, 3).map((line, n) => <Text key={n} style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink3, lineHeight: 20 }}>• {line}</Text>)}
          {live && (
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <Btn label="Prepare it again" kind="solid" onPress={() => onAsk(`Prepare that again: ${card.summary[0] || ''}`)} />
            </View>
          )}
        </View>
      ) : (
        <View key={card.id} style={{ marginTop: 12, backgroundColor: COLORS.purple50, borderWidth: 1, borderColor: COLORS.purple200, borderRadius: 14, padding: 14 }}>
          <Text style={{ fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink, marginBottom: 8 }}>
            {all.length > 1 ? `Do this? (${k + 1} of ${all.length})` : 'Do this?'}
          </Text>
          <View style={{ gap: 3 }}>
            {card.summary.map((line, n) => (
              <View key={n} style={{ flexDirection: 'row' }}>
                <Text style={{ width: 14, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink2, lineHeight: 21 }}>•</Text>
                <Text style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink2, lineHeight: 21 }}>{line}</Text>
              </View>
            ))}
          </View>
          <CardPreview card={card} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Btn label={acting ? 'Doing it…' : 'Confirm'} kind="solid" grow disabled={acting} onPress={() => { void onDecide(true, card.id) }} />
            <Btn label="Cancel" kind="outline" grow disabled={acting} onPress={() => { void onDecide(false, card.id) }} />
          </View>
          <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3, marginTop: 10 }}>Nothing is created or sent until you confirm.</Text>
        </View>
      )))}
      {answer.pendings.length > 0 && !!answer.next && (
        <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3, marginTop: 8 }}>After that: {answer.next}</Text>
      )}
      {live && !answer.pendings.length && !!answer.next && (
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <Btn label={`Next: ${answer.next} →`} kind="solid" disabled={busy} onPress={() => onAsk(`Carry on: ${answer.next}`)} />
        </View>
      )}

      {/* A message to a whole group is written in the web app's composer
          (template, personalising, who is in it) — handed over there. */}
      {!!answer.compose && composeCount(answer.compose) > 0 && (
        <View style={{ marginTop: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row' }}>
            <Btn
              label={`${answer.compose.kind === 'email_customers' ? 'Email' : 'WhatsApp'} ${composeCount(answer.compose)} ${composeCount(answer.compose) === 1 ? 'person' : 'people'} on the web ↗`}
              icon={answer.compose.kind === 'email_customers' ? 'mail-outline' : 'logo-whatsapp'}
              onPress={() => { void Linking.openURL(`${WEB_APP_URL}/customers`) }}
            />
          </View>
          <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>
            The group composer is on the web app. To message people from here, ask it to prepare the messages as a card.
          </Text>
        </View>
      )}

      {answer.files.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {answer.files.map((f) => (
            <Btn key={f.path} label={f.label} kind={f.format === 'pdf' ? 'solid' : 'excel'} icon={f.format === 'pdf' ? 'document-text-outline' : 'grid-outline'}
              onPress={() => { void file(f.path, f.format, f.label) }} />
          ))}
        </View>
      )}

      {answer.links.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {answer.links.map((l) => (
            <Btn key={l.path} label={`${l.label} ${assistantLinkRoute(l) ? '→' : '↗'}`} onPress={() => openLink(l)} />
          ))}
        </View>
      )}

      {!!answer.pdfPath && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {answer.contractId ? (
            <Btn label="Open the contract ↗" kind="solid" onPress={() => { void Linking.openURL(`${WEB_APP_URL}/contracts/${answer.contractId}`) }} />
          ) : answer.quoteId ? (
            <Btn label="Open the quotation ↗" kind="solid" onPress={() => { void Linking.openURL(`${WEB_APP_URL}/quotes/new?quote=${answer.quoteId}`) }} />
          ) : null}
          <Btn label={answer.contractId ? 'Contract PDF' : answer.quoteId ? 'Quotation PDF' : 'Open the PDF'} icon="document-text-outline"
            onPress={() => { void file(answer.pdfPath!, 'pdf', answer.contractId ? 'contract' : answer.quoteId ? 'quotation' : 'document') }} />
        </View>
      )}
      {!!answer.contractId && <SendToSign contractId={answer.contractId} />}

      {/* Where it looked. A figure nobody can trace is a figure nobody should act on. */}
      {answer.tools.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          {[...new Set(answer.tools.map((t) => toolLabel(t.name)))].map((label) => (
            <View key={label} style={{ backgroundColor: COLORS.purple100, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.purple700 }}>{label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

/**
 * See it before it goes: the quotation PDF, the agreement, the notice or the
 * messages this card would send — drawn now, nothing saved or sent.
 */
function CardPreview({ card }: { card: AssistantPending }) {
  const [msgs, setMsgs] = useState<PreviewMessage[] | null>(null)
  const [loading, setLoading] = useState('')
  const [err, setErr] = useState('')
  const base = `/assistant/proposals/${card.id}/preview`
  const docs: { label: string; doc: string }[] =
    card.kind === 'create_quotation' ? [{ label: 'Preview quotation', doc: 'quote' }]
      : card.kind === 'create_contract' ? [{ label: 'Preview quotation', doc: 'quote' }, { label: 'Preview agreement', doc: 'agreement' }]
        : card.kind === 'serve_notices' ? [{ label: 'Preview notice', doc: 'notice' }]
          : []
  const messages = card.kind === 'send_to_clients'
  if (!docs.length && !messages) return null

  async function pdf(doc: string, label: string) {
    setErr(''); setLoading(doc)
    try { await openApiFile(`${base}?doc=${doc}`, { kind: 'pdf', label }) } catch (e) { setErr((e as Error).message) } finally { setLoading('') }
  }
  async function showMessages() {
    if (msgs) { setMsgs(null); return }
    setErr(''); setLoading('messages')
    try { setMsgs(await assistantApi.previewMessages(card.id)) } catch (e) { setErr(apiError(e)) } finally { setLoading('') }
  }

  return (
    <View style={{ marginTop: 12, gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {docs.map((d) => (
          <Btn key={d.doc} label={loading === d.doc ? 'Opening…' : d.label} kind="outline" icon="eye-outline" disabled={!!loading} onPress={() => { void pdf(d.doc, d.label) }} />
        ))}
        {messages && (
          <Btn label={loading === 'messages' ? 'Loading…' : msgs ? 'Hide messages' : 'Preview messages'} kind="outline" icon="eye-outline" disabled={!!loading} onPress={() => { void showMessages() }} />
        )}
      </View>
      <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink3 }}>Exactly what the client gets — nothing is saved yet.</Text>
      {msgs && (
        <View style={{ gap: 6 }}>
          {msgs.map((m, i) => (
            <View key={i} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, padding: 10 }}>
              <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink3, marginBottom: 2 }}>{m.name}{m.to ? ` · ${m.to}` : ''}{m.subject ? ` · ${m.subject}` : ''}</Text>
              <Text selectable style={{ fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 19, color: COLORS.ink }}>{m.text}</Text>
            </View>
          ))}
        </View>
      )}
      {!!err && <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.danger }}>{err}</Text>}
    </View>
  )
}

/**
 * Send a new contract to the tenant to sign, right under the answer that made
 * it. Email carries the PDF and the signing link; WhatsApp the PDF with the
 * link (inside the 24-hour window, otherwise a ready-to-send WhatsApp link).
 */
function SendToSign({ contractId }: { contractId: string }) {
  const [busy, setBusy] = useState('')
  const [out, setOut] = useState<{ text: string; url?: string; wa?: string } | null>(null)
  const [err, setErr] = useState('')
  async function preview() {
    setErr('')
    try { await openApiFile(`/contracts/${contractId}/pdf`, { kind: 'pdf', label: 'contract' }) } catch (e) { setErr((e as Error).message) }
  }
  async function send(via: 'email' | 'whatsapp' | 'link') {
    setBusy(via); setErr(''); setOut(null)
    try {
      const { data } = await api.post<{ signingUrl: string; sent: boolean; reason?: string; waLink?: string; to?: string }>(`/contracts/${contractId}/send-signing-link`, { via })
      if (via === 'link') { await Clipboard.setStringAsync(data.signingUrl); setOut({ text: 'Signing link copied — it works for 7 days.', url: data.signingUrl }) }
      else if (data.sent) setOut({ text: `Sent for signing ${via === 'email' ? `by email to ${data.to} — the PDF attached and the link` : `on WhatsApp to ${data.to} — the PDF with the link`}.`, url: data.signingUrl })
      else setOut({ text: data.reason || 'Not sent.', url: data.signingUrl, wa: data.waLink })
    } catch (e) { setErr(apiError(e)) } finally { setBusy('') }
  }
  function ask(via: 'email' | 'whatsapp') {
    confirmAction('Send the contract to sign?',
      via === 'email' ? 'By email — the PDF attached and the signing link.' : 'On WhatsApp — the PDF with the signing link.',
      'Send', () => { void send(via) })
  }
  return (
    <View style={{ marginTop: 12, backgroundColor: COLORS.purple50, borderWidth: 1, borderColor: COLORS.purple200, borderRadius: 14, padding: 12, gap: 8 }}>
      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14.5, color: COLORS.ink }}>Send it to sign</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Btn label="Preview contract" kind="outline" icon="eye-outline" onPress={() => { void preview() }} />
        <Btn label={busy === 'email' ? 'Sending…' : 'By email'} icon="mail-outline" disabled={!!busy} onPress={() => ask('email')} />
        <Btn label={busy === 'whatsapp' ? 'Sending…' : 'On WhatsApp'} icon="logo-whatsapp" disabled={!!busy} onPress={() => ask('whatsapp')} />
        <Btn label="Copy signing link" icon="link-outline" disabled={!!busy} onPress={() => { void send('link') }} />
      </View>
      {out && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink }}>{out.text}</Text>
          {!!out.wa && <View style={{ flexDirection: 'row' }}><Btn label="Open WhatsApp with the message" icon="logo-whatsapp" onPress={() => { void Linking.openURL(out.wa!) }} /></View>}
        </View>
      )}
      {!!err && <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.danger }}>{err}</Text>}
    </View>
  )
}

/** Under every answer: copy it, hear it read out, and — on the latest — ask the same question again. */
export function AnswerActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const plain = text.replace(/\*\*/g, '').replace(/^#{1,4}\s+/gm, '')
  async function copy() {
    await Clipboard.setStringAsync(plain)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  function speak() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return }
    if (speakText(plain, () => setSpeaking(false))) setSpeaking(true)
  }
  const b = { width: 38, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10 } as const
  return (
    <View style={{ flexDirection: 'row', marginTop: 6, marginLeft: -8 }}>
      <Pressable onPress={() => { void copy() }} style={b} accessibilityLabel="Copy the answer" hitSlop={4}>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={17} color={COLORS.ink3} />
      </Pressable>
      <Pressable onPress={speak} style={b} accessibilityLabel={speaking ? 'Stop reading' : 'Read the answer aloud'} hitSlop={4}>
        <Ionicons name={speaking ? 'stop-circle-outline' : 'volume-medium-outline'} size={18} color={speaking ? COLORS.purple600 : COLORS.ink3} />
      </Pressable>
      {onRetry && (
        <Pressable onPress={onRetry} style={b} accessibilityLabel="Ask the same question again" hitSlop={4}>
          <Ionicons name="refresh" size={17} color={COLORS.ink3} />
        </Pressable>
      )}
    </View>
  )
}
