import { useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { whatsappApi, type WhatsAppConversation, type OwnerTab } from '../../../src/lib/whatsapp'
import { apiError } from '../../../src/lib/api'
import { getSeenMap, isUnread, markSeen } from '../../../src/lib/seen'
import { COLORS, FONTS } from '../../../src/lib/theme'
import Avatar from '../../../src/components/Avatar'

const TABS: { key: OwnerTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'tenants', label: 'Tenants' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'quiet', label: 'Quiet' },
]

function displayName(c: WhatsAppConversation): string {
  return c.lead?.fullName || c.customer?.fullName || c.phone
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function waitedFor(since: string): { text: string; bg: string; fg: string } {
  const hours = (Date.now() - new Date(since).getTime()) / 36e5
  const text = hours < 1 ? `${Math.round(hours * 60)}m` : hours < 48 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`
  if (hours >= 24) return { text, bg: COLORS.badBg, fg: COLORS.bad }
  if (hours >= 4) return { text, bg: COLORS.warnBg, fg: COLORS.warn }
  return { text, bg: '#F1F5F9', fg: COLORS.muted }
}

export default function WhatsAppListScreen() {
  const router = useRouter()
  const [owner, setOwner] = useState<OwnerTab>('all')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [seenMap, setSeenMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    getSeenMap().then(setSeenMap)
  }, [])

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['wa-conversations', owner, debouncedQ],
    queryFn: () => whatsappApi.conversations({ owner, q: debouncedQ || undefined, limit: 200 }),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })

  const conversations = data?.list ?? []
  const counts = data?.ownerCounts

  const openChat = (c: WhatsAppConversation) => {
    markSeen(c.phoneNormalized, c.lastAt).then(() => setSeenMap((m) => ({ ...m, [c.phoneNormalized]: c.lastAt })))
    router.push({
      pathname: '/whatsapp/[phone]',
      params: { phone: c.phoneNormalized, name: displayName(c), leadId: c.lead?._id ?? '' },
    })
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.paper }} edges={['top']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 }}>
        <Text style={{ fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink }}>WhatsApp</Text>

        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff',
            borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 12, height: 42,
          }}
        >
          <Ionicons name="search" size={17} color={COLORS.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search chats"
            placeholderTextColor={COLORS.faint}
            style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink }}
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={COLORS.faint} />
            </Pressable>
          )}
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TABS}
          keyExtractor={(t) => t.key}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const active = owner === item.key
            const count = counts?.[item.key]
            return (
              <Pressable
                onPress={() => setOwner(item.key)}
                style={{
                  paddingHorizontal: 14, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? COLORS.brand : '#fff', borderWidth: active ? 0 : 1, borderColor: COLORS.line,
                  flexDirection: 'row', gap: 5,
                }}
              >
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: active ? '#fff' : COLORS.muted }}>{item.label}</Text>
                {count != null && (
                  <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: active ? 'rgba(255,255,255,0.85)' : COLORS.faint }}>{count}</Text>
                )}
              </Pressable>
            )
          }}
        />
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
      ) : conversations.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="chatbubbles-outline" size={40} color={COLORS.faint} />
          <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.muted, marginTop: 10 }}>No chats here</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.phoneNormalized}
          onRefresh={refetch}
          refreshing={isFetching}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const name = displayName(item)
            const unread = isUnread(seenMap, item.phoneNormalized, item.lastAt)
            const waiting = item.waitingSince ? waitedFor(item.waitingSince) : null
            return (
              <Pressable
                onPress={() => openChat(item)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}
              >
                <Avatar name={name} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: unread ? FONTS.bodyBold : FONTS.bodyMedium, fontSize: 15, color: COLORS.ink, flex: 1, marginRight: 8 }}
                    >
                      {name}
                    </Text>
                    <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: unread ? COLORS.brand : COLORS.faint }}>{timeAgo(item.lastAt)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text numberOfLines={1} style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.muted, flex: 1 }}>
                      {item.phone}
                    </Text>
                    {!item.lead && !item.customer && (
                      <View style={{ backgroundColor: '#FFF7E6', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10, color: '#B45309' }}>Unassigned</Text>
                      </View>
                    )}
                    {waiting && (
                      <View style={{ backgroundColor: waiting.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10, color: waiting.fg }}>Waiting {waiting.text}</Text>
                      </View>
                    )}
                    {unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.brand }} />}
                  </View>
                </View>
              </Pressable>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}
