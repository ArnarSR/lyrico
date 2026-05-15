import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
 * Server-side hydration of streak + today count from study_log. Local state is
 * still primary (instant), but on mount we backfill from DB so the data is
 * synced across devices.
 */
async function hydrateFromServer(userId: string): Promise<{ streak: number; todayCount: number }> {
  // Fetch the last 60 days of rows for this user
  const sixtyDaysAgo = daysAgo(60)
  const { data, error } = await supabase
    .from('study_log')
    .select('day_key, cards_reviewed')
    .eq('user_id', userId)
    .gte('day_key', sixtyDaysAgo)
    .order('day_key', { ascending: false })
  if (error || !data) return { streak: computeStreak(), todayCount: readTodayCount() }
  // Index server rows by day
  const byDay = new Map<string, number>(data.map((r) => [r.day_key as string, r.cards_reviewed as number]))
  // Merge into localStorage (server is authoritative)
  try {
    for (const [day, count] of byDay) {
      localStorage.setItem(`${DAILY_KEY_PREFIX}${day}`, 'true')
      localStorage.setItem(`${DAILY_COUNT_PREFIX}${day}`, String(count))
    }
  } catch { /* ignore */ }
  return { streak: computeStreak(), todayCount: byDay.get(todayKey()) ?? readTodayCount() }
}

async function pushToServer(userId: string, day: string, count: number) {
  try {
    await supabase.from('study_log').upsert({
      user_id: userId,
      day_key: day,
      cards_reviewed: count,
      updated_at: Date.now(),
    })
  } catch { /* network errors are non-fatal */ }
}

/**
 * Call markCardReviewed() each time a card is reviewed. It bumps today's
 * counter and (on first review of the day) sets the daily-studied flag.
 * Optionally pass a userId to also persist to the server.
 */
export function useStudyStats(userId?: string) {
  const [streak, setStreak] = useState<number>(() => computeStreak())
  const [todayCount, setTodayCount] = useState<number>(() => readTodayCount())
  const [goalReachedToday, setGoalReachedToday] = useState<boolean>(() => readTodayCount() >= DAILY_GOAL_DEFAULT)
  const [justReachedGoal, setJustReachedGoal] = useState(false)

  // On mount: hydrate from server, recompute streak (day may have rolled over)
  useEffect(() => {
    if (!userId) { setStreak(computeStreak()); return }
    hydrateFromServer(userId).then(({ streak: s, todayCount: tc }) => {
      setStreak(s)
      setTodayCount(tc)
      setGoalReachedToday(tc >= DAILY_GOAL_DEFAULT)
    })
  }, [userId])

  const markCardReviewed = useCallback(() => {
    try {
      const today = todayKey()
      const countKey = `${DAILY_COUNT_PREFIX}${today}`
      const next = (parseInt(localStorage.getItem(countKey) ?? '0', 10) || 0) + 1
      localStorage.setItem(countKey, String(next))
      localStorage.setItem(`${DAILY_KEY_PREFIX}${today}`, 'true')
      setTodayCount(next)
      if (next === 1) setStreak(computeStreak())
      if (next === DAILY_GOAL_DEFAULT && !goalReachedToday) {
        setGoalReachedToday(true)
        setJustReachedGoal(true)
      }
      if (userId) void pushToServer(userId, today, next)
    } catch { /* ignore */ }
  }, [userId, goalReachedToday])

  const clearJustReachedGoal = useCallback(() => setJustReachedGoal(false), [])

  return {
    streak,
    todayCount,
    dailyGoal: DAILY_GOAL_DEFAULT,
    markCardReviewed,
    justReachedGoal,
    clearJustReachedGoal,
  }
}
