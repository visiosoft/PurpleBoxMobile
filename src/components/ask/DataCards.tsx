import { View, Text } from 'react-native'
import { COLORS, FONTS } from '../../lib/theme'
import { type AssistantCard, type InventoryCardData, type ContactsCardData, type PriceCardData } from '../../lib/assistant'

/* The couple of answers worth a real layout instead of a sentence (the
   server's CARD_TOOLS): free units, people found, a priced booking. */

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
              {p.kind === 'customer' ? 'Tenant' : 'Lead'}{p.phone ? ` · ${p.phone}` : ''}{p.status ? ` · ${p.status.replace(/_/g, ' ')}` : ''}
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

export default function DataCard({ card }: { card: AssistantCard }) {
  if (card.type === 'inventory') return <InventoryCard data={card.data} />
  if (card.type === 'contacts') return <ContactsCard data={card.data} />
  if (card.type === 'price') return <PriceCard data={card.data} />
  return null
}
