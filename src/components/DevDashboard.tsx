import { useEffect, useState } from 'react'
import { Header, IconButton, Shell } from './Shell'
import {
  clearFlagOverrides,
  flagSource,
  isFlagEnabled,
  setFlagOverride,
  storedOverride,
  FLAG_DEFAULTS,
  FLAG_KEYS,
  FLAG_META,
  onFlagsChanged,
  type FlagKey,
  type FlagSource,
} from '../lib/flags'
import { analyticsEnabled } from '../lib/analytics'
import { DEV_DASHBOARD_HASH } from '../hooks/useDevRoute'

/**
 * Developer dashboard — a hidden screen for switching features on and off per
 * device, grouped by the screen they affect.
 *
 * Not linked from anywhere: reach it with the `#dev` fragment (or `?dev=1`), see
 * src/hooks/useDevRoute.ts. A toggle here writes a local override, which beats
 * both PostHog targeting and the built-in default and survives a reload, so a
 * feature can be tried, demoed or ruled out of a bug report without a deploy or
 * a change to the PostHog project. "Reset" hands a flag back to PostHog.
 *
 * Overrides are per browser, and they are the same ones `?ff_<key>=on` writes —
 * the E2E suite relies on that, so the two must stay interchangeable.
 */

export function DevDashboard({ onClose }: { onClose: () => void }) {
  // Re-render on every flag change, including this screen's own toggles. The
  // rows read the flags during render, so bumping this counter is enough — do
  // not key the list on it, or each toggle remounts the row it is in and the
  // keyboard focus goes with it.
  const [, setTick] = useState(0)
  useEffect(() => onFlagsChanged(() => setTick((t) => t + 1)), [])

  const areas = groupByArea()
  const overrideCount = FLAG_KEYS.filter((k) => storedOverride(k) !== undefined).length

  return (
    <Shell>
      <Header
        title="Developer"
        subtitle="Feature toggles"
        left={
          <IconButton label="Close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </IconButton>
        }
        right={
          overrideCount > 0 ? (
            <button
              type="button"
              onClick={() => clearFlagOverrides()}
              className="shrink-0 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs text-text-dim hover:text-text"
            >
              Reset all ({overrideCount})
            </button>
          ) : undefined
        }
      />

      <p className="mb-5 text-xs leading-relaxed text-text-dim">
        A switch here overrides PostHog and the built-in default for this browser only, and survives
        a reload. Reset hands the flag back to PostHog.
        {!analyticsEnabled && ' PostHog is not configured in this build, so every flag falls back to its default.'}
      </p>

      <div className="flex flex-col gap-6">
        {[...areas.entries()].map(([area, keys]) => (
          <section key={area}>
            <h2 className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">{area}</h2>
            <ul className="flex flex-col gap-2">
              {keys.map((key) => (
                <FlagRow key={key} flag={key} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-bg-soft p-4">
        <h2 className="text-xs uppercase tracking-[0.15em] text-text-dim">Build</h2>
        <dl className="mt-2 flex flex-col gap-1 text-xs text-text-dim">
          <Row term="Mode" value={import.meta.env.MODE} />
          <Row term="Analytics" value={analyticsEnabled ? 'on' : 'off'} />
          <Row term="Flags" value={`${FLAG_KEYS.length} · ${overrideCount} overridden`} />
          <Row term="Open with" value={`${window.location.origin}/${DEV_DASHBOARD_HASH}`} />
        </dl>
      </section>
    </Shell>
  )
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{term}</dt>
      <dd className="truncate text-text/70">{value}</dd>
    </div>
  )
}

function FlagRow({ flag }: { flag: FlagKey }) {
  const meta = FLAG_META[flag]
  const on = isFlagEnabled(flag)
  const source = flagSource(flag)
  const overridden = source === 'override'

  return (
    <li className={`rounded-xl border px-3 py-3 ${overridden ? 'border-accent/40 bg-accent/5' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text">{meta.label}</p>
          <p id={`${flag}-description`} className="mt-0.5 text-xs leading-relaxed text-text-dim">
            {meta.description}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-text-dim/60">
            <span>{flag}</span>
            <span aria-hidden>·</span>
            <span>default {FLAG_DEFAULTS[flag] ? 'on' : 'off'}</span>
            {source !== 'default' && (
              <span className={`rounded px-1.5 py-0.5 ${source === 'override' ? 'bg-accent/15 text-accent' : 'bg-bg-card text-text-dim'}`}>
                {SOURCE_LABEL[source]}
              </span>
            )}
          </p>
        </div>
        <Toggle
          on={on}
          label={meta.label}
          describedBy={`${flag}-description`}
          onChange={(next) => setFlagOverride(flag, next)}
        />
      </div>
      {overridden && (
        <button
          type="button"
          onClick={() => setFlagOverride(flag, null)}
          className="mt-2 text-xs text-accent/70 hover:text-accent"
        >
          Reset to {FLAG_DEFAULTS[flag] ? 'on' : 'off'}
        </button>
      )}
    </li>
  )
}

/** Only shown when the live value did not come from the default. */
const SOURCE_LABEL: Record<FlagSource, string> = {
  override: 'overridden here',
  posthog: 'from PostHog',
  default: '',
}

/**
 * The knob is positioned from the track's left edge and moved with a transform,
 * never by its static position: a <button> centres its content, so a knob that
 * relies on where it would have sat in flow lands in the middle of the track and
 * hangs off the right edge when it moves.
 */
function Toggle({
  on,
  label,
  describedBy,
  onChange,
}: {
  on: boolean
  label: string
  describedBy?: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={() => onChange(!on)}
      className="-m-2 shrink-0 rounded-full p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span
        aria-hidden
        className={`relative block h-6 w-11 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-bg-card'} ${on ? '' : 'ring-1 ring-inset ring-border'}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${on ? 'translate-x-5 bg-white' : 'translate-x-0 bg-text-dim/70'}`}
        />
      </span>
    </button>
  )
}

/** Flags grouped by the screen they change, in the order FLAG_META declares. */
function groupByArea(): Map<string, FlagKey[]> {
  const areas = new Map<string, FlagKey[]>()
  for (const key of FLAG_KEYS) {
    const area = FLAG_META[key].area
    if (!areas.has(area)) areas.set(area, [])
    areas.get(area)!.push(key)
  }
  return areas
}
