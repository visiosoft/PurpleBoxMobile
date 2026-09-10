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
import { whatsappApi, type WhatsAppMsg } from '../../../src/lib/whatsapp'
import { leadApi, type LeadStatus } from '../../../src/lib/leads'
import { LEAD_STATUS_FLOW, statusMeta } from '../../../src/lib/leadStatus'
import { apiError } from '../../../src/lib/api'
import { markSeen } from '../../../src/lib/seen'
import { COLORS, FONTS } from '../../../src/lib/theme'
import Attachment from '../../../src/components/whatsapp/Attachment'
import ScoreSheet from '../../../src/components/whatsapp/ScoreSheet'
import PickerSheet from '../../../src/components/PickerSheet'
import FollowUpSheet from '../../../src/components/FollowUpSheet'
import PressableScale from '../../../src/components/PressableScale'

type PendingMedia = { uri: string; name: string; mimeType: string; kind: 'image' | 'video' }

function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
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

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['wa-messages', phone],
    queryFn: () => whatsappApi.messages(phone),
    enabled: !!phone,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })

  const { data: lead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => leadApi.get(leadId!),
    enabled: !!leadId,
  })
  const invalidateLead = () => queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
  const changeStatus = useMutation({
    mutationFn: (status: LeadStatus) => leadApi.updateStatus(leadId!, status),
    onSuccess: invalidateLead,
    onError: (e) => Alert.alert('Could not update status', apiError(e)),
  })
  const scheduleFollowUp = useMutation({
    mutationFn: (iso: string) => leadApi.scheduleFollowUp(leadId!, iso),
    onSuccess: invalidateLead,
    onError: (e) => Alert.alert('Could not schedule follow-up', apiError(e)),
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

  const sending = sendText.isPending || sendMedia.isPending

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={COLORS.brand} />
          </View>
        ) : (
          <FlatList
            data={[...messages].reverse()}
            keyExtractor={(m) => m._id}
            inverted
            contentContainerStyle={{ padding: 12, gap: 8 }}
            renderItem={({ item }) => <MessageBubble msg={item} />}
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
                <Ionicons name="videocam" size={20} color={COLORS.brandDark} />
              </View>
            )}
            <Text style={{ flex: 1, fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted }}>
              {uploadPct != null ? `Uploading… ${uploadPct}%` : 'Ready to send — add a caption or send as-is'}
            </Text>
            {uploadPct == null && (
              <Pressable onPress={() => setPendingMedia(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={COLORS.faint} />
              </Pressable>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12 }}>
          <PressableScale
            onPress={pickMedia}
            disabled={sending}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="add" size={22} color={COLORS.brand} />
          </PressableScale>
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
        </View>
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
