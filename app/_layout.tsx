import '../global.css'
import { useEffect, useState } from 'react'
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
      router.replace('/(tabs)')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, isLoading, segments.join('/')])

  return <>{children}</>
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
