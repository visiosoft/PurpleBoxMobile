import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { COLORS, FONTS, SHADOWS } from '../lib/theme'
import PressableScale from './PressableScale'
import {
  toolLabel, assistantLinkRoute,
  type AssistantAskResponse, type AssistantLink,
  type InventoryCardData, type ContactsCardData, type PriceCardData,
} from '../lib/assistant'
import { notify } from '../lib/alert'

const money = (n: number) => `AED ${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

function InventoryCard({ data }: { data: InventoryCardData }) {
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, backgroundColor: COLORS.brandTint, borderRadius: 12, padding: 12, alignItems: 'center' }}>
          <Text style={{ fontFamily: FONTS.display, fontSize: 24, color: COLORS.brandDark }}>{data.count}</Text>
          <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: COLORS.brandDark, marginTop: 2 }}>Available</Text>
        </View>
        {Object.entries(data.bySize).slice(0, 2).map(([size, n]) => (
          <View key={size} style={{ flex: 1, backgroundColor: COLORS.control, borderRadius: 12, padding: 12, alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink }}>{n}</Text>
            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: COLORS.ink3, marginTop: 2 }}>{size} sq ft</Text>
          </View>
        ))}
      </View>
      {!!data.units.length && (
        <View style={{ marginTop: 10, gap: 6 }}>
          {data.units.slice(0, 5).map((u) => (
            <View key={u.unitNumber} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink }}>{u.unitNumber} · {u.sizeSqf} sq ft · Floor {u.floor}</Text>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.brandDark }}>{money(u.monthlyPrice)}/mo</Text>
            </View>
          ))}
          {data.truncated && <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink3 }}>+ more — ask for a specific size to narrow it down</Text>}
        </View>
      )}
    </View>
  )
}

function ContactsCard({ data }: { data: ContactsCardData }) {
  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      {data.people.slice(0, 6).map((p, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.control, borderRadius: 12, padding: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.brandTint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.brandDark }}>{(p.name || '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13.5, color: COLORS.ink }}>{p.name}</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink3 }}>
              {p.kind === 'customer' ? 'Tenant' : 'Lead'}{p.phone ? ` · ${p.phone}` : ''}{p.status ? ` · ${toolLabel(p.status)}` : ''}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function PriceCard({ data }: { data: PriceCardData }) {
  return (
    <View style={{ marginTop: 12, backgroundColor: COLORS.control, borderRadius: 12, padding: 12 }}>
      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink }}>
        {data.unit.unitNumber} · {data.unit.sizeSqf} sq ft · {data.period.weeks} week{data.period.weeks === 1 ? '' : 's'}
      </Text>
      <View style={{ marginTop: 8, gap: 4 }}>
        {data.lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>{l.title}</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>{money(l.amount)}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.line }}>
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink }}>Total</Text>
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.brandDark }}>{money(data.total)}</Text>
      </View>
    </View>
  )
}

/**
 * The command bar's answer, as a standalone card rather than a chat bubble —
 * this is BayOps' "results replace the feed" idea (see home.tsx), so the
 * card needs to stand on its own with nothing above or below it implying a
 * conversation. Same pending/Confirm/Cancel logic as assistant.tsx's
 * ChatBubble (the full-screen "Assistant" tab) — same assistant, same rules,
 * just a different frame around it.
 */
export default function AssistantResultCard({
  result,
  busyLabel,
  confirmBusy,
  onConfirm,
  onCancel,
}: {
  result: AssistantAskResponse | null
  busyLabel?: string | null
  confirmBusy: boolean
  onConfirm: (id: string) => void
  onCancel: (id: string) => void
}) {
  const router = useRouter()

  if (busyLabel) {
    return (
      <View style={{ borderRadius: 18, backgroundColor: '#fff', padding: 20, alignItems: 'center', gap: 10, ...SHADOWS.card }}>
        <ActivityIndicator color={COLORS.brand} />
        <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink3 }}>{busyLabel}</Text>
      </View>
    )
  }
  if (!result) return null

  function openLink(link: AssistantLink) {
    const route = assistantLinkRoute(link)
    if (route) { router.push(route); return }
    notify(link.label, 'Open this on the web app to view it.')
  }

  return (
    <View
      style={{
        borderRadius: 18,
        backgroundColor: result.grounded === false ? '#FFF7E6' : '#fff',
        padding: 16,
        ...SHADOWS.card,
      }}
    >
      <Text style={{ fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.ink, lineHeight: 21 }}>{result.answer}</Text>

      {result.card?.type === 'inventory' && <InventoryCard data={result.card.data} />}
      {result.card?.type === 'contacts' && <ContactsCard data={result.card.data} />}
      {result.card?.type === 'price' && <PriceCard data={result.card.data} />}

      {!!result.tools?.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {result.tools.map((t, i) => (
            <View key={i} style={{ backgroundColor: COLORS.brandTint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={t.ok ? 'checkmark-circle' : 'alert-circle'} size={11} color={COLORS.brandDark} />
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: COLORS.brandDark }}>{toolLabel(t.name)}</Text>
            </View>
          ))}
        </View>
      )}

      {!!result.links?.length && (
        <View style={{ gap: 8, marginTop: 12 }}>
          {result.links.map((l, i) => (
            <Pressable key={i} onPress={() => openLink(l)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="arrow-forward-circle-outline" size={16} color={COLORS.brand} />
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13.5, color: COLORS.brand }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {result.pending && (
        <View style={{ marginTop: 14, backgroundColor: COLORS.brandTint, borderRadius: 12, padding: 12, gap: 8 }}>
          {result.pending.summary.map((line, i) => (
            <Text key={i} style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>• {line}</Text>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <PressableScale
              disabled={confirmBusy}
              onPress={() => onConfirm(result.pending!.id)}
              style={{ flex: 1, backgroundColor: COLORS.brand, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: '#fff' }}>Confirm</Text>
            </PressableScale>
            <PressableScale
              disabled={confirmBusy}
              onPress={() => onCancel(result.pending!.id)}
              style={{ flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink3 }}>Cancel</Text>
            </PressableScale>
          </View>
        </View>
      )}
    </View>
  )
}
