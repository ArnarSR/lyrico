import posthog from 'posthog-js'
import { analyticsEnabled } from './analytics'

/**
 * Every feature flag the app reads, with the value to use when PostHog cannot
 * answer — offline, analytics disabled, or flags not fetched yet. PostHog
 * targeting decides who gets the non-default value.
 */
export const FLAG_DEFAULTS = {
  'ai-lyrics-search': false,
} as const

export type FlagKey = keyof typeof FLAG_DEFAULTS

const OVERRIDE_PREFIX = 'lyrico_flag_'

/**
 * Local override, in priority order: `?ff_<key>=on` in the URL (which is then
 * remembered), then a previously remembered value. This is what keeps E2E runs
 * deterministic and lets you demo a flag without touching the PostHog project.
 * `?ff_<key>=clear` drops the override and hands the flag back to PostHog.
 */
function readOverride(key: FlagKey): boolean | undefined {
  try {
    const param = new URLSearchParams(window.location.search).get(`ff_${key}`)
    if (param === 'clear') {
      localStorage.removeItem(`${OVERRIDE_PREFIX}${key}`)
      return undefined
    }
    if (param !== null) {
      const on = param === 'on' || param === 'true' || param === '1'
      localStorage.setItem(`${OVERRIDE_PREFIX}${key}`, String(on))
      return on
    }
    const stored = localStorage.getItem(`${OVERRIDE_PREFIX}${key}`)
    if (stored !== null) return stored === 'true'
  } catch {
    // Storage or URL unavailable — fall through to PostHog.
  }
  return undefined
}

/**
 * Read a flag once. Prefer `useFeatureFlag` in components so the UI updates
 * when flags arrive; use this in event handlers and non-React code.
 */
export function isFlagEnabled(key: FlagKey): boolean {
  const override = readOverride(key)
  if (override !== undefined) return override
  if (!analyticsEnabled) return FLAG_DEFAULTS[key]
  try {
    // undefined while flags are still in flight, or if the key is unknown.
    return posthog.isFeatureEnabled(key) ?? FLAG_DEFAULTS[key]
  } catch {
    return FLAG_DEFAULTS[key]
  }
}

/** Subscribe to flag changes. Returns an unsubscribe function. */
export function onFlagsChanged(callback: () => void): () => void {
  if (!analyticsEnabled) return () => {}
  try {
    return posthog.onFeatureFlags(callback)
  } catch {
    return () => {}
  }
}
