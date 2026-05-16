import { useEffect, useMemo, useState } from 'react'
import type { GroupMember, MemberSongProgress } from '../types'

interface GroupMemberProgressProps {
  groupId: string
  members: GroupMember[]
  currentUserId: string
  onGetProgress: (groupId: string) => Promise<MemberSongProgress[]>
}

function stageLabel(mastery: number, inLibrary: boolean, isKnown: boolean): string {
  if (isKnown) return 'Known'
  if (!inLibrary) return 'Not added'
  if (mastery === 0) return 'Not started'
  if (mastery <= 25) return 'Recognising'
  if (mastery <= 50) return 'Learning'
  if (mastery <= 75) return 'Recalling'
  return 'Mastered'
}

function stageColor(mastery: number, inLibrary: boolean, isKnown: boolean): string {
  if (isKnown || mastery === 100) return 'text-correct'
  if (!inLibrary || mastery === 0) return 'text-text-dim/50'
  if (mastery <= 25) return 'text-wrong/70'
  if (mastery <= 50) return 'text-accent'
  return 'text-accent'
}

function barColor(mastery: number): string {
  if (mastery === 100) return 'bg-correct'
  if (mastery <= 25) return 'bg-wrong/60'
  return 'bg-accent'
}

function formatLastActive(dayKey: string | null): string {
  if (!dayKey) return 'Never'
  const now = new Date()
  const d = new Date(dayKey + 'T00:00:00')
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

export function GroupMemberProgress({ groupId, members, currentUserId, onGetProgress }: GroupMemberProgressProps) {
  const [rows, setRows] = useState<MemberSongProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    onGetProgress(groupId).then((data) => {
      if (!cancelled) { setRows(data); setLoading(false) }
    }).catch((e) => {
      if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load'); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [groupId, onGetProgress])

  // Group rows by member, preserving member order from members list
  const byMember = useMemo(() => {
    const map = new Map<string, MemberSongProgress[]>()
    for (const row of rows) {
      const existing = map.get(row.userId) ?? []
      existing.push(row)
      map.set(row.userId, existing)
    }
    // Sort songs within each member: lowest mastery first
    for (const [, songs] of map) {
      songs.sort((a, b) => {
        if (!a.inLibrary && b.inLibrary) return 1
        if (a.inLibrary && !b.inLibrary) return -1
        return a.masteryPercent - b.masteryPercent
      })
    }
    return map
  }, [rows])

  if (loading) return <p className="text-sm text-text-dim">Loading progress…</p>
  if (error) return <p className="text-sm text-wrong">{error}</p>
  if (rows.length === 0) return (
    <div className="rounded-2xl border border-dashed border-border bg-bg-soft p-4 text-center">
      <p className="text-sm text-text-dim">No songs in any practice list yet.</p>
    </div>
  )

  function toggleExpand(userId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => {
        const songs = byMember.get(member.userId) ?? []
        if (songs.length === 0) return null
        const isExpanded = expanded.has(member.userId)
        const lastActive = songs[0]?.lastActiveDay ?? null
        const addedCount = songs.filter((s) => s.inLibrary || s.isKnown).length
        const avgMastery = addedCount > 0
          ? Math.round(songs.filter((s) => s.inLibrary || s.isKnown).reduce((sum, s) => sum + (s.isKnown ? 100 : s.masteryPercent), 0) / addedCount)
          : 0

        return (
          <li key={member.userId} className="overflow-hidden rounded-2xl border border-border bg-bg-soft">
            <button
              type="button"
              onClick={() => toggleExpand(member.userId)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg-card"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-text">
                    {member.displayName}{member.userId === currentUserId ? ' (you)' : ''}
                  </span>
                  {member.role !== 'member' && (
                    <span className="text-xs text-text-dim/60">{member.role}</span>
                  )}
                </div>
                <div className="mt-0.5 flex gap-3 text-xs text-text-dim/70">
                  <span>Last active: {formatLastActive(lastActive)}</span>
                  <span>{addedCount}/{songs.length} songs added</span>
                  {addedCount > 0 && <span className={avgMastery < 40 ? 'text-wrong/70' : avgMastery < 75 ? 'text-accent' : 'text-correct'}>Avg {avgMastery}%</span>}
                </div>
              </div>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                className={`shrink-0 text-text-dim/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {isExpanded && (
              <ul className="border-t border-border/50 px-4 py-2 flex flex-col gap-2">
                {songs.map((s) => {
                  const mastery = s.isKnown ? 100 : s.masteryPercent
                  return (
                    <li key={s.songId} className="py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm text-text">{s.songTitle}</p>
                        <span className={`shrink-0 text-xs ${stageColor(mastery, s.inLibrary, s.isKnown)}`}>
                          {stageLabel(mastery, s.inLibrary, s.isKnown)}
                        </span>
                      </div>
                      {s.inLibrary && !s.isKnown && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 overflow-hidden rounded-full bg-bg-card h-1">
                            <div
                              className={`h-full rounded-full transition-[width] ${barColor(mastery)}`}
                              style={{ width: `${mastery}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-xs text-text-dim/60 w-8 text-right">{mastery}%</span>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
