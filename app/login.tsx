import { useState } from 'react'
import { View, Text, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useAuth, apiError } from '../src/lib/auth'
import { COLORS, FONTS, HERO_GRADIENT } from '../src/lib/theme'
import PressableScale from '../src/components/PressableScale'

/**
 * The same account as the web app — same email, same password, same
 * server/src/routes/auth.js endpoint. There is no separate mobile account
 * system to keep in sync: whoever can sign into office.purplebox.ae can
 * sign in here.
 */
export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await login(email.trim().toLowerCase(), password)
      // RootLayout's RouteGuard takes it from here once isSignedIn flips.
    } catch (e) {
      setError(apiError(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.paper }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* Hero — the one place the brand gets to fill the screen, so the
            app announces itself before it asks for anything. */}
        <LinearGradient
          colors={HERO_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ alignItems: 'center', paddingTop: 76, paddingBottom: 60, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}
        >
          <View
            style={{
              width: 76, height: 76, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
              shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
            }}
          >
            <Text style={{ fontFamily: FONTS.display, fontSize: 32, color: COLORS.brandDark }}>P</Text>
          </View>
          <Text style={{ fontFamily: FONTS.display, fontSize: 28, color: '#fff', letterSpacing: -0.6 }}>PurpleBox</Text>
          <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>
            Sign in to your account
          </Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, marginTop: -30, paddingBottom: 30, flex: 1 }}>
          {/* Card floats up over the hero's curved edge. */}
          <View
            style={{ backgroundColor: '#fff', borderRadius: 26, padding: 22, shadowColor: COLORS.ink, shadowOpacity: 0.1, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 5 }}
          >
            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@purplebox.ae"
              placeholderTextColor={COLORS.faint}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!submitting}
              style={{
                height: 50, borderRadius: 16, paddingHorizontal: 16, marginBottom: 14,
                backgroundColor: COLORS.paper, fontFamily: FONTS.body, fontSize: 15.5, color: COLORS.ink,
              }}
            />

            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>Password</Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, marginBottom: 4, backgroundColor: COLORS.paper }}
            >
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={COLORS.faint}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                editable={!submitting}
                onSubmitEditing={onSubmit}
                style={{ flex: 1, height: 50, paddingHorizontal: 16, fontFamily: FONTS.body, fontSize: 15.5, color: COLORS.ink }}
              />
              <PressableScale onPress={() => setShowPassword((v) => !v)} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.brand }}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </PressableScale>
            </View>

            {error ? (
              <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.bad, marginTop: 10 }}>{error}</Text>
            ) : null}

            <PressableScale
              onPress={onSubmit}
              disabled={submitting}
              style={{
                height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 20,
                backgroundColor: COLORS.brand, opacity: submitting ? 0.7 : 1,
                shadowColor: COLORS.brandDark, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3,
              }}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15.5, color: '#fff' }}>Sign in</Text>
              )}
            </PressableScale>
          </View>

          <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.faint, textAlign: 'center', marginTop: 22 }}>
            Same account as office.purplebox.ae
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
