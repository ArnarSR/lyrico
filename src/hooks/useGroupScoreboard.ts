import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchProfiles } from './useProfile'

export interface ScoreboardEntry {
  userId: string
  displayName: string
  cardsThisWeek: number
  streak: number
  isYou: boolean
}

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return dayKey(d)
}

// Compute streak from a set of day keys (consecutive days ending today/yesterday)
function streakFromDays(days: Set<string>): number {
  let n = 0
  let started = false
  for (let i = 0; i < 366; i++) {
    if (days.has(daysAgo(i))) {
      n++
      started = true
    } else {
      if (started) break
      if (i >= 1) break
    }
  }
  return n
}

/**
 * Fetches the weekly scoreboard for a group: ranks members by cards reviewed
 * over the last 7 days, plus their current streak.
 */
export function useGroupScoreboard(groupId: string, currentUserId: string) {
  const [entries, setEntries] = useState<ScoreboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        // 1. Get group members
        const { data: memberRows, error: memErr } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', groupId)
        if (memErr || !memberRows) throw memErr ?? new Error('No members')
        const userIds = memberRows.map((r) => r.user_id as string)
        if (userIds.length === 0) { if (!cancelled) { setEntries([]); setLoading(false) } return }

        // 2. Fetch profile names + study_log entries (last 60 days for streaks)
        const sixtyDaysAgo = daysAgo(60)
        const [profileMap, logRes] = await Promise.all([
          fetchProfiles(userIds),
          supabase
            .from('study_log')
            .select('user_id, day_key, cards_reviewed')
            .in('user_id', userIds)
            .gte('day_key', sixtyDaysAgo),
        ])
        if (logRes.error) throw logRes.error
        const logRows = (logRes.data ?? []) as Array<{ user_id: string; day_key: string; cards_reviewed: number }>

        // 3. Aggregate per user
        const sevenDaysAgo = daysAgo(7)
        const perUser = new Map<string, { cardsThisWeek: number; days: Set<string> }>()
        for (const uid of userIds) perUser.set(uid, { cardsThisWeek: 0, days: new Set() })
        for (const row of logRows) {
          const u = perUser.get(row.user_id)
          if (!u) continue
          u.days.add(row.day_key)
          if (row.day_key >= sevenDaysAgo) u.cardsThisWeek += row.cards_reviewed
        }

        const result: ScoreboardEntry[] = userIds.map((uid) => {
          const stats = perUser.get(uid)!
          return {
            userId: uid,
            displayName: profileMap.get(uid) ?? uid.slice(0, 8),
            cardsThisWeek: stats.cardsThisWeek,
            streak: streakFromDays(stats.days),
            isYou: uid === currentUserId,
          }
        }).sort((a, b) => b.cardsThisWeek - a.cardsThisWeek || b.streak - a.streak)

        if (!cancelled) {
          setEntries(result)
          setLoading(false)
        }
      } catch (e) {
        console.error('useGroupScoreboard:', e)
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [groupId, currentUserId])

  return { entries, loading }
}
