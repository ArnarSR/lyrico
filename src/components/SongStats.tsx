import { useState } from 'react'
import type { Card, PracticeList, Song, UserList } from '../types'
import { isMastered, masteryPercent } from '../hooks/useSM2'
import { getStanzaStarts } from '../lib/stanzas'
import { useNow } from '../hooks/useNow'
import { Header, IconButton, Shell } from './Shell'

interface SongStatsProps {
  song: Song
  allPracticeLists: PracticeList[]
  userLists: UserList[]
  listSongIds: Map<string, Set<string>>
  onBack: () => void
  onStudy: () => void
  onStudyVerse: (stanzaIdx: number) => void
  onStanzaDrill: () => void
  onDelete: () => void
  onTogglePublic: () => void
  onAddToPracticeList: (listId: string) => void
  onAddToUserList: (listId: string) => void
  onRemoveFromUserList: (listId: string) => void
  onCreateUserList: (name: string) => Promise<UserList>
}

const DAY_MS = 86_400_000

export function SongStats({
  song, allPracticeLists, userLists, listSongIds,
  onBack, onStudy, onStudyVerse, onStanzaDrill, onDelete,
  onTogglePublic, onAddToPracticeList, onAddToUserList, onRemoveFromUserList, onCreateUserList,
}: SongStatsProps) {
  const now = useNow()
  const mastery = masteryPercent(song)
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
  const [addedLists, setAddedLists] = useState<Set<string>>(new Set())

  const stanzaStarts = getStanzaStarts(song.lyrics)
  const verses = stanzaStarts.length > 1
    ? stanzaStarts
        .map((start, i) => {
          const end = i + 1 < stanzaStarts.length ? stanzaStarts[i + 1] - 1 : Infinity
          const cards = song.cards.filter((c) => c.lineIndex >= start && c.lineIndex <= end)
          const masteredCount = cards.filter(isMastered).length
          const firstLine = cards[0]?.text ?? ''
          return { cards, masteredCount, firstLine, stanzaIdx: i }
        })
        .filter((v) => v.cards.length > 0)
    : []
  const concertDays = song.concertDate
    ? Math.ceil((song.concertDate - now) / DAY_MS)
    : null

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault()
    if (!newListName.trim()) return
    setCreatingList(true)
    try {
      const list = await onCreateUserList(newListName)
      await onAddToUserList(list.id)
      setNewListName('')
    } finally {
      setCreatingList(false)
    }
  }

  return (
    <Shell>
      <Header
        title={song.title}
        subtitle={
          [song.composer, song.voicePart].filter(Boolean).join(' · ') ||
          `${song.cards.length} lines`
        }
        left={
          <IconButton label="Back to library" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </IconButton>
        }
      />

      {/* Mastery card */}
      <div className="rounded-2xl border border-border bg-bg-soft p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-text-dim">Mastery</p>
            <p className="mt-1 text-3xl text-accent">{mastery}%</p>
          </div>
          {concertDays !== null && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.15em] text-text-dim">Concert</p>
              <p className={`mt-1 text-lg ${concertDays <= 7 ? 'text-wrong' : 'text-text'}`}>
                {concertDays <= 0 ? 'Today' : `${concertDays} day${concertDays === 1 ? '' : 's'}`}
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${mastery}%` }} />
        </div>
      </div>

      {/* Study buttons */}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onStanzaDrill}
          className="flex-1 rounded-full border border-accent bg-accent/15 py-3 text-accent hover:bg-accent/25"
        >
          Stanza starts
        </button>
        <button
          type="button"
          onClick={onStudy}
          className="flex-1 rounded-full border border-accent bg-accent py-3 text-bg hover:brightness-110"
        >
          Study
        </button>
      </div>

      {/* Verses */}
      {verses.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Verses</h2>
          <ol className="flex flex-col gap-2">
            {verses.map((verse, i) => (
              <li key={verse.stanzaIdx}>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-soft px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-text-dim">Verse {i + 1} · {verse.masteredCount}/{verse.cards.length} mastered</p>
                    <p className="mt-0.5 truncate text-base text-text">{verse.firstLine}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStudyVerse(verse.stanzaIdx)}
                    className="shrink-0 rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-sm text-accent hover:bg-accent/20"
                  >
                    Study
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Share & Lists */}
      <section className="mt-6">
        <h2 className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Sharing</h2>

        {/* Community toggle */}
        <button
          type="button"
          onClick={onTogglePublic}
          className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-border bg-bg-soft px-4 py-3"
        >
          <div className="text-left">
            <p className="text-sm text-text">Share with community</p>
            <p className="text-xs text-text-dim">Visible to all Lyrico users</p>
          </div>
          <div className={`relative h-6 w-11 rounded-full transition-colors ${song.isPublic ? 'bg-accent' : 'bg-border'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${song.isPublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </button>

        {/* Group practice lists */}
        {allPracticeLists.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            <p className="px-1 text-xs text-text-dim/70">Group practice lists</p>
            {allPracticeLists.map((list) => {
              const added = addedLists.has(list.id)
              return (
                <div key={list.id} className="flex items-center justify-between rounded-xl border border-border bg-bg-soft px-4 py-2.5">
                  <p className="text-sm text-text">{list.name}</p>
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => { onAddToPracticeList(list.id); setAddedLists((s) => new Set(s).add(list.id)) }}
                    className="text-xs text-accent hover:text-accent/80 disabled:text-text-dim/60"
                  >
                    {added ? 'Added ✓' : '+ Add'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Personal lists */}
        <div className="mt-2 flex flex-col gap-1">
          <p className="px-1 text-xs text-text-dim/70">My lists</p>
          {userLists.map((list) => {
            const inList = listSongIds.get(list.id)?.has(song.id) ?? false
            return (
              <div key={list.id} className="flex items-center gap-3 rounded-xl border border-border bg-bg-soft px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => inList ? onRemoveFromUserList(list.id) : onAddToUserList(list.id)}
                  className={`h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${inList ? 'border-accent bg-accent' : 'border-border bg-transparent'}`}
                >
                  {inList && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </button>
                <span className="text-sm text-text">{list.name}</span>
              </div>
            )
          })}
          {/* New list form */}
          <form onSubmit={handleCreateList} className="flex gap-2 pt-1">
            <input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="New list name…"
              className="min-w-0 flex-1 rounded-xl border border-border bg-bg-soft px-3 py-2 text-sm text-text placeholder:text-text-dim/60 focus:border-accent"
            />
            <button
              type="submit"
              disabled={!newListName.trim() || creatingList}
              className="rounded-xl border border-accent bg-accent/15 px-3 py-2 text-sm text-accent hover:bg-accent/25 disabled:opacity-40"
            >
              {creatingList ? '…' : 'Create'}
            </button>
          </form>
        </div>
      </section>

      {/* Lines */}
      <section className="mt-6">
        <h2 className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Lines</h2>
        <ol className="flex flex-col gap-2">
          {song.cards.map((c, i) => (
            <li key={c.id}>
              <LineRow card={c} index={i} now={now} />
            </li>
          ))}
        </ol>
      </section>

      <button
        type="button"
        onClick={() => {
          if (confirm(`Delete "${song.title}"? This cannot be undone.`)) {
            onDelete()
          }
        }}
        className="mt-8 self-center text-sm text-wrong/80 hover:text-wrong"
      >
        Delete song
      </button>
    </Shell>
  )
}

function LineRow({ card, index, now }: { card: Card; index: number; now: number }) {
  const mastered = isMastered(card)
  const dueIn = card.nextDue - now
  const dueLabel =
    card.lastQuality === null
      ? 'Never studied'
      : dueIn <= 0
        ? 'Due now'
        : `Due in ${formatInterval(dueIn)}`

  return (
    <div className="rounded-xl border border-border bg-bg-soft px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-text-dim">Line {index + 1}</p>
          <p className="mt-0.5 truncate text-base text-text">{card.text}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${mastered ? 'border-correct/40 text-correct' : 'border-border text-text-dim'}`}>
          {['25%', '50%', 'full'][card.difficulty]}
        </span>
      </div>
      <p className="mt-1 text-xs text-text-dim">{dueLabel}</p>
    </div>
  )
}

function formatInterval(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`
  return `${Math.round(ms / 86_400_000)}d`
}
