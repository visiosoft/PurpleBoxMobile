import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, FlatList, Pressable, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Image, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import {
  useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio'
import { whatsappApi, messageTemplateApi, type WhatsAppMsg, type MessageTemplate } from '../../../src/lib/whatsapp'
import { leadApi, type LeadStatus } from '../../../src/lib/leads'
import { LEAD_STATUS_FLOW, statusMeta } from '../../../src/lib/leadStatus'
import { apiError } from '../../../src/lib/api'
import { notify } from '../../../src/lib/alert'
import { markSeen } from '../../../src/lib/seen'
import { COLORS, FONTS } from '../../../src/lib/theme'
import Attachment from '../../../src/components/whatsapp/Attachment'
import ScoreSheet from '../../../src/components/whatsapp/ScoreSheet'
import PickerSheet from '../../../src/components/PickerSheet'
import FollowUpSheet from '../../../src/components/FollowUpSheet'
import QuickRepliesSheet from '../../../src/components/whatsapp/QuickRepliesSheet'
import PressableScale from '../../../src/components/PressableScale'

type PendingMedia = { uri: string; name: string; mimeType: string; kind: 'image' | 'video' | 'audio' }

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
  const [draft, setDraft] = useState('')
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [sendErr, setSendErr] = useState('')
  const [scoreOpen, setScoreOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false)

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
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
  })
  useEffect(() => { if (!messagesFetching) setLoadingMore(false) }, [messagesFetching])

  const { data: lead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => leadApi.get(leadId!),
    enabled: !!leadId,
  })
  const invalidateLead = () => queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
  const changeStatus = useMutation({
    mutationFn: (status: LeadStatus) => leadApi.updateStatus(leadId!, status),
    onSuccess: invalidateLead,
    onError: (e) => notify('Could not update status', apiError(e)),
  })
  const scheduleFollowUp = useMutation({
    mutationFn: (iso: string) => leadApi.scheduleFollowUp(leadId!, iso),
    onSuccess: invalidateLead,
    onError: (e) => notify('Could not schedule follow-up', apiError(e)),
  })

  useEffect(() => {
    if (!phone || messages.length === 0) return
    const last = messages[messages.length - 1]
    markSeen(phone, last.occurredAt)
  }, [phone, messages])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['wa-messages', phone] })

  const sendText = useMutation({
    mutationFn: (body: string) => whatsappApi.send(phone, body),
    onSuccess: () => { setDraft(''); setSendErr(''); invalidate() },
    onError: (e) => setSendErr(apiError(e)),
  })

  const sendMedia = useMutation({
    mutationFn: (payload: PendingMedia & { caption: string }) => {
      setUploadPct(0)
      return whatsappApi.sendMedia(phone, payload, payload.caption, setUploadPct)
    },
    onSuccess: () => { setDraft(''); setPendingMedia(null); setUploadPct(null); setSendErr(''); invalidate() },
    onError: (e) => { setUploadPct(null); setSendErr(apiError(e)) },
  })

  const sendQuickReply = useMutation({
    mutationFn: (templateId: string) => whatsappApi.sendQuickReply(phone, templateId),
    onSuccess: invalidate,
    onError: (e) => setSendErr(apiError(e)),
  })

  const sending = sendText.isPending || sendMedia.isPending
  const hasMoreHistory = messages.length >= messageLimit

  function loadMoreHistory() {
    if (!hasMoreHistory || loadingMore) return
    setLoadingMore(true)
    setMessageLimit((n) => n + 60)
  }

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 }}>
            <PressableScale onPress={() => router.back()} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
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
        </SafeAreaView>
      </View>

      {!!leadId && lead && meta && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingHorizontal: 12, paddingVertical: 9 }}>
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
      )}

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#F6F0E4' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {isLoading ? (
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
            renderItem={({ item }) => <MessageBubble msg={item} />}
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
            onSelect={(s) => changeStatus.mutate(s)}
            onClose={() => setStatusOpen(false)}
          />
          <FollowUpSheet
            visible={followUpOpen}
            current={lead?.followUpAt}
            onSchedule={(iso) => { scheduleFollowUp.mutate(iso); setFollowUpOpen(false) }}
            onClose={() => setFollowUpOpen(false)}
          />
          <QuickRepliesSheet
            visible={quickRepliesOpen}
            onSelect={(t: MessageTemplate) => sendQuickReply.mutate(t._id)}
            onClose={() => setQuickRepliesOpen(false)}
          />
        </>
      )}
    </>
  )
}

function MessageBubble({ msg }: { msg: WhatsAppMsg }) {
  const outbound = msg.direction === 'outbound'
  return (
    <View style={{ alignItems: outbound ? 'flex-end' : 'flex-start' }}>
      <View
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
      </View>
    </View>
  )
}
