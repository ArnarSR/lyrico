import posthog from 'posthog-js'
import { analyticsEnabled } from './analytics'

/**
 * Every feature flag the app reads, with the value to use when PostHog cannot
 * answer — offline, analytics disabled, or flags not fetched yet. PostHog
 * targeting decides who gets the non-default value.
 *
 * A flag defaulting to `true` is a shipped feature that can still be switched
 * off per device from the developer dashboard (#dev); one defaulting to `false`
 * is not released yet and is opened by targeting or by an override.
 */
export const FLAG_DEFAULTS = {
  'ai-lyrics-search': false,
  'ai-lyrics-check': false,
  'batch-import': false,
  'smart-line-detection': true,
  'word-line-tools': true,
  'line-split': true,
  'translation-reveal': true,
  'save-qa-checklist': true,
} as const

export type FlagKey = keyof typeof FLAG_DEFAULTS

export const FLAG_KEYS = Object.keys(FLAG_DEFAULTS) as FlagKey[]

/**
 * What each flag turns on and where to look for it. The developer dashboard
 * groups by `area`, so a flag without an entry here would be invisible — keep
 * this in step with FLAG_DEFAULTS.
 */
export interface FlagMeta {
  label: string
  /** The screen the flag changes, used as the dashboard's grouping. */
  area: string
  description: string
}

export const FLAG_META: Record<FlagKey, FlagMeta> = {
  'ai-lyrics-search': {
    label: 'Find lyrics with AI',
    area: 'New song',
    description: 'Look a song up by title instead of pasting its text.',
  },
  'ai-lyrics-check': {
    label: 'AI quality check',
    area: 'New song',
    description:
      'Claude reads the pasted text before it is saved and reports what would go wrong in rehearsal. Costs a round trip.',
  },
  'batch-import': {
    label: 'Add several songs at once',
    area: 'New song',
    description:
      'Look a list of songs up by name, or read a stack of scanned scores, and grade each result before importing. Several web-searching model calls per run.',
  },
  'smart-line-detection': {
    label: 'Smart line detection',
    area: 'New song',
    description:
      'Rejoins split syllables, drops score markings and re-phrases imported text so one row is one sung phrase. Undoable from the notice it leaves.',
  },
  'word-line-tools': {
    label: 'Move words between lines',
    area: 'Edit lyrics',
    description: 'Per-word ← and → buttons that move a word to the previous or next line.',
  },
  'line-split': {
    label: 'Split line at a word',
    area: 'Edit lyrics',
    description: 'Split a row that holds two phrases at the word the second one starts on.',
  },
  'translation-reveal': {
    label: 'Show translation after Check',
    area: 'Practice',
    description:
      'Reveals the line’s translation once the answer is in, in study, test, stanza and word-bank drills.',
  },
  'save-qa-checklist': {
    label: 'Save checklist',
    area: 'Saving',
    description:
      'A countable summary — lines, empty rows, leftovers, translation, rehearsal fields — to confirm before lyrics are written. Runs on both New song and Edit lyrics.',
  },
}

const OVERRIDE_PREFIX = 'lyrico_flag_'

function overrideKey(key: FlagKey): string {
  return `${OVERRIDE_PREFIX}${key}`
}

/** The remembered override for a flag, ignoring the URL. */
export function storedOverride(key: FlagKey): boolean | undefined {
  try {
    const stored = localStorage.getItem(overrideKey(key))
    if (stored !== null) return stored === 'true'
  } catch {
    // Storage unavailable — there is no override to read.
  }
  return undefined
}

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
      localStorage.removeItem(overrideKey(key))
      return undefined
    }
    if (param !== null) {
      const on = param === 'on' || param === 'true' || param === '1'
      localStorage.setItem(overrideKey(key), String(on))
      return on
    }
  } catch {
    // URL or storage unavailable — fall through to the remembered value.
  }
  return storedOverride(key)
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

/** Where a flag's current value came from — shown in the developer dashboard. */
export type FlagSource = 'override' | 'posthog' | 'default'

export function flagSource(key: FlagKey): FlagSource {
  if (storedOverride(key) !== undefined) return 'override'
  if (!analyticsEnabled) return 'default'
  try {
    return posthog.isFeatureEnabled(key) === undefined ? 'default' : 'posthog'
  } catch {
    return 'default'
  }
}

/**
 * Overrides a flag on this device, or hands it back to PostHog with `null`.
 * Subscribers are notified so open screens pick the change up without a reload.
 */
export function setFlagOverride(key: FlagKey, value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(overrideKey(key))
    else localStorage.setItem(overrideKey(key), String(value))
  } catch {
    // Nothing to do: without storage the override cannot be remembered.
  }
  notifyFlagsChanged()
}

/** Drops every local override, restoring PostHog's answers and the defaults. */
export function clearFlagOverrides(): void {
  for (const key of FLAG_KEYS) {
    try { localStorage.removeItem(overrideKey(key)) } catch { /* ignore */ }
  }
  notifyFlagsChanged()
}

// Local subscribers, so a toggle in the dashboard reaches every screen. PostHog
// has its own listener list, which knows nothing about local overrides.
const listeners = new Set<() => void>()

function notifyFlagsChanged(): void {
  for (const listener of [...listeners]) listener()
}

/** Subscribe to flag changes — PostHog's and this device's. Returns unsubscribe. */
export function onFlagsChanged(callback: () => void): () => void {
  listeners.add(callback)
  let unsubscribePosthog: () => void = () => {}
  if (analyticsEnabled) {
    try {
      unsubscribePosthog = posthog.onFeatureFlags(callback)
    } catch {
      // PostHog unavailable — local changes still reach the callback.
    }
  }
  return () => {
    listeners.delete(callback)
    unsubscribePosthog()
  }
}
