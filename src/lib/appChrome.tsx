import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * The drawer and notification panel are rendered once, above the tab
 * navigator, so they overlay whichever tab is active — but the button
 * that opens each one lives in every screen's own header. A context is
 * the plumbing between the two without threading callbacks through the
 * router.
 */
type AppChromeContextValue = {
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  notifOpen: boolean
  openNotifications: () => void
  closeNotifications: () => void
}

const AppChromeContext = createContext<AppChromeContextValue | null>(null)

export function useAppChrome(): AppChromeContextValue {
  const ctx = useContext(AppChromeContext)
  if (!ctx) throw new Error('useAppChrome must be used within AppChromeProvider')
  return ctx
}

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  return (
    <AppChromeContext.Provider
      value={{
        drawerOpen,
        openDrawer: () => { setNotifOpen(false); setDrawerOpen(true) },
        closeDrawer: () => setDrawerOpen(false),
        notifOpen,
        openNotifications: () => { setDrawerOpen(false); setNotifOpen((v) => !v) },
        closeNotifications: () => setNotifOpen(false),
      }}
    >
      {children}
    </AppChromeContext.Provider>
  )
}
