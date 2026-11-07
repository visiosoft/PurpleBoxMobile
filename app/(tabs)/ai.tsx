import { useEffect, useState } from 'react'
import { Linking } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../src/lib/auth'
import AskChat from '../../src/components/ask/AskChat'

/**
 * The app's first page: the AI box and one big Talk button. The old
 * dashboard (Home for a rep, Today for an admin) is a tap away.
 *
 * The home-screen widget opens it as purplebox://ai?talk=1 (start talking at
 * once) or ?type=1 (cursor in the box). A widget tap while the page is already
 * open comes in as a link event, counted so the same link works every time.
 */
export default function AiHome() {
  const router = useRouter()
  const { user } = useAuth()
  const params = useLocalSearchParams<{ talk?: string; type?: string }>()
  const [bump, setBump] = useState({ talk: 0, type: 0 })

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (/[?&]talk=/.test(url)) setBump((b) => ({ ...b, talk: b.talk + 1 }))
      else if (/[?&]type=/.test(url)) setBump((b) => ({ ...b, type: b.type + 1 }))
    })
    return () => sub.remove()
  }, [])

  const talkKey = params.talk || bump.talk ? `${params.talk || ''}:${bump.talk}` : ''
  const typeKey = params.type || bump.type ? `${params.type || ''}:${bump.type}` : ''

  return (
    <AskChat
      variant="home"
      startFresh
      talkNonce={talkKey}
      typeNonce={typeKey}
      onDashboard={() => router.push(user?.role === 'admin' ? '/overview' : '/home')}
    />
  )
}
