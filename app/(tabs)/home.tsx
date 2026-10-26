import React, { useState, useMemo, useCallback, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../src/lib/auth'
import { useNotifications } from '../../src/lib/notifications'
import { notify } from '../../src/lib/alert'
import { leadApi, markContacted, type FollowUpLeadRow, type Lead, type LeadStatus } from '../../src/lib/leads'
import { whatsappApi } from '../../src/lib/whatsapp'
import { leadDisplayName } from '../../src/lib/leadStatus'
import {
  COLORS,
  FONTS,
  GRADIENT_PRIMARY,
  GRADIENT_PRIMARY_LOCATIONS,
  SHADOWS,
} from '../../src/lib/theme'
import PressableScale from '../../src/components/PressableScale'
import SwipeableDashboardCard, {
  type DashboardItemType,
} from '../../src/components/SwipeableDashboardCard'
import FollowUpSheet from '../../src/components/FollowUpSheet'
import CommandBarSection, { type CommandBarHandle } from '../../src/components/CommandBarSection'
import { apiError } from '../../src/lib/api'

type FilterCategory = 'all' | 'reminders' | 'followups' | 'new_leads'

interface DashboardFeedItem {
  id: string
  leadId: string
  type: DashboardItemType
  title: string
  phone: string
  leadStatus?: string
  timeText: string
  subtitle?: string
  note?: string
  lastMessage?: string
  lastMessageMine?: boolean
  followUpAt?: string | null
  createdAt?: string | null
  category: 'reminders' | 'followups' | 'new_leads'
  priority: number
}

function normalizeDigits(p?: string | null): string {
  // Last 9 digits: a lead saved as 055… and its chat as 97155… are one person.
  return (p || '').replace(/\D/g, '').slice(-9)
}

function timeAgo(iso?: string | null): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function formatTime(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** "Tue 28 Oct, 11:30 AM" — a reminder further out than today needs its day. */
function formatDayTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const day = sameDay ? 'Today' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}, ${formatTime(iso)}`
}

/** "50 sqft · 6 months", or nothing when the size hasn't been asked yet (0) or is undecided (-1). */
function sizeSummary(lead: Lead): string | undefined {
  if (!(lead.storageSizeValue > 0)) return undefined
  const duration = lead.durationValue > 0 ? ` · ${lead.durationValue} ${lead.durationUnit}${lead.durationValue === 1 ? '' : 's'}` : ''
  return `${lead.storageSizeValue} sqft${duration}`
}

function overdueLabel(iso?: string | null): string {
  if (!iso) return 'Overdue'
  const hours = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 36e5))
  if (hours < 1) return 'Just overdue'
  if (hours < 24) return `${hours}h overdue`
  return `${Math.round(hours / 24)}d overdue`
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function HomeTab() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { waiting } = useNotifications()
  const [filter, setFilter] = useState<FilterCategory>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [rescheduleLead, setRescheduleLead] = useState<{
    id: string
    name: string
    currentFollowUp?: string | null
  } | null>(null)

  // The command bar itself (bar UI, typed/spoken input, ask/confirm/cancel,
  // the results view) lives in CommandBarSection now — shared with the
  // admin Overview screen so both get the identical bar, not a copy. Home
  // only needs an imperative handle so the per-tile AI field below can run
  // a command through the same instance.
  const commandBarRef = useRef<CommandBarHandle>(null)

  // 1. Follow-ups and reminders
  const {
    data: followUps,
    isLoading: isLoadingFollowUps,
    refetch: refetchFollowUps,
  } = useQuery({
    queryKey: ['follow-ups'],
    queryFn: leadApi.followUps,
    staleTime: 30_000,
  })

  // 2. New leads assigned to user
  const {
    data: newLeadsPage,
    isLoading: isLoadingNewLeads,
    refetch: refetchNewLeads,
  } = useQuery({
    queryKey: ['leads-assigned-new'],
    queryFn: () => leadApi.list({ status: 'new', limit: 25 }),
    staleTime: 30_000,
  })

  // 3. Site visits scheduled (important reminders)
  const {
    data: siteVisitsPage,
    isLoading: isLoadingSiteVisits,
    refetch: refetchSiteVisits,
  } = useQuery({
    queryKey: ['leads-site-visits'],
    queryFn: () => leadApi.list({ status: 'site_visit_scheduled', limit: 15 }),
    staleTime: 30_000,
  })

  // 4. WhatsApp conversations for latest short messages
  const {
    data: convData,
    refetch: refetchConvs,
  } = useQuery({
    queryKey: ['wa-conversations-dashboard'],
    queryFn: () => whatsappApi.conversations({ limit: 40 }),
    staleTime: 60_000,
  })

  // A card leaves the feed only when the lead itself changes (follow-up done
  // or moved, status moved on) — so coming back from a chat re-reads it,
  // rather than the card hiding just because it was opened.
  useFocusEffect(
    useCallback(() => {
      refetchFollowUps()
      refetchNewLeads()
      refetchSiteVisits()
      refetchConvs()
    }, [refetchFollowUps, refetchNewLeads, refetchSiteVisits, refetchConvs]),
  )

  // Reschedule mutation
  const scheduleFollowUpMutation = useMutation({
    mutationFn: ({ id, iso }: { id: string; iso: string }) => leadApi.scheduleFollowUp(id, iso),
    onSuccess: () => {
      notify('Follow-up scheduled', 'The lead has been rescheduled.')
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] })
      queryClient.invalidateQueries({ queryKey: ['leads-assigned-new'] })
      queryClient.invalidateQueries({ queryKey: ['leads-site-visits'] })
      setRescheduleLead(null)
    },
    onError: () => {
      notify('Could not reschedule', 'Failed to update follow-up date.')
    },
  })

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        refetchFollowUps(),
        refetchNewLeads(),
        refetchSiteVisits(),
        refetchConvs(),
        queryClient.invalidateQueries({ queryKey: ['lead-stats'] }),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  // Map of normalized phone numbers to latest message
  const convMap = useMemo(() => {
    const map = new Map<string, { lastMessage: string; lastMessageMine: boolean }>()
      ; (convData?.list ?? []).forEach((c) => {
        const p1 = normalizeDigits(c.phone)
        const p2 = normalizeDigits(c.phoneNormalized)
        const data = { lastMessage: c.lastMessage || '', lastMessageMine: !!c.lastMessageMine }
        if (p1 && c.lastMessage) map.set(p1, data)
        if (p2 && c.lastMessage) map.set(p2, data)
      })
    return map
  }, [convData])

  // Build the prioritized dashboard feed items (New Leads first on top to contact)
  const allFeedItems = useMemo(() => {
    const items: DashboardFeedItem[] = []

      // A. New leads assigned to rep (Highest priority - first to contact on top)
      ; (newLeadsPage?.data ?? []).forEach((lead: Lead) => {
        const id = `lead_new_${lead._id}`
        const name = leadDisplayName(lead)
        const phone = lead.phoneNormalized || lead.phone
        const conv = convMap.get(normalizeDigits(phone))
        items.push({
          id,
          leadId: lead._id,
          type: 'new_lead',
          title: name,
          phone,
          leadStatus: lead.status,
          timeText: lead.createdAt ? timeAgo(lead.createdAt) : 'New',
          subtitle: lead.source === 'whatsapp' ? 'WhatsApp Lead' : 'Assigned Lead',
          note: lead.notes || sizeSummary(lead),
          lastMessage: conv?.lastMessage,
          lastMessageMine: conv?.lastMessageMine,
          followUpAt: lead.followUpAt,
          createdAt: lead.createdAt,
          category: 'new_leads',
          priority: 1,
        })
      })

      // B. Overdue follow-ups
      ; (followUps?.overdue ?? []).forEach((f: FollowUpLeadRow) => {
        const id = `fu_overdue_${f._id}`
        const name = leadDisplayName(f)
        const conv = convMap.get(normalizeDigits(f.phone))
        items.push({
          id,
          leadId: f._id,
          type: 'followup_overdue',
          title: name,
          phone: f.phone,
          leadStatus: f.status,
          timeText: overdueLabel(f.followUpAt),
          subtitle: 'Scheduled follow-up missed',
          lastMessage: conv?.lastMessage,
          lastMessageMine: conv?.lastMessageMine,
          followUpAt: f.followUpAt,
          createdAt: f.createdAt,
          category: 'reminders',
          priority: 2,
        })
      })

      // C. Scheduled Site Visits (Important Reminders) — today onwards only;
      // a visit that already happened is not a reminder any more.
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      ; (siteVisitsPage?.data ?? [])
        .filter((lead: Lead) => !!lead.siteVisitAt && new Date(lead.siteVisitAt).getTime() >= startOfToday.getTime())
        .forEach((lead: Lead) => {
        const id = `site_visit_${lead._id}`
        const name = leadDisplayName(lead)
        const phone = lead.phoneNormalized || lead.phone
        const conv = convMap.get(normalizeDigits(phone))
        items.push({
          id,
          leadId: lead._id,
          type: 'reminder',
          title: name,
          phone,
          leadStatus: lead.status,
          timeText: formatDayTime(lead.siteVisitAt),
          subtitle: 'Site visit scheduled',
          note: lead.notes || sizeSummary(lead),
          lastMessage: conv?.lastMessage,
          lastMessageMine: conv?.lastMessageMine,
          followUpAt: lead.followUpAt,
          createdAt: lead.createdAt,
          category: 'reminders',
          priority: 3,
        })
      })

      // D. Today's follow-ups
      ; (followUps?.today ?? []).forEach((f: FollowUpLeadRow) => {
        const id = `fu_today_${f._id}`
        const name = leadDisplayName(f)
        const conv = convMap.get(normalizeDigits(f.phone))
        items.push({
          id,
          leadId: f._id,
          type: 'followup_today',
          title: name,
          phone: f.phone,
          leadStatus: f.status,
          timeText: formatTime(f.followUpAt),
          subtitle: 'Follow-up due today',
          lastMessage: conv?.lastMessage,
          lastMessageMine: conv?.lastMessageMine,
          followUpAt: f.followUpAt,
          createdAt: f.createdAt,
          category: 'followups',
          priority: 4,
        })
      })

    // Sort by priority (1: New Leads -> 2: Overdue Reminders -> 3: Site Visits -> 4: Today's Follow-ups)
    return items.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      if (a.createdAt && b.createdAt) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      return 0
    })
  }, [followUps, siteVisitsPage, newLeadsPage, convMap])

  const activeFeedItems = allFeedItems

  // Apply Category Tab Filter
  const filteredFeedItems = useMemo(() => {
    if (filter === 'all') return activeFeedItems
    return activeFeedItems.filter((item) => item.category === filter)
  }, [activeFeedItems, filter])

  // Category counts
  const counts = useMemo(() => {
    const overdueAndReminders = activeFeedItems.filter((i) => i.category === 'reminders').length
    const todayFu = activeFeedItems.filter((i) => i.category === 'followups').length
    const newLeads = activeFeedItems.filter((i) => i.category === 'new_leads').length

    return {
      all: activeFeedItems.length,
      reminders: overdueAndReminders,
      followups: todayFu,
      new_leads: newLeads,
    }
  }, [activeFeedItems])

  // Action handlers
  const handleStartChat = (item: DashboardFeedItem) => {
    router.push({
      pathname: '/whatsapp/[phone]',
      params: {
        phone: item.phone,
        name: item.title,
        leadId: item.leadId,
      },
    })
  }

  const handleOpenDetails = useCallback((leadId: string) => {
    router.push(`/leads/${leadId}`)
  }, [router])

  const handleReschedule = useCallback((item: DashboardFeedItem) => {
    setRescheduleLead({
      id: item.leadId,
      name: item.title,
      currentFollowUp: item.followUpAt,
    })
  }, [])

  // ── One expanded tile at a time, BayOps-style — everything below is
  // additive to the existing collapsed card. Defaults to the top of the
  // priority-sorted feed once it loads.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tileAiValue, setTileAiValue] = useState('')
  const activeExpandedId = expandedId ?? filteredFeedItems[0]?.id ?? null

  function toggleExpand(id: string) {
    setExpandedId((current) => {
      const active = current ?? filteredFeedItems[0]?.id ?? null
      return active === id ? '__none__' : id
    })
    setTileAiValue('')
  }

  // A plain-English reason built from the same data already on screen — not
  // AI-written, so it can never say something the data doesn't support.
  // Who wrote last is the one fact that changes what to do next.
  function whyNowFor(item: DashboardFeedItem): string {
    const lastWord = !item.lastMessage
      ? 'No WhatsApp conversation yet.'
      : item.lastMessageMine
        ? 'Your last message has had no reply.'
        : 'The customer wrote last and is waiting for you.'
    switch (item.type) {
      case 'new_lead':
        return `New enquiry, not contacted yet. ${lastWord}`
      case 'followup_overdue':
        return `Follow-up is ${item.timeText.toLowerCase()}. ${lastWord}`
      case 'followup_today':
        return `Follow-up due today. ${lastWord}`
      case 'reminder':
        return `Site visit ${item.timeText}. ${lastWord}`
      default:
        return lastWord
    }
  }

  // Claude writes the suggestion for the one expanded tile only, from the
  // lead's conversation and notes — so opening the feed never fires a round
  // of model calls just for being on screen. Cached per lead for 30 minutes.
  const expandedItem = filteredFeedItems.find((i) => i.id === activeExpandedId)
  const aiSuggestion = useQuery({
    queryKey: ['suggest-message', expandedItem?.leadId],
    queryFn: () => leadApi.suggestMessage(expandedItem!.leadId),
    enabled: !!expandedItem?.leadId,
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  // Claude's draft once it arrives. Until then (or if Claude is unavailable)
  // only a new lead gets a stock opener — for anyone already in a
  // conversation a canned line reads worse than no suggestion.
  function suggestedMessageFor(item: DashboardFeedItem): string | undefined {
    if (item.id === expandedItem?.id && aiSuggestion.data) return aiSuggestion.data
    if (item.type === 'new_lead' && !item.lastMessage) {
      const name = item.title.split(' ')[0] || item.title
      return `Hi ${name}, thanks for reaching out about storage! Could you share roughly what size you need and when you'd like to start?`
    }
    return aiSuggestion.isFetching ? '' : undefined
  }

  // Sent from here it counts exactly as if sent from the chat: the due
  // follow-up is done and a New lead becomes Contact Attempted, so the card
  // drops out of the feed on the refetch.
  const sendSuggested = useMutation({
    mutationFn: async ({ item, text }: { item: DashboardFeedItem; text: string }) => {
      await whatsappApi.send(item.phone, text)
      await markContacted({ id: item.leadId, status: item.leadStatus as LeadStatus, followUpAt: item.followUpAt })
    },
    onSuccess: (_res, { item }) => {
      notify('Sent', `Your message to ${item.title} is on its way.`)
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] })
      queryClient.invalidateQueries({ queryKey: ['leads-assigned-new'] })
      queryClient.invalidateQueries({ queryKey: ['wa-conversations-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
    },
    onError: (e) => notify('Could not send', apiError(e)),
  })

  function submitTileAi(item: DashboardFeedItem) {
    const text = tileAiValue.trim()
    if (!text) return
    setTileAiValue('')
    commandBarRef.current?.runCommand(`Regarding ${item.title} (${item.phone}): ${text}`)
  }

  const renderFeedItem = useCallback(
    ({ item, index }: { item: DashboardFeedItem; index: number }) => {
      const expanded = activeExpandedId === item.id
      return (
        <SwipeableDashboardCard
          id={item.id}
          index={index}
          type={item.type}
          title={item.title}
          subtitle={item.subtitle}
          note={item.note}
          lastMessage={item.lastMessage}
          lastMessageMine={item.lastMessageMine}
          timeText={item.timeText}
          phone={item.phone}
          leadStatus={item.leadStatus}
          onChat={() => handleStartChat(item)}
          onReschedule={() => handleReschedule(item)}
          onOpenDetails={() => handleOpenDetails(item.leadId)}
          expanded={expanded}
          onToggleExpand={() => toggleExpand(item.id)}
          whyNow={expanded ? whyNowFor(item) : undefined}
          suggestedMessage={expanded ? suggestedMessageFor(item) : undefined}
          suggestionLoading={expanded && aiSuggestion.isFetching}
          sendingMessage={sendSuggested.isPending}
          onSendSuggested={(text) => sendSuggested.mutate({ item, text })}
          aiValue={tileAiValue}
          onChangeAi={setTileAiValue}
          onSubmitAi={() => submitTileAi(item)}
        />
      )
    },
    [handleReschedule, handleOpenDetails, activeExpandedId, tileAiValue, sendSuggested.isPending, aiSuggestion.data, aiSuggestion.isFetching]
  )

  const isLoading = isLoadingFollowUps || isLoadingNewLeads || isLoadingSiteVisits

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      {/* Header Gradient */}
      <LinearGradient
        colors={GRADIENT_PRIMARY}
        locations={GRADIENT_PRIMARY_LOCATIONS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingBottom: 14,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
        }}
      >
        <SafeAreaView edges={['top']}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingTop: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 22,
                  lineHeight: 26,
                  letterSpacing: -0.4,
                  color: '#fff',
                }}
              >
                {greeting()}, {(user?.name || '').split(' ')[0] || 'there'} 👋
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                {counts.all === 0
                  ? "You're all caught up for now!"
                  : `${counts.all} actionable ${counts.all === 1 ? 'item' : 'items'
                  } requiring your attention.`}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 7 }}>
              <PressableScale
                onPress={() => setFilter('reminders')}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.28)',
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="notifications-outline" size={18} color="#fff" />
                {counts.all > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 7,
                      minWidth: 15,
                      height: 15,
                      borderRadius: 7.5,
                      backgroundColor: COLORS.cyan,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONTS.bodyBold,
                        fontSize: 9,
                        color: COLORS.purple900,
                      }}
                    >
                      {counts.all}
                    </Text>
                  </View>
                )}
              </PressableScale>

              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 14,
                    color: COLORS.purple600,
                  }}
                >
                  {(user?.name || '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Action Hints */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(255,255,255,0.14)',
              marginHorizontal: 16,
              marginTop: 8,
              borderRadius: 10,
              paddingVertical: 5,
              paddingHorizontal: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="chatbubble-ellipses" size={12} color="#DEF7E6" />
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: '#fff' }}>
                Swipe 👉 Chat
              </Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>|</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: '#fff' }}>
                Reschedule 👈 Swipe
              </Text>
              <Ionicons name="calendar-outline" size={12} color="#EDE5FF" />
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Main Content Area */}
      <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 10 }}>
        <CommandBarSection ref={commandBarRef}>
        <>
        {/* Category Chips Bar (Horizontal Scroll to avoid clutter/overlap) */}
        <View style={{ marginBottom: 10 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 2, paddingHorizontal: 2 }}
          >
            <FilterPill
              label="All"
              count={counts.all}
              active={filter === 'all'}
              onPress={() => setFilter('all')}
            />
            <FilterPill
              label="New Leads"
              count={counts.new_leads}
              active={filter === 'new_leads'}
              onPress={() => setFilter('new_leads')}
            />
            <FilterPill
              label="Reminders"
              count={counts.reminders}
              active={filter === 'reminders'}
              badgeColor={counts.reminders > 0 ? COLORS.danger : undefined}
              onPress={() => setFilter('reminders')}
            />
            <FilterPill
              label="Follow-ups"
              count={counts.followups}
              active={filter === 'followups'}
              onPress={() => setFilter('followups')}
            />
          </ScrollView>
        </View>

        {/* Action Item Feed List */}
        {isLoading && activeFeedItems.length === 0 ? (
          <View style={{ paddingVertical: 32, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={COLORS.purple600} size="large" />
            <Text
              style={{
                marginTop: 10,
                fontFamily: FONTS.bodyMedium,
                fontSize: 12.5,
                color: COLORS.ink3,
              }}
            >
              Loading your reminders & follow-ups...
            </Text>
          </View>
        ) : filteredFeedItems.length === 0 ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 28 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.purple600]}
                tintColor={COLORS.purple600}
              />
            }
          >
            <View
              style={{
                borderWidth: 1,
                borderColor: COLORS.line,
                borderRadius: 18,
                padding: 22,
                backgroundColor: '#fff',
                alignItems: 'center',
                marginTop: 6,
                ...SHADOWS.card,
              }}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  backgroundColor: COLORS.successTintSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                }}
              >
                <Ionicons name="checkmark-circle" size={26} color={COLORS.success} />
              </View>

              <Text
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 17,
                  color: COLORS.ink,
                  textAlign: 'center',
                }}
              >
                {filter === 'all'
                  ? 'All Reminders Cleared 🎉'
                  : `No pending ${filter === 'reminders'
                    ? 'reminders'
                    : filter === 'followups'
                      ? 'follow-ups'
                      : 'new leads'
                  }`}
              </Text>

              <Text
                style={{
                  marginTop: 4,
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  color: COLORS.ink3,
                  textAlign: 'center',
                  lineHeight: 18,
                }}
              >
                {filter === 'all'
                  ? "You've contacted or cleared all assigned leads and follow-ups. Pull down anytime to check for new items."
                  : 'You have no items in this filter category.'}
              </Text>
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={filteredFeedItems}
            keyExtractor={(item) => item.id}
            renderItem={renderFeedItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 28 }}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews={true}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.purple600]}
                tintColor={COLORS.purple600}
              />
            }
          />
        )}
        </>
        </CommandBarSection>
      </View>

      {/* Reschedule Follow-up Sheet */}
      {!!rescheduleLead && (
        <FollowUpSheet
          visible={!!rescheduleLead}
          current={rescheduleLead.currentFollowUp}
          title={`Reschedule: ${rescheduleLead.name}`}
          onSchedule={(iso) =>
            scheduleFollowUpMutation.mutate({ id: rescheduleLead.id, iso })
          }
          onClose={() => setRescheduleLead(null)}
        />
      )}
    </View>
  )
}

function FilterPill({
  label,
  count,
  active,
  badgeColor,
  onPress,
}: {
  label: string
  count: number
  active: boolean
  badgeColor?: string
  onPress: () => void
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={{
        height: 33,
        paddingHorizontal: 12,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 5,
        backgroundColor: active ? '#fff' : COLORS.control,
        borderWidth: 1,
        borderColor: active ? COLORS.purple200 : 'transparent',
        ...(active
          ? {
            shadowColor: COLORS.ink,
            shadowOpacity: 0.08,
            shadowRadius: 5,
            elevation: 2,
          }
          : {}),
      }}
    >
      <Text
        style={{
          fontFamily: FONTS.bodyBold,
          fontSize: 11.5,
          color: active ? COLORS.purple600 : COLORS.ink3,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View
        style={{
          backgroundColor: active
            ? badgeColor
              ? `${badgeColor}18`
              : COLORS.purple100
            : 'rgba(20,8,31,0.06)',
          borderRadius: 999,
          paddingHorizontal: 5,
          paddingVertical: 1,
        }}
      >
        <Text
          style={{
            fontFamily: FONTS.bodyBold,
            fontSize: 10,
            color: active ? badgeColor || COLORS.purple600 : COLORS.ink3,
          }}
        >
          {count}
        </Text>
      </View>
    </PressableScale>
  )
}
