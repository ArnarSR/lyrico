import type { PracticeList, Song, UserList } from '../types'
import { masteryPercent } from '../hooks/useSM2'

const DAY_MS = 86_400_000

interface StudyStatsBannerProps {
  streak: number
  todayCount: number
  dailyGoal: number
  userLists: UserList[]
  allPracticeLists: PracticeList[]
  songs: Song[]
  listSongIds: Map<string, Set<string>>
  fetchedListSongs?: Map<string, Song[]> // optional — for group lists
}

/**
 * Top-of-page banner with two motivators:
 *   1. Streak + daily goal (always shown)
 *   2. Soonest concert countdown when < 14 days (when applicable)
 */
export function StudyStatsBanner({
  streak, todayCount, dailyGoal,
  userLists, allPracticeLists, songs, listSongIds, fetchedListSongs,
}: StudyStatsBannerProps) {
  // Find the soonest upcoming concert across personal + group lists (deduplicated).
  // Personal lists synced from a group practice list defer to the group's date.
  const now = Date.now()
  type ConcertCandidate = { date: number; name: string; songsBelow50: number }
  const candidates: ConcertCandidate[] = []

  // Personal lists (use source group meta when synced)
  for (const ul of userLists) {
    const source = ul.sourcePracticeListId
      ? allPracticeLists.find((pl) => pl.id === ul.sourcePracticeListId)
      : undefined
    const date = source?.concertDate ?? ul.concertDate
    if (!date || date <= now) continue
    const name = source?.name ?? ul.name
    const ids = listSongIds.get(ul.id) ?? new Set<string>()
    const listSongs = songs.filter((s) => ids.has(s.id))
    const below50 = listSongs.filter((s) => !s.isKnown && masteryPercent(s) < 50).length
    candidates.push({ date, name, songsBelow50: below50 })
  }

  // Group practice lists NOT already represented by a personal copy
  for (const pl of allPracticeLists) {
    if (userLists.some((ul) => ul.sourcePracticeListId === pl.id)) continue
    if (!pl.concertDate || pl.concertDate <= now) continue
    const groupSongs = fetchedListSongs?.get(pl.id) ?? []
    // For group lists, prefer user's own song mastery when available
    const resolved = groupSongs.map((gs) => songs.find((s) => s.id === gs.id) ?? gs)
    const below50 = resolved.filter((s) => !s.isKnown && masteryPercent(s) < 50).length
    candidates.push({ date: pl.concertDate, name: pl.name, songsBelow50: below50 })
  }

  const soonest = candidates.sort((a, b) => a.date - b.date)[0]
  const daysLeft = soonest ? Math.ceil((soonest.date - now) / DAY_MS) : null
  const showConcert = daysLeft !== null && daysLeft <= 14

  const goalReached = todayCount >= dailyGoal
  const goalPct = Math.min(100, Math.round((todayCount / dailyGoal) * 100))

  return (
    <div className="mb-4 flex flex-col gap-2">
      {/* Streak + daily goal */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-soft px-4 py-3">
        <div className="flex shrink-0 items-baseline gap-1">
          <span className="text-2xl">🔥</span>
          <span className="text-lg font-medium text-accent">{streak}</span>
          <span className="text-xs text-text-dim">{streak === 1 ? 'day' : 'days'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs text-text-dim">
              {goalReached ? '🎯 Daily goal reached!' : `Today: ${todayCount}/${dailyGoal} cards`}
            </p>
            {!goalReached && todayCount > 0 && (
              <p className="text-xs text-text-dim/60">{dailyGoal - todayCount} to go</p>
            )}
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${goalReached ? 'bg-correct' : 'bg-accent'}`}
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Concert countdown */}
      {showConcert && soonest && daysLeft !== null && (
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
          daysLeft <= 3 ? 'border-wrong/40 bg-wrong/10' :
          daysLeft <= 7 ? 'border-accent/30 bg-accent/5' :
          'border-border bg-bg-soft'
        }`}>
          <span className="text-2xl">🎭</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-text">
              {daysLeft === 0 ? 'Concert today' : daysLeft === 1 ? 'Concert tomorrow' : `Concert in ${daysLeft} days`}
              <span className="text-text-dim"> · {soonest.name}</span>
            </p>
            {soonest.songsBelow50 > 0 ? (
              <p className="mt-0.5 text-xs text-text-dim">
                {soonest.songsBelow50} song{soonest.songsBelow50 !== 1 ? 's' : ''} still below 50% mastery
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-correct">All songs above 50% — looking good!</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
