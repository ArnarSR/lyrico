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
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-end justify-center">
      {/* Dim overlay */}
      <div className="pointer-events-auto absolute inset-0 bg-black/50" onClick={() => setNeedRefresh(false)} />

      {/* Sheet */}
      <div className="pointer-events-auto relative z-10 w-full max-w-[520px] rounded-t-3xl border-t border-accent/30 bg-bg-soft px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl">
        <div className="mb-5 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/20 text-2xl">
            🎵
          </div>
          <div>
            <p className="text-base font-semibold text-text">Lyrico has been updated</p>
            <p className="mt-0.5 text-sm text-text-dim">Reload now to get the latest version. Your data is safe.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="w-full rounded-full border border-accent bg-accent py-3 text-base font-medium text-bg hover:brightness-110"
        >
          Reload now
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="mt-3 w-full rounded-full py-2.5 text-sm text-text-dim hover:text-text"
        >
          Later
        </button>
      </div>
    </div>
  )
}
