import type { ReactNode } from 'react'

interface ShellProps {
  children: ReactNode
}

/** App frame: centered, mobile-first column capped at 560px. */
export function Shell({ children, bottomPad = false }: ShellProps & { bottomPad?: boolean }) {
  return (
    <div className="min-h-svh bg-bg text-text">
      <div className={`mx-auto flex min-h-svh w-full max-w-[560px] flex-col px-5 pt-[var(--pad-top)] ${bottomPad ? 'pb-24' : 'pb-10'}`}>
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
      <div className="flex min-w-0 flex-1 items-start gap-2">
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
      {/* shrink-0: a long title must truncate, never squeeze the actions. */}
      {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </header>
  )
}

/**
 * The one search box in the app. Everywhere a singer looks for a song — the
 * library and both "add songs to this list" pickers — gets the same control and
 * the same matcher behind it (src/lib/search.ts), so the habit transfers.
 */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search songs, composers or a line…',
  autoFocus = false,
  label = 'Search songs',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  label?: string
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim/50">
        <SearchIcon />
      </span>
      <input
        type="search"
        inputMode="search"
        aria-label={label}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-border bg-bg-soft py-2.5 pl-10 pr-10 text-sm text-text placeholder:text-text-dim/50 focus:border-accent"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-dim/60 hover:text-text"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
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
