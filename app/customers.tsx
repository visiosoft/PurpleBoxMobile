import { useEffect, useState } from 'react'
import { View, Text, TextInput, FlatList, ActivityIndicator, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { staffAppApi } from '../src/lib/staffApp'
import { apiError } from '../src/lib/api'
import { COLORS, FONTS } from '../src/lib/theme'
import PressableScale from '../src/components/PressableScale'
import Avatar from '../src/components/Avatar'

/**
 * Find any tenant or quoted customer by name, phone, email or client id, and
 * open their profile. Leads have their own tab; this is everybody who has
 * gone further than a lead.
 */
export default function CustomersScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')

  // Searched once typing pauses, not on every key.
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 350)
    return () => clearTimeout(t)
  }, [text])

  const { data = [], isFetching, isError, error } = useQuery({
    queryKey: ['customer-search', search],
    queryFn: () => staffAppApi.searchCustomers(search),
    enabled: search.length >= 2,
    staleTime: 30_000,
  })

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
            <Ionicons name="chevron-back" size={24} color={COLORS.ink} />
          </Pressable>
          <Text style={{ fontFamily: FONTS.display, fontSize: 22, color: COLORS.ink }}>Customers</Text>
        </View>
        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, height: 44 }}>
          <Ionicons name="search" size={17} color={COLORS.ink4} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="Name, phone, email or client ID"
            placeholderTextColor={COLORS.ink4}
            style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink }}
          />
          {isFetching && <ActivityIndicator size="small" color={COLORS.purple600} />}
        </View>
      </View>

      {search.length < 2 ? (
        <Text style={{ padding: 24, textAlign: 'center', fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3 }}>
          Type at least two letters or digits.
        </Text>
      ) : isError ? (
        <Text style={{ padding: 24, textAlign: 'center', fontFamily: FONTS.body, fontSize: 13, color: COLORS.danger }}>{apiError(error)}</Text>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c._id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={!isFetching ? (
            <Text style={{ padding: 16, textAlign: 'center', fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3 }}>No customer matches “{search}”.</Text>
          ) : null}
          renderItem={({ item }) => (
            <PressableScale
              onPress={() => router.push({ pathname: '/person', params: { customerId: item._id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.line }}
            >
              <Avatar name={item.fullName} size={40} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink }}>{item.fullName}</Text>
                <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>
                  {[item.clientId, item.phone, item.company].filter(Boolean).join(' · ') || item.email || ''}
                </Text>
              </View>
              {item.stage === 'prospect' && (
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: COLORS.ink3, textTransform: 'uppercase' }}>Quoted</Text>
              )}
              <Ionicons name="chevron-forward" size={16} color={COLORS.chevron} />
            </PressableScale>
          )}
        />
      )}
    </View>
  )
}
