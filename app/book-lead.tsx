import { useEffect, useState } from 'react'
import { View, Text, TextInput, FlatList, ActivityIndicator, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { leadApi } from '../src/lib/leads'
import { statusLabel } from '../src/lib/leadStatus'
import { apiError } from '../src/lib/api'
import { COLORS, FONTS } from '../src/lib/theme'
import PressableScale from '../src/components/PressableScale'
import Avatar from '../src/components/Avatar'

/**
 * Which lead is this booking for? A quotation and a contract are only ever
 * made from a lead, so booking from Home or from a unit starts here. A rep
 * sees their own leads (the server scopes /leads); an admin sees everyone's.
 */
export default function BookLeadScreen() {
  const { unit } = useLocalSearchParams<{ unit?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 350)
    return () => clearTimeout(t)
  }, [text])

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['book-lead-search', search],
    queryFn: () => leadApi.list({ search: search || undefined, limit: 30 }),
    staleTime: 30_000,
  })
  // Closed leads are not booked again from here.
  const leads = (data?.data ?? []).filter((l) => !['lost', 'won', 'already_customer'].includes(l.status))

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
            <Ionicons name="chevron-back" size={24} color={COLORS.ink} />
          </Pressable>
          <View>
            <Text style={{ fontFamily: FONTS.display, fontSize: 21, color: COLORS.ink }}>Book{unit ? ` unit ${unit}` : ' a unit'}</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3 }}>Choose the lead it is for</Text>
          </View>
        </View>
        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, height: 44 }}>
          <Ionicons name="search" size={17} color={COLORS.ink4} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="Name or phone"
            placeholderTextColor={COLORS.ink4}
            style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink }}
          />
          {isFetching && <ActivityIndicator size="small" color={COLORS.purple600} />}
        </View>
      </View>

      {isError ? (
        <Text style={{ padding: 24, textAlign: 'center', fontFamily: FONTS.body, fontSize: 13, color: COLORS.danger }}>{apiError(error)}</Text>
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(l) => l._id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={!isFetching ? (
            <Text style={{ padding: 16, textAlign: 'center', fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3 }}>
              {search ? `No open lead matches “${search}”.` : 'No open leads.'}
            </Text>
          ) : null}
          renderItem={({ item }) => (
            <PressableScale
              onPress={() => router.replace({ pathname: '/book', params: { leadId: item._id, ...(unit ? { unit } : {}) } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.line }}
            >
              <Avatar name={item.fullName} size={40} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink }}>{item.fullName}</Text>
                <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>
                  {[item.phone, statusLabel(item.status), item.storageSizeValue ? `${item.storageSizeValue} sq ft` : ''].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.chevron} />
            </PressableScale>
          )}
        />
      )}
    </View>
  )
}
