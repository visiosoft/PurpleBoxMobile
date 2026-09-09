import { useState } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useAuth, apiError } from '../src/lib/auth'
import { COLORS, FONTS } from '../src/lib/theme'

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
      className="flex-1"
      style={{ backgroundColor: COLORS.paper }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-7 py-10">
          {/* Wordmark — the same brand, the same name, on a phone. */}
          <View className="items-center mb-10">
            <View
              className="w-16 h-16 rounded-[20px] items-center justify-center mb-4"
              style={{ backgroundColor: COLORS.brand }}
            >
              <Text style={{ fontFamily: FONTS.display, fontSize: 26, color: '#fff' }}>P</Text>
            </View>
            <Text style={{ fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink, letterSpacing: -0.5 }}>
              PurpleBox
            </Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.muted, marginTop: 4 }}>
              Sign in to your account
            </Text>
          </View>

          {/* Card */}
          <View
            className="rounded-3xl px-5 py-6"
            style={{ backgroundColor: '#fff', shadowColor: COLORS.ink, shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 }}
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
              className="rounded-2xl px-4 mb-4"
              style={{
                height: 50, borderWidth: 1, borderColor: COLORS.line, fontFamily: FONTS.body, fontSize: 15.5, color: COLORS.ink,
              }}
            />

            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>Password</Text>
            <View
              className="flex-row items-center rounded-2xl mb-2"
              style={{ height: 50, borderWidth: 1, borderColor: COLORS.line }}
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
                className="flex-1 px-4"
                style={{ fontFamily: FONTS.body, fontSize: 15.5, color: COLORS.ink }}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} className="px-4 py-3">
                <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.brand }}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </Pressable>
            </View>

            {error ? (
              <Text style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.bad, marginTop: 6 }}>{error}</Text>
            ) : null}

            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              className="rounded-2xl items-center justify-center mt-5"
              style={{ height: 52, backgroundColor: COLORS.brand, opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15.5, color: '#fff' }}>Sign in</Text>
              )}
            </Pressable>
          </View>

          <Text style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.faint, textAlign: 'center', marginTop: 20 }}>
            Same account as office.purplebox.ae
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
