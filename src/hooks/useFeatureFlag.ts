import { useCallback, useSyncExternalStore } from 'react'
import { isFlagEnabled, onFlagsChanged, type FlagKey } from '../lib/flags'

/**
 * Reads a feature flag and re-renders when PostHog delivers or re-evaluates
 * flags — which happens shortly after load, and again on sign-in once the user
 * is identified. Falls back to the flag's default when PostHog can't answer.
 */
export function useFeatureFlag(key: FlagKey): boolean {
  const subscribe = useCallback((onChange: () => void) => onFlagsChanged(onChange), [])
  const read = useCallback(() => isFlagEnabled(key), [key])
  return useSyncExternalStore(subscribe, read, read)
}
