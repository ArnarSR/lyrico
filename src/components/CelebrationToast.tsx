import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface CelebrationToastProps {
  icon: string
  title: string
  subtitle?: string
  onDismiss: () => void
  durationMs?: number
}

/**
 * Fullscreen-edge celebration toast. Auto-dismisses after durationMs.
 * Used for daily goal reached, first-song-mastered, milestone breaks, etc.
 */
export function CelebrationToast({ icon, title, subtitle, onDismiss, durationMs = 3500 }: CelebrationToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(t)
  }, [durationMs, onDismiss])

  return createPortal((
    <div className="pointer-events-none fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[200] flex justify-center">
      <div
        className="pointer-events-auto flex max-w-md items-center gap-4 rounded-2xl border border-accent bg-bg-soft px-5 py-4 shadow-2xl"
        style={{ animation: 'lyrico-celebrate 0.6s ease-out' }}
      >
        <span className="text-3xl" style={{ animation: 'lyrico-bounce 1.2s ease-in-out infinite' }}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-base font-medium text-text">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-text-dim">{subtitle}</p>}
        </div>
      </div>
      {/* Keyframes inlined for portability */}
      <style>{`
        @keyframes lyrico-celebrate {
          0%   { opacity: 0; transform: translateY(-20px) scale(0.95); }
          60%  { opacity: 1; transform: translateY(4px) scale(1.04); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes lyrico-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  ), document.body)
}
