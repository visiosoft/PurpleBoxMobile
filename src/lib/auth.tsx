import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  api, apiError, getStoredToken, getStoredUser, storeSession, clearSession, setUnauthorizedHandler,
} from './api'

/** Matches server/src/routes/auth.js's login response exactly — this is the
 *  same account system the web app uses, same roles, same permissions. */
export interface PbUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'sales_rep' | 'accounts' | 'staff'
  permissions: string[]
  isActive: boolean
}

interface AuthState {
  user: PbUser | null
  token: string | null
  isLoading: boolean
  isSignedIn: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PbUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore whatever was in Secure Store from a previous launch, so opening
  // the app is not a login screen every single time.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [storedToken, storedUser] = await Promise.all([getStoredToken(), getStoredUser<PbUser>()])
      if (!alive) return
      if (storedToken && storedUser) {
        setToken(storedToken)
        setUser(storedUser)
      }
      setIsLoading(false)
    })()
    return () => { alive = false }
  }, [])

  // A 401 from anywhere in the app means the session is no longer good —
  // signed in elsewhere and this token was revoked, or it simply expired.
  // Dropped back to the login screen rather than left showing a broken
  // authenticated view that every request from here on will just fail.
  useEffect(() => {
    setUnauthorizedHandler(() => { logout() })
    return () => setUnauthorizedHandler(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password })
    await storeSession(data.token, data.user)
    setToken(data.token)
    setUser(data.user)
  }

  async function logout() {
    await clearSession()
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isSignedIn: Boolean(token && user), login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export { apiError }
