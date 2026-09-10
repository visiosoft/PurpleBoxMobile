import '../global.css'
import { useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts as useBricolage, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque'
import {
  useFonts as useJakarta,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { AuthProvider, useAuth } from '../src/lib/auth'
import {
  registerForPushNotificationsAsync,
  addTokenRefreshListener,
  wireNotificationListeners,
  refreshBadgeFromServer,
  unregisterCurrentPushToken,
} from '../src/lib/pushNotifications'

SplashScreen.preventAutoHideAsync().catch(() => {})

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

/**
 * Every screen behind the login wall lives under (tabs); every screen in
 * front of it does not. This is the one place that decides which side of
 * the wall the person currently belongs on, and moves them there the
 * moment auth state actually changes — not just on first load, so signing
 * out from deep inside a tab still lands back on the login screen rather
 * than an authenticated-looking blank one.
 */
function RouteGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    const inAuthGroup = segments[0] === '(tabs)'
    if (!isSignedIn && inAuthGroup) {
      router.replace('/login')
    } else if (isSignedIn && !inAuthGroup) {
      router.replace('/whatsapp')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, isLoading, segments.join('/')])

  return <>{children}</>
}

/**
 * Lead-assignment push, wired once here rather than in any individual
 * screen — a notification can be tapped from a completely cold start, before
 * any tab has mounted, and the token/badge upkeep below has nothing to do
 * with which screen happens to be on top.
 *
 * Gated on `isSignedIn`: the registration endpoint is authenticated, and a
 * token belonging to whoever just signed out should stop being useful to
 * them immediately rather than at their next reply.
 */
function PushIntegration() {
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const wasSignedIn = useRef(false)

  // Tap handling, and remembering which delivered notification belongs to
  // which lead so a later silent push can clear it — both apply regardless
  // of auth state; RouteGuard above already sends a signed-out tap to
  // /login instead of the thread it named.
  useEffect(() => wireNotificationListeners(router), [router])

  useEffect(() => {
    if (isSignedIn && !wasSignedIn.current) {
      registerForPushNotificationsAsync()
      refreshBadgeFromServer()
    } else if (!isSignedIn && wasSignedIn.current) {
      unregisterCurrentPushToken()
    }
    wasSignedIn.current = isSignedIn
  }, [isSignedIn])

  useEffect(() => {
    if (!isSignedIn) return undefined
    const sub = addTokenRefreshListener()
    return () => sub.remove()
  }, [isSignedIn])

  // The one thing that can never go stale: whatever a push tray does or
  // does not still show, the badge itself is re-read from the server the
  // moment somebody actually opens the app.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active' && isSignedIn) refreshBadgeFromServer()
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [isSignedIn])

  return null
}

export default function RootLayout() {
  const [bricolageLoaded] = useBricolage({ BricolageGrotesque_700Bold })
  const [jakartaLoaded] = useJakarta({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_700Bold })
  const fontsLoaded = bricolageLoaded && jakartaLoaded
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    if (fontsLoaded) {
      setAppReady(true)
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [fontsLoaded])

  if (!appReady) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouteGuard>
              <PushIntegration />
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="login" />
                <Stack.Screen name="(tabs)" />
              </Stack>
            </RouteGuard>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
