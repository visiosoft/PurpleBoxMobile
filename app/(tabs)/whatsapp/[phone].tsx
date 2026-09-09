import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, FlatList, Pressable, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native'
import { useLocalSearchParams, Stack } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { whatsappApi, type WhatsAppMsg } from '../../../src/lib/whatsapp'
import { apiError } from '../../../src/lib/api'
import { markSeen } from '../../../src/lib/seen'
import { COLORS, FONTS } from '../../../src/lib/theme'
import Attachment from '../../../src/components/whatsapp/Attachment'
import ScoreSheet from '../../../src/components/whatsapp/ScoreSheet'

type PendingMedia = { uri: string; name: string; mimeType: string; kind: 'image' | 'video' }

function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function ChatThreadScreen() {
  const { phone, name, leadId } = useLocalSearchParams<{ phone: string; name?: string; leadId?: string }>()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [sendErr, setSendErr] = useState('')
  const [scoreOpen, setScoreOpen] = useState(false)

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['wa-messages', phone],
    queryFn: () => whatsappApi.messages(phone),
    enabled: !!phone,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
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

  return (
    <>
      <Stack.Screen
        options={{
          title: name || phone,
          headerRight: leadId
            ? () => (
              <Pressable onPress={() => setScoreOpen(true)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="sparkles" size={18} color={COLORS.brand} />
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.brand }}>Score</Text>
              </Pressable>
            )
            : undefined,
        }}
      />

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
          <Pressable
            onPress={pickMedia}
            disabled={sending}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="add" size={22} color={COLORS.brand} />
          </Pressable>
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
          <Pressable
            onPress={handleSend}
            disabled={sending || (!draft.trim() && !pendingMedia)}
            style={{
              width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
              backgroundColor: sending || (!draft.trim() && !pendingMedia) ? COLORS.faint : COLORS.brand,
            }}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={17} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {!!leadId && (
        <ScoreSheet leadId={leadId} leadName={name || phone} visible={scoreOpen} onClose={() => setScoreOpen(false)} />
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
