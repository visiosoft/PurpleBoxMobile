import { useMemo, useState } from 'react'
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { unitApi, type Unit, type UnitStatus } from '../../src/lib/units'
import { apiError } from '../../src/lib/api'
import { COLORS, FONTS } from '../../src/lib/theme'
import { STATUS_STYLE, statusLabel } from '../../src/components/units/statusStyle'
import UnitDetailSheet from '../../src/components/units/UnitDetailSheet'
import PressableScale from '../../src/components/PressableScale'
import ScreenHeader from '../../src/components/ScreenHeader'

const STATUS_FILTERS: { value: UnitStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'maintenance', label: 'Maintenance' },
]

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function displayDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Any'
}

export default function UnitsScreen() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<UnitStatus | 'all'>('all')
  const [size, setSize] = useState<number | null>(null)
  const [fromDate, setFromDate] = useState<string | null>(null)
  const [toDate, setToDate] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<'from' | 'to' | null>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)

  const datesSet = !!(fromDate && toDate)

  const { data: rawUnits = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['units', datesSet, fromDate, toDate],
    queryFn: () => (datesSet ? unitApi.availableInPeriod(fromDate!, toDate!) : unitApi.list()),
  })

  const sizes = useMemo(() => {
    const set = new Set<number>()
    rawUnits.forEach((u) => { if (u.sizeSqf != null) set.add(u.sizeSqf) })
    return [...set].sort((a, b) => a - b)
  }, [rawUnits])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rawUnits
      .filter((u) => (status === 'all' ? true : u.status === status))
      .filter((u) => (size == null ? true : u.sizeSqf === size))
      .filter((u) => (q ? u.unitNumber.toLowerCase().includes(q) : true))
      .sort((a, b) => (a.floor || '').localeCompare(b.floor || '') || a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }))
  }, [rawUnits, status, size, search])

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <ScreenHeader title="Search Unit" />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 12 }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff',
            borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 12, height: 42,
          }}
        >
          <Ionicons name="search" size={17} color={COLORS.faint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Unit number"
            placeholderTextColor={COLORS.faint}
            style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={COLORS.faint} />
            </Pressable>
          )}
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_FILTERS}
          keyExtractor={(f) => f.value}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const active = status === item.value
            return (
              <PressableScale
                onPress={() => setStatus(item.value)}
                style={{
                  paddingHorizontal: 14, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? COLORS.brand : '#fff', borderWidth: 1.5, borderColor: active ? COLORS.brand : COLORS.chevron,
                }}
              >
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: active ? '#fff' : COLORS.muted }}>{item.label}</Text>
              </PressableScale>
            )
          }}
        />

        {sizes.length > 0 && (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ value: null as number | null, label: 'Any size' }, ...sizes.map((s) => ({ value: s, label: `${s} sqft` }))]}
            keyExtractor={(s) => String(s.value)}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => {
              const active = size === item.value
              return (
                <PressableScale
                  onPress={() => setSize(item.value)}
                  style={{
                    paddingHorizontal: 12, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: active ? COLORS.brandTint : '#fff', borderWidth: 1, borderColor: active ? COLORS.brand : COLORS.line,
                  }}
                >
                  <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: active ? COLORS.brandDark : COLORS.muted }}>{item.label}</Text>
                </PressableScale>
              )
            }}
          />
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="calendar-outline" size={16} color={COLORS.muted} />
          <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.muted }}>Free from</Text>
          <PressableScale onPress={() => setPickerFor('from')} style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink }}>{displayDate(fromDate)}</Text>
          </PressableScale>
          <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.muted }}>to</Text>
          <PressableScale onPress={() => setPickerFor('to')} style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink }}>{displayDate(toDate)}</Text>
          </PressableScale>
          {datesSet && (
            <Pressable onPress={() => { setFromDate(null); setToDate(null) }} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={COLORS.faint} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.bad, textAlign: 'center' }}>{apiError(error)}</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.brand }}>Try again</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="cube-outline" size={40} color={COLORS.faint} />
          <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.muted, marginTop: 10 }}>No units match</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u._id}
          onRefresh={refetch}
          refreshing={isFetching}
          contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 10 }}
          renderItem={({ item }) => <UnitCard unit={item} datesSet={datesSet} onPress={() => setSelectedUnitId(item._id)} />}
        />
      )}

      {pickerFor && (
        <DateTimePicker
          value={(pickerFor === 'from' ? fromDate && new Date(fromDate) : toDate && new Date(toDate)) || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, d) => {
            const which = pickerFor
            setPickerFor(null)
            if (!d) return
            if (which === 'from') setFromDate(toIsoDate(d))
            else setToDate(toIsoDate(d))
          }}
        />
      )}

      <UnitDetailSheet unitId={selectedUnitId} visible={!!selectedUnitId} onClose={() => setSelectedUnitId(null)} />
      </SafeAreaView>
    </View>
  )
}

function UnitCard({ unit, datesSet, onPress }: { unit: Unit; datesSet: boolean; onPress: () => void }) {
  const tone = STATUS_STYLE[unit.status]
  const periodTone = unit.bookedInPeriod ? { bg: COLORS.badBg, fg: COLORS.bad, label: 'Booked in window' } : { bg: COLORS.goodBg, fg: COLORS.good, label: 'Free in window' }
  return (
    <PressableScale onPress={onPress} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: COLORS.brandTint, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.brandDark }}>{unit.floor || '—'}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.ink }}>Unit {unit.unitNumber}</Text>
          {unit.price != null && <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink }}>AED {unit.price.toLocaleString()}/mo</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {unit.sizeSqf != null && <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted }}>{unit.sizeSqf} sqft</Text>}
          <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: tone.fg }}>{statusLabel(unit.status)}</Text>
          </View>
          {datesSet && (
            <View style={{ backgroundColor: periodTone.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: periodTone.fg }}>{periodTone.label}</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.faint} />
    </PressableScale>
  )
}
