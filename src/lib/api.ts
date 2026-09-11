import axios from 'axios'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

/**
 * The same API the web app talks to — api.purplebox.ae. Nothing here is a
 * separate backend or a mobile-specific API surface; every endpoint below
 * already exists and is already used by client/src/lib/api.ts on the web
 * side. Reusing it verbatim is the whole point: one source of truth for
 * leads, contracts, WhatsApp, everything.
 *
 * The one real difference from the web client is where the session token
 * lives. The web app keeps it in localStorage; there is no such thing on a
 * phone, so it lives in the OS's own secure storage — Keychain on iOS,
 * Keystore on Android — via expo-secure-store, encrypted at rest and
 * private to this app.
 */
export const API_BASE_URL = 'https://api.purplebox.ae/api'

const TOKEN_KEY = 'pb_token'
const USER_KEY = 'pb_user'

async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  }
  return SecureStore.getItemAsync(key)
}

async function setStorageItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

async function deleteStorageItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}

export const api = axios.create({ baseURL: API_BASE_URL })

api.interceptors.request.use(async (config) => {
  const token = await getStorageItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** Set once at login, read by anything that needs to react to a 401 without
 *  importing the auth context directly (avoids a circular import between
 *  api.ts and auth.tsx, the same shape the web app would hit if it tried
 *  the reverse). */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) onUnauthorized?.()
    return Promise.reject(err)
  },
)

export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { error?: string } | undefined)?.error || err.message
  }
  return err instanceof Error ? err.message : 'Something went wrong'
}

export async function getStoredToken(): Promise<string | null> {
  return getStorageItem(TOKEN_KEY)
}

export async function getStoredUser<T = unknown>(): Promise<T | null> {
  const raw = await getStorageItem(USER_KEY)
  return raw ? (JSON.parse(raw) as T) : null
}

export async function storeSession(token: string, user: unknown) {
  await setStorageItem(TOKEN_KEY, token)
  await setStorageItem(USER_KEY, JSON.stringify(user))
}

export async function clearSession() {
  await deleteStorageItem(TOKEN_KEY)
  await deleteStorageItem(USER_KEY)
}
