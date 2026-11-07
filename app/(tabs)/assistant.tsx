import { useRouter } from 'expo-router'
import AskChat from '../../src/components/ask/AskChat'

/**
 * The Ask AI chat as a full screen (Profile → Assistant): the same kept chat
 * as the "Ask AI anything…" bar on every screen, carried on where it was left.
 */
export default function AssistantScreen() {
  const router = useRouter()
  return <AskChat onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
}
