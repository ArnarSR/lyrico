import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      // Re-check every 30 minutes for a new SW
      if (reg) setInterval(() => { reg.update() }, 30 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex w-full max-w-[520px] items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-bg-soft px-4 py-3 shadow-2xl">
        <div className="min-w-0">
          <p className="text-sm text-text">A new version is available</p>
          <p className="truncate text-xs text-text-dim">Reload to get the latest updates.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="rounded-full px-3 py-1.5 text-xs text-text-dim hover:text-text"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="rounded-full border border-accent bg-accent/15 px-4 py-1.5 text-sm text-accent hover:bg-accent/25"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}
