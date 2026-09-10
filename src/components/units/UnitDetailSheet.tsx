import { Modal, View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { unitApi } from '../../lib/units'
import { apiError } from '../../lib/api'
import { COLORS, FONTS } from '../../lib/theme'
import { STATUS_STYLE, statusLabel } from './statusStyle'

function formatDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
}

export default function UnitDetailSheet({ unitId, visible, onClose }: { unitId: string | null; visible: boolean; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['unit', unitId],
    queryFn: () => unitApi.get(unitId as string),
    enabled: visible && !!unitId,
  })

  const unit = data?.unit
  const tone = unit ? STATUS_STYLE[unit.status] : null

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
          <Text style={{ fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink }}>{unit ? `Unit ${unit.unitNumber}` : 'Unit'}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={COLORS.muted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {isLoading && <ActivityIndicator color={COLORS.brand} />}
          {!!error && <Text style={{ color: COLORS.bad, fontFamily: FONTS.body }}>{apiError(error)}</Text>}

          {unit && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {tone && (
                  <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: tone.fg }}>{statusLabel(unit.status)}</Text>
                  </View>
                )}
                {unit.shared && (
                  <View style={{ backgroundColor: '#F3F4F6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.muted }}>Shared unit</Text>
                  </View>
                )}
              </View>

              {unit.price != null && (
                <View>
                  <Text style={{ fontFamily: FONTS.display, fontSize: 28, color: COLORS.ink }}>AED {unit.price.toLocaleString()}</Text>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted }}>per month{unit.discountPct ? ` · ${unit.discountPct}% off first 4 weeks` : ''}</Text>
                </View>
              )}

              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>
                <DetailRow label="Floor" value={unit.floor || '—'} />
                <DetailRow label="Size" value={unit.sizeSqf != null ? `${unit.sizeSqf} sq ft` : '—'} />
                <DetailRow label="Dimensions" value={unit.lengthFt && unit.widthFt ? `${unit.lengthFt} × ${unit.widthFt} ft` : '—'} />
                <DetailRow label="Notes" value={unit.notes || '—'} last />
              </View>

              {!!unit.bookings?.length && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: COLORS.muted, letterSpacing: 0.4 }}>BOOKINGS IN THIS WINDOW</Text>
                  {unit.bookings.map((b, i) => (
                    <View key={i} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink }}>{b.customer || b.ref}</Text>
                        <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.muted }}>{formatDate(b.startDate)} – {formatDate(b.endDate)}</Text>
                      </View>
                      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: COLORS.faint, textTransform: 'capitalize' }}>{b.kind}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!!data?.contracts?.length && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: COLORS.muted, letterSpacing: 0.4 }}>RECENT CONTRACTS</Text>
                  {data.contracts.map((c) => (
                    <View key={c._id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink }}>{c.customerName || c.contractNo || 'Contract'}</Text>
                        <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.muted }}>{formatDate(c.startDate)} – {formatDate(c.endDate)}</Text>
                      </View>
                      {!!c.status && <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: COLORS.faint, textTransform: 'capitalize' }}>{c.status}</Text>}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: COLORS.line }}>
      <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.muted }}>{label}</Text>
      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink, flexShrink: 1, textAlign: 'right', marginLeft: 12 }}>{value}</Text>
    </View>
  )
}
