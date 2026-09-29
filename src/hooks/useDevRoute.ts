import { useEffect, useState } from 'react'

/**
 * The hidden developer screen's route.
 *
 * Not linked from anywhere in the UI: reach it with the `#dev` fragment, or
 * `?dev=1` when a fragment is awkward to pass. Kept out of the component file so
 * that file only exports components, which is what React Fast Refresh needs.
 */

export const DEV_DASHBOARD_HASH = '#dev'

/** True when the URL asks for the dashboard. */
export function wantsDevDashboard(): boolean {
  try {
    if (window.location.hash === DEV_DASHBOARD_HASH) return true
    return new URLSearchParams(window.location.search).get('dev') === '1'
  } catch {
    return false
  }
}

/**
 * Watches the URL so the dashboard opens and closes with back/forward and with a
 * pasted link, rather than only on a full load.
 */
export function useDevDashboardRoute(): { open: boolean; close: () => void } {
  const [open, setOpen] = useState(wantsDevDashboard)

  useEffect(() => {
    const sync = () => setOpen(wantsDevDashboard())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  function close() {
    try {
      const url = new URL(window.location.href)
      url.hash = ''
      url.searchParams.delete('dev')
      window.history.replaceState(null, '', url.toString())
    } catch {
      // Without history access the state below is still enough to leave.
    }
    setOpen(false)
  }

  return { open, close }
}
