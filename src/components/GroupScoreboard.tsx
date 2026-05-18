import { useGroupScoreboard } from '../hooks/useGroupScoreboard'

interface GroupScoreboardProps {
  groupId: string
  currentUserId: string
}

export function GroupScoreboard({ groupId, currentUserId }: GroupScoreboardProps) {
  const { entries, loading } = useGroupScoreboard(groupId, currentUserId)

  if (loading) {
    return <p className="text-sm text-text-dim">Loading scoreboard…</p>
  }

  const anyActivity = entries.some((e) => e.cardsThisWeek > 0 || e.streak > 0)
  if (!anyActivity) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-bg-soft p-4 text-center">
        <p className="text-sm text-text-dim">
          🏆 Scoreboard will appear here once members start practising.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map((e, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
        return (
          <li
            key={e.userId}
            className={`flex items-center justify-between rounded-xl border px-4 py-2.5 transition-colors ${
              e.isYou
                ? 'border-accent/40 bg-accent/10'
                : 'border-border bg-bg-soft'
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="w-6 shrink-0 text-center text-sm text-text-dim">
                {medal ?? `${idx + 1}.`}
              </span>
              <span className={`truncate text-sm ${e.isYou ? 'text-accent' : 'text-text'}`}>
                {e.displayName}{e.isYou ? ' (you)' : ''}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs">
              {e.streak > 0 && (
                <span className="text-accent" title={`${e.streak}-day streak`}>
                  🔥 {e.streak}
                </span>
              )}
              <span className="text-text-dim">
                {e.cardsThisWeek} line{e.cardsThisWeek !== 1 ? 's' : ''} practiced
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
