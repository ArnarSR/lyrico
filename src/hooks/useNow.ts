import { useEffect, useState } from 'react'

/**
 * Returns a stable `now` timestamp that refreshes on an interval.
 * Keeps relative-time displays ("2m ago") accurate without making
 * render impure.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
