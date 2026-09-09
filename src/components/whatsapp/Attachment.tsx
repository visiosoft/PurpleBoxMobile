import { useEffect, useState } from 'react'
import { View, Text, Image, Pressable, ActivityIndicator, Linking } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { Ionicons } from '@expo/vector-icons'
import { loadMediaUri } from '../../lib/media'
import { COLORS, FONTS } from '../../lib/theme'
import type { WaMedia } from '../../lib/whatsapp'

/** Renders whatever a WhatsApp message attached — image, video, voice note,
 *  or document — the same four kinds the web console's chat handles.
 *  `media.link` (a hosted-video watch link) needs no fetch; everything else
 *  comes back from Meta through our own authenticated media proxy, cached
 *  to a local file by loadMediaUri so scrolling and polling never refetch
 *  it. */
export default function Attachment({ messageId, media }: { messageId: string; media: WaMedia }) {
  const [uri, setUri] = useState<string | null>(media.link || null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (media.link) { setUri(media.link); return }
    let alive = true
    loadMediaUri(messageId, media.mimeType)
      .then((u) => { if (alive) setUri(u) })
      .catch(() => { if (alive) setError('Attachment unavailable') })
    return () => { alive = false }
  }, [messageId, media.link, media.mimeType])

  if (error) {
    return <Text style={{ fontFamily: FONTS.body, fontSize: 12, fontStyle: 'italic', color: COLORS.muted }}>{error}</Text>
  }

  if (!uri) {
    return (
      <View style={{ width: 200, height: 130, borderRadius: 12, backgroundColor: 'rgba(20,8,31,0.06)', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    )
  }

  if (media.kind === 'image' || media.kind === 'sticker') {
    return <Image source={{ uri }} style={{ width: 220, height: 220, borderRadius: 12 }} resizeMode="cover" />
  }
  if (media.kind === 'video') {
    return <VideoBubble uri={uri} />
  }
  if (media.kind === 'audio' || media.kind === 'voice') {
    return <AudioBubble uri={uri} />
  }
  return (
    <Pressable
      onPress={() => Linking.openURL(uri)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(20,8,31,0.05)', borderRadius: 10, padding: 10, minWidth: 180 }}
    >
      <Ionicons name="document-text-outline" size={22} color={COLORS.brandDark} />
      <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.ink, flexShrink: 1 }} numberOfLines={1}>
        {media.filename || 'Document'}
      </Text>
    </Pressable>
  )
}

function VideoBubble({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri)
  return (
    <VideoView
      player={player}
      style={{ width: 240, height: 240, borderRadius: 12, backgroundColor: '#000' }}
      nativeControls
      contentFit="cover"
    />
  )
}

function AudioBubble({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri)
  const status = useAudioPlayerStatus(player)

  return (
    <Pressable
      onPress={() => {
        if (status.playing) { player.pause(); return }
        if (status.didJustFinish) player.seekTo(0)
        player.play()
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 170, paddingVertical: 2 }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={16} color="#fff" />
      </View>
      <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted }}>
        {formatDuration(status.playing ? status.currentTime : status.duration)}
      </Text>
    </Pressable>
  )
}

function formatDuration(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
