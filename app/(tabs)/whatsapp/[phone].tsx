import { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react'
import {
  View, Text, TextInput, FlatList, Pressable, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Image, Linking, Animated, PanResponder, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, Stack, useIsFocused } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import {
  useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio'
import { whatsappApi, messageTemplateApi, type WhatsAppMsg, type MessageTemplate, type WhatsAppConversation } from '../../../src/lib/whatsapp'
import { leadApi, type LeadStatus } from '../../../src/lib/leads'
import { userApi } from '../../../src/lib/users'
import { LEAD_STATUS_FLOW, statusMeta } from '../../../src/lib/leadStatus'
import { apiError } from '../../../src/lib/api'
import { notify, confirmAction } from '../../../src/lib/alert'
import { markSeen } from '../../../src/lib/seen'
import { useAuth } from '../../../src/lib/auth'
import { COLORS, FONTS } from '../../../src/lib/theme'
import Attachment from '../../../src/components/whatsapp/Attachment'
import ScoreSheet from '../../../src/components/whatsapp/ScoreSheet'
import PickerSheet from '../../../src/components/PickerSheet'
import FollowUpSheet from '../../../src/components/FollowUpSheet'
import QuickRepliesSheet from '../../../src/components/whatsapp/QuickRepliesSheet'
import UnitSizeSheet from '../../../src/components/UnitSizeSheet'
import ContactedNoteSheet from '../../../src/components/ContactedNoteSheet'
import PressableScale from '../../../src/components/PressableScale'

type PendingMedia = { uri: string; name: string; mimeType: string; kind: 'image' | 'video' | 'audio' }

const SCREEN_WIDTH = Dimensions.get('window').width
const SWIPE_NAV_THRESHOLD = 70

function normalizeDigits(p?: string | null): string {
  return (p || '').replace(/\D/g, '')
}

function getConvDisplayName(c: WhatsAppConversation): string {
  return c.displayName || c.lead?.fullName || c.customer?.fullName || c.phone
}

function getConvParams(c: WhatsAppConversation) {
  const cName = getConvDisplayName(c)
  const cPhone = c.phoneNormalized || c.phone
  const cLeadId = c.lead?._id || ''
  return { phone: cPhone, name: cName, leadId: cLeadId }
}

function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatRecordingTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ChatThreadScreen() {
  const { phone, name, leadId } = useLocalSearchParams<{ phone: string; name?: string; leadId?: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [draft, setDraft] = useState('')
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [sendErr, setSendErr] = useState('')
  const [scoreOpen, setScoreOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false)
  const [unitSizeOpen, setUnitSizeOpen] = useState(false)
  const [contactedNoteOpen, setContactedNoteOpen] = useState(false)
  const [siteVisitOpen, setSiteVisitOpen] = useState(false)
  const [ownerOpen, setOwnerOpen] = useState(false)
  // A pushed screen stays mounted under whatever's on top of it — switch to
  // another bottom tab, or back to the thread list, and this poll would
  // otherwise keep firing for a chat nobody is looking at.
  const isFocused = useIsFocused()

  // .m4a/AAC — the same container the server's send-media route already
  // accepts as-is (only a browser's WebM recording needs remuxing there).
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder, 200)

  // The server will hand back up to 2000 messages for a thread if asked —
  // fine for a one-time web page load, but this screen refetches on every
  // 3s poll, so a busy conversation's entire history was going over the
  // wire again and again just to keep the chat open. Starting small and
  // growing only when a rep actually scrolls up for history keeps both the
  // initial open and every poll after it cheap.
  const [messageLimit, setMessageLimit] = useState(60)
  const [loadingMore, setLoadingMore] = useState(false)
  const { data: messages = [], isLoading, isFetching: messagesFetching } = useQuery({
    queryKey: ['wa-messages', phone],
    queryFn: () => whatsappApi.messages(phone, messageLimit),
    enabled: !!phone,
    refetchInterval: isFocused ? 3_000 : false,
    refetchIntervalInBackground: false,
  })
  useEffect(() => { if (!messagesFetching) setLoadingMore(false) }, [messagesFetching])

  const { data: lead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => leadApi.get(leadId!),
    enabled: !!leadId,
  })
  const invalidateLead = () => queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
  const changeStatus = useMutation({
    mutationFn: ({ status, comment }: { status: LeadStatus; comment?: string }) => leadApi.updateStatus(leadId!, status, comment),
    onSuccess: invalidateLead,
    onError: (e) => notify('Could not update status', apiError(e)),
  })
  const scheduleFollowUp = useMutation({
    mutationFn: (iso: string) => leadApi.scheduleFollowUp(leadId!, iso),
    onSuccess: invalidateLead,
    onError: (e) => notify('Could not schedule follow-up', apiError(e)),
  })
  // Sending a message IS the follow-up contact — once it goes out, a
  // due/overdue reminder for this lead no longer reflects reality, so clear
  // it everywhere (dashboard, Follow-ups tab, badge counts) rather than
  // leaving it to nag until someone reschedules or dismisses it by hand.
  const clearDueFollowUp = useMutation({
    mutationFn: () => leadApi.scheduleFollowUp(leadId!, null),
    onSuccess: () => {
      invalidateLead()
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
    },
  })
  function clearFollowUpIfDue() {
    if (!leadId || !lead?.followUpAt) return
    // "Due today" clears too, not just "already past" — a 5pm follow-up
    // messaged at 10am was still just resolved, it shouldn't keep nagging
    // for the rest of the day. Anything scheduled for a later day is a
    // deliberate future reminder and is left alone.
    const followUpDay = new Date(lead.followUpAt)
    followUpDay.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (followUpDay.getTime() <= today.getTime()) {
      clearDueFollowUp.mutate()
    }
  }
  // A brand-new lead is "New" only until someone actually reaches out —
  // the first WhatsApp message we send them (even just "hi") is that first
  // outreach, so move it to Contact Attempted automatically instead of
  // leaving it sitting as New until a rep remembers to flip the status by
  // hand. Anything past New was already touched, so this only ever fires once.
  function autoMarkContactAttempted() {
    if (!leadId || !lead) return
    if (lead.status === 'new') {
      changeStatus.mutate({ status: 'contact_attempted' })
    }
  }
  const scheduleSiteVisit = useMutation({
    mutationFn: (iso: string) => leadApi.scheduleSiteVisit(leadId!, iso),
    onSuccess: invalidateLead,
    onError: (e) => notify('Could not schedule site visit', apiError(e)),
  })
  const updateUnitSize = useMutation({
    mutationFn: (body: { storageSizeValue: number; durationValue: number; durationUnit: 'week' | 'month' }) =>
      leadApi.updateUnitSize(leadId!, body),
    onSuccess: () => { setUnitSizeOpen(false); invalidateLead() },
    onError: (e) => notify('Could not save', apiError(e)),
  })

  // Reassigning to a different rep is admin-only — the server enforces this
  // too (a sales rep's own PUT /leads/:id always keeps them as the owner),
  // this just avoids offering a control that would silently no-op for
  // anyone else.
  const { data: assignableUsers } = useQuery({
    queryKey: ['users-assignable'],
    queryFn: userApi.assignable,
    enabled: isAdmin && !!leadId,
    staleTime: 5 * 60_000,
  })
  const reps = (assignableUsers ?? []).filter((u) => u.role === 'sales_rep' || u.role === 'accounts')
  const reassign = useMutation({
    mutationFn: (ownerId: string | null) => leadApi.reassign(leadId!, ownerId),
    onSuccess: () => { setOwnerOpen(false); invalidateLead() },
    onError: (e) => notify('Could not reassign', apiError(e)),
  })

  // "Contacted" is the one status where what was actually said matters —
  // captured while the call is still fresh via ContactedNoteSheet, folded
  // into the very same status-change request the server already supports
  // (PATCH /leads/:id/status accepts an optional comment), rather than a
  // second, easy-to-skip step.
  function finishContacted(note: string, thenScheduleVisit: boolean) {
    changeStatus.mutate({ status: 'contacted', comment: note || undefined })
    setContactedNoteOpen(false)
    if (thenScheduleVisit) setSiteVisitOpen(true)
  }

  // Load conversation list to allow swiping to previous/next chats
  const { data: convData } = useQuery({
    queryKey: ['wa-conversations-nav'],
    queryFn: () => whatsappApi.conversations({ limit: 100 }),
    staleTime: 30_000,
  })

  const convList = convData?.list ?? []
  const currentDigits = normalizeDigits(phone)

  const currentIndex = useMemo(() => {
    if (!convList.length || !phone) return -1
    return convList.findIndex((c) => {
      const p1 = normalizeDigits(c.phone)
      const p2 = normalizeDigits(c.phoneNormalized)
      return p1 === currentDigits || p2 === currentDigits || c.phone === phone || c.phoneNormalized === phone
    })
  }, [convList, phone, currentDigits])

  const prevConv = currentIndex > 0 ? convList[currentIndex - 1] : null
  const nextConv = currentIndex >= 0 && currentIndex < convList.length - 1 ? convList[currentIndex + 1] : null

  const prevName = prevConv ? getConvDisplayName(prevConv) : ''
  const nextName = nextConv ? getConvDisplayName(nextConv) : ''

  const goToPrevChat = () => {
    if (!prevConv) return
    const target = getConvParams(prevConv)
    router.replace({ pathname: '/whatsapp/[phone]', params: target })
  }

  const goToNextChat = () => {
    if (!nextConv) return
    const target = getConvParams(nextConv)
    router.replace({ pathname: '/whatsapp/[phone]', params: target })
  }

  const panX = useRef(new Animated.Value(0)).current
  const [swipeDir, setSwipeDir] = useState<'prev' | 'next' | null>(null)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Capture horizontal swipe when moving sideways more than vertically
        return (
          Math.abs(gestureState.dx) > 16 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
        )
      },
      onPanResponderMove: (_, gestureState) => {
        panX.setValue(gestureState.dx)
        if (gestureState.dx > 25 && prevConv) {
          setSwipeDir('prev')
        } else if (gestureState.dx < -25 && nextConv) {
          setSwipeDir('next')
        } else {
          setSwipeDir(null)
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > SWIPE_NAV_THRESHOLD && prevConv) {
          // Swiped Right -> Go to Previous Chat
          Animated.timing(panX, {
            toValue: SCREEN_WIDTH,
            duration: 160,
            useNativeDriver: true,
          }).start(() => {
            panX.setValue(0)
            setSwipeDir(null)
            goToPrevChat()
          })
        } else if (gestureState.dx < -SWIPE_NAV_THRESHOLD && nextConv) {
          // Swiped Left -> Go to Next Chat
          Animated.timing(panX, {
            toValue: -SCREEN_WIDTH,
            duration: 160,
            useNativeDriver: true,
          }).start(() => {
            panX.setValue(0)
            setSwipeDir(null)
            goToNextChat()
          })
        } else {
          // Reset
          Animated.spring(panX, {
            toValue: 0,
            friction: 7,
            tension: 40,
            useNativeDriver: true,
          }).start(() => {
            setSwipeDir(null)
          })
        }
      },
    })
  ).current

  useEffect(() => {
    if (!phone || messages.length === 0) return
    const last = messages[messages.length - 1]
    markSeen(phone, last.occurredAt)
  }, [phone, messages])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['wa-messages', phone] })

  const sendText = useMutation({
    mutationFn: (body: string) => whatsappApi.send(phone, body),
    onSuccess: () => { setDraft(''); setSendErr(''); invalidate(); clearFollowUpIfDue(); autoMarkContactAttempted() },
    onError: (e) => setSendErr(apiError(e)),
  })

  const sendMedia = useMutation({
    mutationFn: (payload: PendingMedia & { caption: string }) => {
      setUploadPct(0)
      return whatsappApi.sendMedia(phone, payload, payload.caption, setUploadPct)
    },
    onSuccess: () => { setDraft(''); setPendingMedia(null); setUploadPct(null); setSendErr(''); invalidate(); clearFollowUpIfDue(); autoMarkContactAttempted() },
    onError: (e) => { setUploadPct(null); setSendErr(apiError(e)) },
  })

  const sendQuickReply = useMutation({
    mutationFn: (templateId: string) => whatsappApi.sendQuickReply(phone, templateId),
    onSuccess: () => { invalidate(); clearFollowUpIfDue(); autoMarkContactAttempted() },
    onError: (e) => setSendErr(apiError(e)),
  })

  const deleteMessage = useMutation({
    mutationFn: (id: string) => whatsappApi.deleteMessage(id),
    onSuccess: invalidate,
    onError: (e) => notify('Could not delete', apiError(e)),
  })
  const confirmDeleteMessage = useCallback((id: string) => {
    confirmAction(
      'Delete this message?',
      'WhatsApp gives businesses no way to unsend a message — the customer will still have it on their phone. This only removes it from our own record.',
      'Delete',
      () => deleteMessage.mutate(id),
      { destructive: true },
    )
  }, [deleteMessage])

  const sending = sendText.isPending || sendMedia.isPending
  const hasMoreHistory = messages.length >= messageLimit

  const loadMoreHistory = useCallback(() => {
    if (!hasMoreHistory || loadingMore) return
    setLoadingMore(true)
    setMessageLimit((n) => n + 60)
  }, [hasMoreHistory, loadingMore])

  const renderMessageItem = useCallback(
    ({ item }: { item: WhatsAppMsg }) => <MemoizedMessageBubble msg={item} onDelete={confirmDeleteMessage} />,
    [confirmDeleteMessage]
  )

  function handleSend() {
    if (sending) return
    if (pendingMedia) {
      sendMedia.mutate({ ...pendingMedia, caption: draft.trim() })
      return
    }
    const body = draft.trim()
    if (!body) return
    sendText.mutate(body)
  }

  async function startRecording() {
    const perm = await requestRecordingPermissionsAsync()
    if (!perm.granted) { notify('Microphone access needed', 'Allow microphone access to record a voice message.'); return }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
    await recorder.prepareToRecordAsync()
    recorder.record()
  }

  async function stopRecording(send: boolean) {
    await recorder.stop()
    const uri = recorder.uri
    if (send && uri) {
      setPendingMedia({ uri, name: `voice-${Date.now()}.m4a`, mimeType: 'audio/m4a', kind: 'audio' })
    }
  }

  async function launchPicker(source: 'library' | 'camera') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return

    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images', 'videos'], quality: 0.8 }
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
    if (result.canceled || !result.assets?.[0]) return

    const asset = result.assets[0]
    const kind: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image'
    setPendingMedia({
      uri: asset.uri,
      name: asset.fileName || `upload-${Date.now()}.${kind === 'video' ? 'mp4' : 'jpg'}`,
      mimeType: asset.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind,
    })
  }

  function pickMedia() {
    // Alert.alert's multi-button action sheet is a no-op on web (react-native-web
    // stubs it out entirely), and a native camera capture sheet doesn't really
    // exist on web either — so web goes straight to the one picker that works
    // everywhere, the library/file picker.
    if (Platform.OS === 'web') { launchPicker('library'); return }
    Alert.alert('Attach', undefined, [
      { text: 'Photo Library', onPress: () => launchPicker('library') },
      { text: 'Camera', onPress: () => launchPicker('camera') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const meta = lead ? statusMeta(lead.status) : null

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ backgroundColor: COLORS.purple600 }}>
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
            <PressableScale
              onPress={() => {
                if (router.canGoBack()) {
                  router.back()
                } else {
                  router.replace('/whatsapp')
                }
              }}
              style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-back" size={18} color="#fff" />
            </PressableScale>
            <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONTS.display, fontSize: 15, color: '#fff' }}>{(name || phone || '?').slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: '#fff' }}>{name || phone}</Text>
              <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: FONTS.body, fontSize: 11, color: 'rgba(255,255,255,0.8)', fontVariant: ['tabular-nums'] }}>{phone}</Text>
            </View>
            <PressableScale onPress={() => Linking.openURL(`tel:${phone}`)} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="call-outline" size={16} color="#fff" />
            </PressableScale>
            {!!leadId && (
              <PressableScale onPress={() => setScoreOpen(true)} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={16} color="#fff" />
              </PressableScale>
            )}
          </View>

          {/* Swipe / Next-Prev Chat Quick Bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 12, paddingVertical: 5, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' }}>
            <PressableScale
              disabled={!prevConv}
              onPress={goToPrevChat}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, backgroundColor: prevConv ? 'rgba(255,255,255,0.15)' : 'transparent', opacity: prevConv ? 1 : 0.4 }}
            >
              <Ionicons name="chevron-back" size={14} color="#fff" />
              <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: '#fff', maxWidth: 90 }}>
                {prevConv ? prevName : 'First chat'}
              </Text>
            </PressableScale>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="swap-horizontal" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: 'rgba(255,255,255,0.85)' }}>
                {currentIndex >= 0 ? `${currentIndex + 1} of ${convList.length}` : 'Swipe to switch'}
              </Text>
            </View>

            <PressableScale
              disabled={!nextConv}
              onPress={goToNextChat}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, backgroundColor: nextConv ? 'rgba(255,255,255,0.15)' : 'transparent', opacity: nextConv ? 1 : 0.4 }}
            >
              <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: '#fff', maxWidth: 90 }}>
                {nextConv ? nextName : 'Last chat'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </PressableScale>
          </View>
        </SafeAreaView>
      </View>

      {!!leadId && lead && meta && (
        <View style={{ width: '100%', gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingHorizontal: 12, paddingVertical: 9 }}>
          <View style={{ width: '100%', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <PressableScale
              onPress={() => setStatusOpen(true)}
              style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11 }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.dot }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink4 }}>Status</Text>
                <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.ink }}>{meta.label}</Text>
              </View>
            </PressableScale>
            <PressableScale
              onPress={() => setFollowUpOpen(true)}
              style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(91,43,201,0.2)', backgroundColor: COLORS.purple50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11 }}
            >
              <Ionicons name="calendar-outline" size={15} color={COLORS.purple600} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.purple400 }}>Follow-up</Text>
                <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: FONTS.bodyBold, fontSize: 12.5, color: COLORS.purple600 }}>
                  {lead.followUpAt ? new Date(lead.followUpAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) : 'Set date'}
                </Text>
              </View>
            </PressableScale>
          </View>
          <PressableScale
            onPress={() => setUnitSizeOpen(true)}
            style={{ height: 38, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11 }}
          >
            <Ionicons name="cube-outline" size={15} color={COLORS.ink3} />
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink4 }}>Unit</Text>
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink }}>
              {lead.storageSizeValue > 0
                ? `${lead.storageSizeValue} sqft · ${lead.durationValue} ${lead.durationUnit}${lead.durationValue === 1 ? '' : 's'}`
                : 'Not set — tap to add'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.faint} />
          </PressableScale>
          {isAdmin && (
            <PressableScale
              onPress={() => setOwnerOpen(true)}
              style={{ height: 38, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11 }}
            >
              <Ionicons name="person-outline" size={15} color={COLORS.ink3} />
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase', color: COLORS.ink4 }}>Owner</Text>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.ink }}>
                {lead.owner?.name || 'Unassigned — tap to assign'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.faint} />
            </PressableScale>
          )}
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#F6F0E4' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <Animated.View
          {...panResponder.panHandlers}
          style={{ flex: 1, transform: [{ translateX: panX }] }}
        >
          {/* Visual Swipe Direction Prompts */}
          {swipeDir === 'prev' && prevConv && (
            <View style={{ position: 'absolute', top: 12, left: 16, zIndex: 10, backgroundColor: COLORS.success, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}>
              <Ionicons name="arrow-back" size={14} color="#fff" />
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: '#fff' }}>Previous: {prevName}</Text>
            </View>
          )}

          {swipeDir === 'next' && nextConv && (
            <View style={{ position: 'absolute', top: 12, right: 16, zIndex: 10, backgroundColor: COLORS.purple600, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: '#fff' }}>Next: {nextName}</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </View>
          )}

          {isLoading && messages.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={COLORS.brand} />
            </View>
          ) : (
            <FlatList
              // The server already returns newest-first (occurredAt: -1), which
              // is exactly what an inverted list wants — data[0] renders at the
              // bottom (what you see on open), data[last] at the top (oldest,
              // reached by scrolling up). Reversing it here was flipping that:
              // the customer's first message rendered at the bottom instead of
              // the top.
              data={messages}
              keyExtractor={(m) => m._id}
              inverted
              contentContainerStyle={{ padding: 12, gap: 8 }}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={true}
              renderItem={renderMessageItem}
              // Inverted flips "end" to mean the far side of the data array —
              // data[last] is the oldest message and renders at the visual
              // top, so reaching it is exactly "scrolled up for history".
              onEndReached={loadMoreHistory}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator style={{ paddingVertical: 12 }} color={COLORS.brand} />
                ) : null
              }
            />
          )}
        </Animated.View>

        {!!sendErr && (
          <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.bad, paddingHorizontal: 16, paddingTop: 4 }}>{sendErr}</Text>
        )}

        {pendingMedia && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8 }}>
            {pendingMedia.kind === 'image' ? (
              <Image source={{ uri: pendingMedia.uri }} style={{ width: 48, height: 48, borderRadius: 8 }} />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: 'rgba(20,8,31,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={pendingMedia.kind === 'audio' ? 'mic' : 'videocam'} size={20} color={COLORS.brandDark} />
              </View>
            )}
            <Text style={{ flex: 1, fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted }}>
              {uploadPct != null
                ? `Uploading… ${uploadPct}%`
                : pendingMedia.kind === 'audio' ? 'Voice message ready to send' : 'Ready to send — add a caption or send as-is'}
            </Text>
            {uploadPct == null && (
              <Pressable onPress={() => setPendingMedia(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={COLORS.faint} />
              </Pressable>
            )}
          </View>
        )}

        {recorderState.isRecording ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
            <PressableScale
              onPress={() => stopRecording(false)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="trash-outline" size={19} color={COLORS.bad} />
            </PressableScale>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.bad }} />
              <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13.5, color: COLORS.ink, fontVariant: ['tabular-nums'] }}>
                {formatRecordingTime(recorderState.durationMillis)}
              </Text>
            </View>
            <PressableScale
              onPress={() => stopRecording(true)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
            </PressableScale>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12 }}>
            <PressableScale
              onPress={pickMedia}
              disabled={sending}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="add" size={22} color={COLORS.brand} />
            </PressableScale>
            {!!leadId && (
              <PressableScale
                onPress={() => setQuickRepliesOpen(true)}
                disabled={sending}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="flash-outline" size={20} color={COLORS.brand} />
              </PressableScale>
            )}
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={pendingMedia ? 'Add a caption…' : 'Message'}
              placeholderTextColor={COLORS.faint}
              multiline
              style={{
                flex: 1, maxHeight: 100, backgroundColor: '#fff', borderRadius: 20,
                paddingHorizontal: 16, paddingVertical: 10, fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.ink,
              }}
            />
            {!draft.trim() && !pendingMedia ? (
              <PressableScale
                onPress={startRecording}
                disabled={sending}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="mic" size={19} color="#fff" />
              </PressableScale>
            ) : (
              <PressableScale
                onPress={handleSend}
                disabled={sending || (!draft.trim() && !pendingMedia)}
                style={{
                  width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: sending || (!draft.trim() && !pendingMedia) ? COLORS.faint : COLORS.brand,
                }}
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={17} color="#fff" />}
              </PressableScale>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {!!leadId && (
        <>
          <ScoreSheet leadId={leadId} leadName={name || phone} visible={scoreOpen} onClose={() => setScoreOpen(false)} />
          <PickerSheet
            visible={statusOpen}
            title="Change status"
            options={LEAD_STATUS_FLOW}
            selected={lead?.status}
            onSelect={(s) => {
              // Contacted is the one change worth a note — captured before
              // the status actually changes, both folded into one request.
              if (s === 'contacted') { setContactedNoteOpen(true); return }
              changeStatus.mutate({ status: s })
            }}
            onClose={() => setStatusOpen(false)}
          />
          <FollowUpSheet
            visible={followUpOpen}
            current={lead?.followUpAt}
            onSchedule={(iso) => { scheduleFollowUp.mutate(iso); setFollowUpOpen(false) }}
            onClose={() => setFollowUpOpen(false)}
          />
          <FollowUpSheet
            visible={siteVisitOpen}
            title="Schedule site visit"
            current={lead?.siteVisitAt}
            onSchedule={(iso) => { scheduleSiteVisit.mutate(iso); setSiteVisitOpen(false) }}
            onClose={() => setSiteVisitOpen(false)}
          />
          <ContactedNoteSheet
            visible={contactedNoteOpen}
            onSave={(note) => finishContacted(note, false)}
            onScheduleVisit={(note) => finishContacted(note, true)}
            onClose={() => setContactedNoteOpen(false)}
          />
          <QuickRepliesSheet
            visible={quickRepliesOpen}
            onSelect={(t: MessageTemplate) => sendQuickReply.mutate(t._id)}
            onClose={() => setQuickRepliesOpen(false)}
          />
          {!!lead && (
            <UnitSizeSheet
              visible={unitSizeOpen}
              storageSizeValue={lead.storageSizeValue}
              durationValue={lead.durationValue}
              durationUnit={lead.durationUnit}
              onSave={(v) => updateUnitSize.mutate(v)}
              onClose={() => setUnitSizeOpen(false)}
            />
          )}
          {isAdmin && (
            <PickerSheet
              visible={ownerOpen}
              title="Assign to"
              options={[{ value: '', label: 'Unassigned' }, ...reps.map((u) => ({ value: u._id, label: u.name || u.email }))]}
              selected={lead?.owner?._id ?? ''}
              onSelect={(v) => reassign.mutate(v || null)}
              onClose={() => setOwnerOpen(false)}
            />
          )}
        </>
      )}
    </>
  )
}

const MemoizedMessageBubble = memo(function MessageBubble({ msg, onDelete }: { msg: WhatsAppMsg; onDelete: (id: string) => void }) {
  const outbound = msg.direction === 'outbound'
  // Deleting only ever applies to a message we sent, and only once — Meta
  // gives no unsend, so there's nothing left to delete a second time.
  const deletable = outbound && !msg.deletedAt
  return (
    <View style={{ alignItems: outbound ? 'flex-end' : 'flex-start' }}>
      <Pressable
        onLongPress={deletable ? () => onDelete(msg._id) : undefined}
        style={{
          maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
          backgroundColor: outbound ? '#D9FDD3' : '#fff',
          borderBottomRightRadius: outbound ? 4 : 14,
          borderBottomLeftRadius: outbound ? 14 : 4,
        }}
      >
        {msg.deletedAt ? (
          <Text style={{ fontFamily: FONTS.body, fontSize: 13, fontStyle: 'italic', color: COLORS.faint }}>This message was deleted</Text>
        ) : msg.media ? (
          <Attachment messageId={msg.messageId} media={msg.media} />
        ) : (
          <Text style={{ fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.ink }}>{msg.text}</Text>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 3 }}>
          <Text style={{ fontFamily: FONTS.body, fontSize: 10.5, color: COLORS.faint }}>{bubbleTime(msg.occurredAt)}</Text>
        </View>
      </Pressable>
    </View>
  )
})
