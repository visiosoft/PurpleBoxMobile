import React, { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../src/lib/auth'
import { useNotifications } from '../../src/lib/notifications'
import { notify } from '../../src/lib/alert'
import { leadApi, type FollowUpLeadRow, type Lead } from '../../src/lib/leads'
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
import AssistantResultCard from '../../src/components/AssistantResultCard'
import { useDashboardDismissed } from '../../src/lib/dashboardDismissed'
import { assistantApi, type AssistantAskResponse, type AssistantMessage } from '../../src/lib/assistant'
import { apiError, API_BASE_URL } from '../../src/lib/api'
import {
  useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio'

function formatRecordingTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

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
  return (p || '').replace(/\D/g, '')
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

  const { dismissedSet, dismiss, clearAll } = useDashboardDismissed()

  // ── BayOps command bar: a question's result replaces the feed until
  // "‹ Priorities" is tapped, rather than opening a separate chat screen —
  // see the full "Assistant" tab (app/(tabs)/assistant.tsx) for the same
  // assistant as an ordinary chat, if that's ever wanted instead. Both call
  // the identical server endpoints; this is just a different frame around
  // the same answers.
  const [commandMode, setCommandMode] = useState<'feed' | 'results'>('feed')
  const [commandDraft, setCommandDraft] = useState('')
  const [commandAsked, setCommandAsked] = useState('')
  const [commandHistory, setCommandHistory] = useState<AssistantMessage[]>([])
  const [commandResult, setCommandResult] = useState<AssistantAskResponse | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder, 200)

  const askCommand = useMutation({
    mutationFn: (question: string) => assistantApi.ask(question, commandHistory),
    onSuccess: (res, question) => {
      setCommandResult(res)
      const turns: AssistantMessage[] = [{ role: 'user', content: question }, { role: 'assistant', content: res.answer }]
      setCommandHistory((prev) => [...prev, ...turns].slice(-8))
    },
    onError: (e) => {
      setCommandResult({ answer: apiError(e), tools: [], model: '', rounds: 0, grounded: false })
    },
  })

  const confirmCommand = useMutation({
    mutationFn: (id: string) => assistantApi.confirm(id),
    onSuccess: (res) => {
      setCommandResult((prev) => (prev ? { ...prev, answer: res.message, pending: null, links: [] } : prev))
      if (res.pdfPath) {
        const url = res.pdfPath.startsWith('http') ? res.pdfPath : `${API_BASE_URL.replace(/\/api$/, '')}${res.pdfPath}`
        Linking.openURL(url).catch(() => {})
      }
    },
    onError: (e) => notify('Could not confirm', apiError(e)),
  })

  const cancelCommand = useMutation({
    mutationFn: (id: string) => assistantApi.cancel(id),
    onSuccess: (res) => {
      setCommandResult((prev) => (prev ? { ...prev, answer: res.message, pending: null, links: [] } : prev))
    },
    onError: (e) => notify('Could not cancel', apiError(e)),
  })

  function runCommand(question: string) {
    const text = question.trim()
    if (!text || askCommand.isPending) return
    setCommandMode('results')
    setCommandAsked(text)
    setCommandDraft('')
    setCommandResult(null)
    askCommand.mutate(text)
  }

  function backToPriorities() {
    setCommandMode('feed')
    setCommandResult(null)
  }

  async function startVoiceCommand() {
    const perm = await requestRecordingPermissionsAsync()
    if (!perm.granted) { notify('Microphone access needed', 'Allow microphone access to speak a command.'); return }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
    await recorder.prepareToRecordAsync()
    recorder.record()
  }

  async function stopVoiceCommand(send: boolean) {
    await recorder.stop()
    const uri = recorder.uri
    if (!send || !uri) return
    setTranscribing(true)
    try {
      const text = await assistantApi.transcribe(uri)
      if (!text) { notify("Didn't catch that", 'Try again, or type it instead.'); return }
      runCommand(text)
    } catch (e) {
      notify('Could not transcribe', apiError(e))
    } finally {
      setTranscribing(false)
    }
  }

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
          note:
            lead.notes ||
            `${lead.storageSizeValue} sqft · ${lead.durationValue} ${lead.durationUnit}${lead.durationValue === 1 ? '' : 's'
            }`,
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
          note: 'Customer waiting for follow-up response.',
          lastMessage: conv?.lastMessage,
          lastMessageMine: conv?.lastMessageMine,
          followUpAt: f.followUpAt,
          createdAt: f.createdAt,
          category: 'reminders',
          priority: 2,
        })
      })

      // C. Scheduled Site Visits (Important Reminders)
      ; (siteVisitsPage?.data ?? []).forEach((lead: Lead) => {
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
          timeText: lead.siteVisitAt ? formatTime(lead.siteVisitAt) : 'Upcoming',
          subtitle: 'Site visit scheduled',
          note: lead.notes || `${lead.storageSizeValue} sqft storage requirement`,
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
          note: 'Check in on storage decision or quote.',
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

  // Filter out dismissed items
  const activeFeedItems = useMemo(() => {
    return allFeedItems.filter((item) => !dismissedSet.has(item.id))
  }, [allFeedItems, dismissedSet])

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

  const dismissedCount = allFeedItems.length - activeFeedItems.length

  // Action handlers
  const handleStartChatAndDismiss = async (item: DashboardFeedItem) => {
    // Dismiss item from dashboard so it goes away
    await dismiss(item.id)

    // Navigate to WhatsApp chat
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
    handleOpenLead(leadId)
  }, [])

  const handleReschedule = useCallback((item: DashboardFeedItem) => {
    setRescheduleLead({
      id: item.leadId,
      name: item.title,
      currentFollowUp: item.followUpAt,
    })
  }, [])

  const renderFeedItem = useCallback(
    ({ item, index }: { item: DashboardFeedItem; index: number }) => (
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
        onChat={() => handleStartChatAndDismiss(item)}
        onReschedule={() => handleReschedule(item)}
        onOpenDetails={() => handleOpenDetails(item.leadId)}
      />
    ),
    [handleReschedule, handleOpenDetails]
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
                onPress={() => notify('Notifications', 'All your urgent reminders are right below.')}
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
        {/* Command bar — asks the same "Ask the system" assistant the full
            Assistant tab uses; its answer replaces everything below until
            "‹ Priorities" is tapped. Typed or spoken: the mic records, sends
            the clip to /assistant/transcribe, then runs the transcript
            through exactly the same command path as if it had been typed. */}
        {recorderState.isRecording ? (
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, height: 48,
              borderRadius: 999, backgroundColor: '#fff', paddingHorizontal: 8, marginBottom: 10, ...SHADOWS.card,
            }}
          >
            <PressableScale
              onPress={() => stopVoiceCommand(false)}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.control, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
            </PressableScale>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.danger }} />
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13.5, color: COLORS.ink, fontVariant: ['tabular-nums'] }}>
                {formatRecordingTime(recorderState.durationMillis)}
              </Text>
              <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink3 }}>Listening…</Text>
            </View>
            <PressableScale
              onPress={() => stopVoiceCommand(true)}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
            </PressableScale>
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              height: 48,
              borderRadius: 999,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: COLORS.line,
              paddingLeft: 6,
              paddingRight: 6,
              marginBottom: 10,
              ...SHADOWS.card,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: COLORS.brand,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8,
              }}
            >
              {transcribing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sparkles" size={16} color="#fff" />}
            </View>
            <TextInput
              value={commandDraft}
              onChangeText={setCommandDraft}
              onSubmitEditing={() => runCommand(commandDraft)}
              placeholder={transcribing ? 'Listening to that…' : 'Ask BayOps anything…'}
              placeholderTextColor={COLORS.faint}
              returnKeyType="send"
              editable={!transcribing}
              style={{ flex: 1, fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.ink }}
            />
            {commandDraft.trim() ? (
              <PressableScale
                onPress={() => runCommand(commandDraft)}
                disabled={askCommand.isPending}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brand }}
              >
                <Ionicons name="arrow-up" size={17} color="#fff" />
              </PressableScale>
            ) : (
              <PressableScale
                onPress={startVoiceCommand}
                disabled={transcribing}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.control }}
              >
                <Ionicons name="mic" size={17} color={COLORS.brandDark} />
              </PressableScale>
            )}
          </View>
        )}

        {commandMode === 'results' ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text
                style={{ flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink3, marginRight: 8 }}
                numberOfLines={1}
              >
                You asked: "{commandAsked}"
              </Text>
              <PressableScale
                onPress={backToPriorities}
                style={{
                  paddingHorizontal: 12,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: COLORS.control,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11.5, color: COLORS.ink }}>‹ Priorities</Text>
              </PressableScale>
            </View>
            <AssistantResultCard
              result={commandResult}
              busyLabel={askCommand.isPending ? 'Checking…' : null}
              confirmBusy={confirmCommand.isPending || cancelCommand.isPending}
              onConfirm={(id) => confirmCommand.mutate(id)}
              onCancel={(id) => cancelCommand.mutate(id)}
            />
          </ScrollView>
        ) : (
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

              {dismissedCount > 0 && (
                <PressableScale
                  onPress={clearAll}
                  style={{
                    marginTop: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 10,
                    backgroundColor: COLORS.purple50,
                    borderWidth: 1,
                    borderColor: COLORS.purple200,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONTS.bodyBold,
                      fontSize: 12,
                      color: COLORS.purple600,
                    }}
                  >
                    Restore {dismissedCount} dismissed {dismissedCount === 1 ? 'item' : 'items'}
                  </Text>
                </PressableScale>
              )}
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
            ListFooterComponent={
              dismissedCount > 0 ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 8,
                    paddingHorizontal: 6,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: 11.5,
                      color: COLORS.ink3,
                    }}
                  >
                    {dismissedCount} {dismissedCount === 1 ? 'item' : 'items'} dismissed from
                    dashboard
                  </Text>
                  <PressableScale onPress={clearAll}>
                    <Text
                      style={{
                        fontFamily: FONTS.bodyBold,
                        fontSize: 11.5,
                        color: COLORS.purple600,
                      }}
                    >
                      Reset all
                    </Text>
                  </PressableScale>
                </View>
              ) : null
            }
          />
        )}
        </>
        )}
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
