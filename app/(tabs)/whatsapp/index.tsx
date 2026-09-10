import { useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useIsFocused } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { whatsappApi, type WhatsAppConversation } from '../../../src/lib/whatsapp'
import { apiError } from '../../../src/lib/api'
import { getSeenMap, isUnread, markSeen } from '../../../src/lib/seen'
import { statusMeta } from '../../../src/lib/leadStatus'
import { COLORS, FONTS, RADII, SHADOWS, avatarStyle } from '../../../src/lib/theme'
import PressableScale from '../../../src/components/PressableScale'

/**
 * The handoff's 3 inbox tabs — All / Waiting on me / Replied — replacing
 * the richer 6-way owner split (mine/tenants/unassigned/quiet) this screen
 * had before. "Waiting on me" maps straight onto the server's own
 * `owner=waiting` filter; "Replied" has no server equivalent, so it's the
 * complement computed client-side from `waitingSince`, same as the
 * prototype's own `mine:!waiting` logic.
 */
type InboxTab = 'all' | 'waiting' | 'replied'
const TABS: { key: InboxTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting on me' },
  { key: 'replied', label: 'Replied' },
]

function displayName(c: WhatsAppConversation): string {
  // The server already resolves this (customer name, then lead name minus
  // the auto-generated placeholder, then their WhatsApp profile name, then
  // the number) — using lead.fullName directly here instead was showing
  // "WhatsApp Contact 5521" for any lead nobody has named yet, the exact
  // case displayName exists to filter out.
  return c.displayName || c.lead?.fullName || c.customer?.fullName || c.phone
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
  // React Navigation keeps a tab's screen mounted once visited, so without
  // this the 5s poll below kept running forever in the background — every
  // tab you'd ever opened was still hitting the network on its own timer
  // while you were off doing something else, and that competing traffic
  // (plus the JS-thread work of handling each response) is what made
  // switching tabs feel sluggish. Polling only while this tab is the one
  // actually on screen fixes that; refetchOnMount still refreshes it the
  // instant you come back.
  const isFocused = useIsFocused()
  const [tab, setTab] = useState<InboxTab>('all')
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

  // "Replied" has no server-side owner filter, so it fetches the same full
  // list as "All" and filters client-side — see the TABS comment above.
  const serverOwner = tab === 'waiting' ? 'waiting' : 'all'
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['wa-conversations', serverOwner, debouncedQ],
    queryFn: () => whatsappApi.conversations({ owner: serverOwner, q: debouncedQ || undefined, limit: 200 }),
    refetchInterval: isFocused ? 5_000 : false,
    refetchIntervalInBackground: true,
  })

  const conversations = useMemo(
    () => (tab === 'replied' ? (data?.list ?? []).filter((c) => !c.waitingSince) : data?.list ?? []),
    [data, tab],
  )
  const counts = data?.ownerCounts
  const tabCount = (key: InboxTab) => (key === 'replied' ? (counts ? counts.all - counts.waiting : undefined) : counts?.[key])

  const openChat = (c: WhatsAppConversation) => {
    markSeen(c.phoneNormalized, c.lastAt).then(() => setSeenMap((m) => ({ ...m, [c.phoneNormalized]: c.lastAt })))
    router.push({
      pathname: '/whatsapp/[phone]',
      params: { phone: c.phoneNormalized, name: displayName(c), leadId: c.lead?._id ?? '' },
    })
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <SafeAreaView edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: FONTS.display, fontSize: 26, letterSpacing: -0.5, color: COLORS.ink }}>WhatsApp</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.successTint, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11.5, color: COLORS.success }}>Connected</Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.surfaceAlt,
            borderRadius: RADII.input, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 14, height: 46,
          }}
        >
          <Ionicons name="search" size={17} color={COLORS.ink4} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search chats"
            placeholderTextColor={COLORS.ink4}
            style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink }}
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={COLORS.ink4} />
            </Pressable>
          )}
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TABS}
          keyExtractor={(t) => t.key}
          contentContainerStyle={{ gap: 7 }}
          renderItem={({ item }) => {
            const active = tab === item.key
            const count = tabCount(item.key)
            return (
              <PressableScale
                onPress={() => setTab(item.key)}
                style={{
                  paddingHorizontal: 14, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? COLORS.purple600 : COLORS.surfaceAlt, borderWidth: active ? 0 : 1, borderColor: active ? undefined : COLORS.chevron,
                  flexDirection: 'row', gap: 5, ...(active ? SHADOWS.purpleGlow : {}),
                }}
              >
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: active ? '#fff' : COLORS.ink2 }}>{item.label}</Text>
                {count != null && (
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: active ? 'rgba(255,255,255,0.75)' : COLORS.ink4 }}>{count}</Text>
                )}
              </PressableScale>
            )
          }}
        />
      </View>
        </SafeAreaView>
      </View>
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.purple600} />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.danger, textAlign: 'center' }}>{apiError(error)}</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.purple600 }}>Try again</Text>
          </Pressable>
        </View>
      ) : conversations.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <View style={{ width: 66, height: 66, borderRadius: 22, backgroundColor: COLORS.successTint, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="logo-whatsapp" size={30} color={COLORS.whatsapp} />
          </View>
          <Text style={{ marginTop: 18, fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink }}>Inbox is clear 🎉</Text>
          <Text style={{ marginTop: 6, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink3, textAlign: 'center' }}>Every chat in this view has a reply.</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.phoneNormalized}
          onRefresh={refetch}
          refreshing={isFetching}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item, index }) => {
            const name = displayName(item)
            const unread = isUnread(seenMap, item.phoneNormalized, item.lastAt)
            const waiting = item.waitingSince ? waitedFor(item.waitingSince) : null
            const av = avatarStyle(index)
            const leadBadge = item.lead ? statusMeta(item.lead.status) : null
            return (
              <PressableScale
                onPress={() => openChat(item)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft }}
              >
                <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: av.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: FONTS.display, fontSize: 16, color: av.text }}>{name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: unread ? FONTS.bodyBold : FONTS.bodyMedium, fontSize: 14.5, color: COLORS.ink, flexShrink: 1 }}
                    >
                      {name}
                    </Text>
                    {leadBadge && (
                      <View style={{ backgroundColor: leadBadge.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 9.5, color: leadBadge.text }}>{leadBadge.label}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {item.lastMessageMine && <Ionicons name="checkmark-done" size={14} color={COLORS.readTick} />}
                    <Text numberOfLines={1} style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink3, flex: 1 }}>
                      {item.lastMessage}
                    </Text>
                    {!item.lead && !item.customer && (
                      <View style={{ backgroundColor: COLORS.warnTint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10, color: COLORS.warnInk }}>Unassigned</Text>
                      </View>
                    )}
                    {unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.purple600 }} />}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: unread ? COLORS.purple600 : COLORS.ink4 }}>{timeAgo(item.lastAt)}</Text>
                  {waiting && (
                    <View style={{ marginTop: 6, backgroundColor: waiting.bg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 9.5, color: waiting.fg }}>Waiting {waiting.text}</Text>
                    </View>
                  )}
                </View>
              </PressableScale>
            )
          }}
        />
      )}
      </SafeAreaView>
    </View>
  )
}
