import { useCallback, useEffect, useState } from 'react'

const DAILY_KEY_PREFIX = 'lyrico_studied_'
const DAILY_COUNT_PREFIX = 'lyrico_studied_count_'
const DAILY_GOAL_DEFAULT = 5

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayKey(): string { return dayKey(new Date()) }

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return dayKey(d)
}

/** Compute current streak: consecutive days ending today (or yesterday) with ≥1 card reviewed. */
function computeStreak(): number {
  try {
    // If today has activity → start counting from today; otherwise from yesterday
    // (so a streak shown in the morning before today's study still counts).
    let n = 0
    let started = false
    for (let i = 0; i < 366; i++) {
      const key = `${DAILY_KEY_PREFIX}${daysAgo(i)}`
      const studied = localStorage.getItem(key) === 'true'
      if (studied) {
        n++
        started = true
      } else {
        if (started) break       // gap → streak ends
        if (i >= 1) break        // yesterday has no activity → no streak
      }
    }
    return n
  } catch { return 0 }
}

function readTodayCount(): number {
  try {
    const v = localStorage.getItem(`${DAILY_COUNT_PREFIX}${todayKey()}`)
    return v ? parseInt(v, 10) || 0 : 0
  } catch { return 0 }
}

/**
 * Call markCardReviewed() each time a card is reviewed. It bumps today's
 * counter and (on first review of the day) sets the daily-studied flag.
 */
export function useStudyStats() {
  const [streak, setStreak] = useState<number>(() => computeStreak())
  const [todayCount, setTodayCount] = useState<number>(() => readTodayCount())

  // Recompute streak at mount (in case the day rolled over since last visit)
  useEffect(() => { setStreak(computeStreak()) }, [])

  const markCardReviewed = useCallback(() => {
    try {
      const today = todayKey()
      const countKey = `${DAILY_COUNT_PREFIX}${today}`
      const next = (parseInt(localStorage.getItem(countKey) ?? '0', 10) || 0) + 1
      localStorage.setItem(countKey, String(next))
      localStorage.setItem(`${DAILY_KEY_PREFIX}${today}`, 'true')
      setTodayCount(next)
      // If this is the first review of the day, streak just grew
      if (next === 1) setStreak(computeStreak())
    } catch { /* ignore */ }
  }, [])

  return {
    streak,
    todayCount,
    dailyGoal: DAILY_GOAL_DEFAULT,
    markCardReviewed,
  }
}
