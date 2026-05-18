import type { ReactNode } from 'react'

interface ShellProps {
  children: ReactNode
}

/** App frame: centered, mobile-first column capped at 560px. */
export function Shell({ children, bottomPad = false }: ShellProps & { bottomPad?: boolean }) {
  return (
    <div className="min-h-svh bg-bg text-text">
      <div className={`mx-auto flex min-h-svh w-full max-w-[560px] flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] ${bottomPad ? 'pb-24' : 'pb-10'}`}>
        {children}
      </div>
    </div>
  )
}

export function Header({
  title,
  subtitle,
  left,
  right,
}: {
  title: string
  subtitle?: string
  left?: ReactNode
  right?: ReactNode
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {left}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-normal tracking-wide text-accent">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 truncate text-sm text-text-dim">{subtitle}</p>
          )}
        </div>
      </div>
      {right}
    </header>
  )
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-soft text-text-dim transition-colors hover:text-accent active:bg-bg-card"
    >
      {children}
    </button>
  )
}
