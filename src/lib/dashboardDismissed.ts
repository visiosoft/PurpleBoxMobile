import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = '@pb_dashboard_dismissed_v2'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

type DismissedEntry = {
    id: string
    dismissedAt: number
}

let inMemoryCache: Set<string> | null = null
const listeners = new Set<(dismissedIds: Set<string>) => void>()

function notifyListeners() {
    if (!inMemoryCache) return
    const copy = new Set(inMemoryCache)
    listeners.forEach((listener) => listener(copy))
}

async function loadDismissedFromStorage(): Promise<Set<string>> {
    if (inMemoryCache) return inMemoryCache

    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (!raw) {
            inMemoryCache = new Set<string>()
            return inMemoryCache
        }

        const entries: DismissedEntry[] = JSON.parse(raw)
        const now = Date.now()
        const validEntries = entries.filter((e) => now - e.dismissedAt < SEVEN_DAYS_MS)

        inMemoryCache = new Set<string>(validEntries.map((e) => e.id))

        // If any old records were purged, persist the cleaned list
        if (validEntries.length !== entries.length) {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(validEntries))
        }
    } catch (err) {
        console.error('Failed to load dashboard dismissed items:', err)
        inMemoryCache = new Set<string>()
    }

    return inMemoryCache
}

async function persistCache(): Promise<void> {
    if (!inMemoryCache) return
    try {
        const entries: DismissedEntry[] = Array.from(inMemoryCache).map((id) => ({
            id,
            dismissedAt: Date.now(),
        }))
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch (err) {
        console.error('Failed to persist dashboard dismissed items:', err)
    }
}

export async function dismissDashboardItem(id: string): Promise<void> {
    await loadDismissedFromStorage()
    if (!inMemoryCache) inMemoryCache = new Set<string>()
    inMemoryCache.add(id)
    notifyListeners()
    await persistCache()
}

export async function restoreDashboardItem(id: string): Promise<void> {
    await loadDismissedFromStorage()
    if (!inMemoryCache) return
    inMemoryCache.delete(id)
    notifyListeners()
    await persistCache()
}

export async function clearAllDashboardDismissed(): Promise<void> {
    inMemoryCache = new Set<string>()
    notifyListeners()
    try {
        await AsyncStorage.removeItem(STORAGE_KEY)
    } catch (err) {
        console.error('Failed to clear dashboard dismissed items:', err)
    }
}

export function useDashboardDismissed() {
    const [dismissedSet, setDismissedSet] = useState<Set<string>>(inMemoryCache ?? new Set<string>())
    const [isLoaded, setIsLoaded] = useState(inMemoryCache !== null)

    useEffect(() => {
        let mounted = true
        loadDismissedFromStorage().then((set) => {
            if (mounted) {
                setDismissedSet(new Set(set))
                setIsLoaded(true)
            }
        })

        const listener = (newSet: Set<string>) => {
            if (mounted) {
                setDismissedSet(newSet)
            }
        }

        listeners.add(listener)
        return () => {
            mounted = false
            listeners.delete(listener)
        }
    }, [])

    const dismiss = useCallback(async (id: string) => {
        await dismissDashboardItem(id)
    }, [])

    const restore = useCallback(async (id: string) => {
        await restoreDashboardItem(id)
    }, [])

    const clearAll = useCallback(async () => {
        await clearAllDashboardDismissed()
    }, [])

    return {
        dismissedSet,
        isLoaded,
        dismiss,
        restore,
        clearAll,
    }
}
