import { useState } from 'react'
import type { Card, PracticeList, Song, UserList } from '../types'
import { cardMastery, isMastered, masteryPercent } from '../hooks/useSM2'
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
  onTest: () => void
  onDelete: () => void
  onTogglePublic: () => void
  onToggleKnown: () => void
  onAddToPracticeList: (listId: string) => void
  onAddToUserList: (listId: string) => void
  onRemoveFromUserList: (listId: string) => void
  onCreateUserList: (name: string) => Promise<UserList>
}

const DAY_MS = 86_400_000

export function SongStats({
  song, allPracticeLists, userLists, listSongIds,
  onBack, onStudy, onStudyVerse, onStanzaDrill, onTest, onDelete,
  onTogglePublic, onToggleKnown, onAddToPracticeList, onAddToUserList, onRemoveFromUserList, onCreateUserList,
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
            <p className={`mt-1 text-3xl font-medium ${mastery < 50 ? 'text-wrong' : mastery < 80 ? 'text-accent' : 'text-correct'}`}>{mastery}%</p>
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
        <StageBar cards={song.cards} />
      </div>

      <PhaseRoadmap cards={song.cards} />

      {/* I know this song toggle */}
      <button
        type="button"
        onClick={onToggleKnown}
        className={`mt-4 flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-colors ${song.isKnown ? 'border-correct/40 bg-correct/10' : 'border-border bg-bg-soft'}`}
      >
        <div className="text-left">
          <p className={`text-sm ${song.isKnown ? 'text-correct' : 'text-text'}`}>I know this song</p>
          <p className="text-xs text-text-dim">Hides it from "Now Practicing"</p>
        </div>
        <div className={`relative h-6 w-11 rounded-full transition-colors ${song.isKnown ? 'bg-correct' : 'bg-border'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${song.isKnown ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
      </button>

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

      {/* Test button */}
      <button
        type="button"
        onClick={onTest}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-bg-soft py-3 text-sm text-text-dim hover:border-accent hover:text-accent"
      >
        <span>🏆</span> Test yourself — full recall, all lines
      </button>

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

// ── Phase roadmap ─────────────────────────────────────────────────────────────

const PHASES = [
  {
    label: 'Recognising',
    desc: 'Fill in 25% of each line. Your ears are learning the shapes of the words.',
    // A card has passed this phase once it advances to difficulty 1 (cardMastery ≥ 50)
    passThreshold: 50,
  },
  {
    label: 'Learning',
    desc: 'Fill in 50% of each line. You\'re building active recall.',
    passThreshold: 75,
  },
  {
    label: 'Recalling',
    desc: 'Recall every word from scratch. No safety net.',
    passThreshold: 100,
  },
] as const

function PhaseRoadmap({ cards }: { cards: Card[] }) {
  const total = cards.length
  if (total === 0) return null

  const phaseDone = PHASES.map((p) => cards.filter((c) => cardMastery(c) >= p.passThreshold).length)
  const currentIdx = phaseDone.findIndex((done) => done < total)
  const allMastered = currentIdx === -1

  // Line fill: proportion of the connecting track that should be highlighted
  // Track has (n-1) segments; each segment fills fully once the left phase is done
  const trackFill = allMastered
    ? 100
    : (() => {
        const segmentWidth = 100 / (PHASES.length - 1)
        const completedSegments = currentIdx  // segments before current phase
        const inProgress = total > 0 ? phaseDone[currentIdx] / total : 0
        return (completedSegments + inProgress) * segmentWidth
      })()

  return (
    <section className="mt-5">
      <h2 className="mb-4 text-xs uppercase tracking-[0.15em] text-text-dim">Learning Journey</h2>

      {/* Stepper */}
      <div className="relative">
        {/* Track background */}
        <div className="absolute left-[18px] right-[18px] top-[17px] h-0.5 bg-border" />
        {/* Track fill */}
        <div
          className="absolute left-[18px] top-[17px] h-0.5 bg-accent transition-[width] duration-700"
          style={{ width: `calc(${trackFill}% - ${trackFill === 100 ? 36 : 18}px)` }}
        />

        {/* Nodes + labels */}
        <div className="relative flex justify-between">
          {PHASES.map((phase, i) => {
            const done = phaseDone[i] >= total
            const isCurrent = i === currentIdx

            return (
              <div key={i} className="flex flex-col items-center gap-2" style={{ width: '33.33%' }}>
                <div className={`flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                  done || allMastered
                    ? 'border-correct bg-correct text-bg'
                    : isCurrent
                      ? 'border-accent bg-accent/20 text-accent'
                      : 'border-border bg-bg-soft text-text-dim'
                }`}>
                  {done || allMastered ? '✓' : i + 1}
                </div>
                <p className={`text-center text-xs leading-tight ${
                  done || allMastered ? 'text-correct'
                  : isCurrent ? 'text-accent'
                  : 'text-text-dim'
                }`}>
                  {phase.label}
                </p>
                <p className="text-xs text-text-dim/50">
                  {phaseDone[i]}/{total}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Current phase detail card */}
      <div className={`mt-4 rounded-2xl border px-4 py-3.5 ${allMastered ? 'border-correct/30 bg-correct/5' : 'border-accent/25 bg-accent/5'}`}>
        {allMastered ? (
          <p className="text-sm text-correct">🎉 All {total} lines mastered!</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-accent">Phase {currentIdx + 1} · {PHASES[currentIdx].label}</p>
              <p className="text-xs text-text-dim">{phaseDone[currentIdx]}/{total} lines</p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-text-dim">{PHASES[currentIdx].desc}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-card">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${total > 0 ? (phaseDone[currentIdx] / total) * 100 : 0}%` }}
              />
            </div>
          </>
        )}
      </div>
    </section>
  )
}

// ── Stage breakdown bar ────────────────────────────────────────────────────────

const STAGE_COLORS = ['bg-bg-card', 'bg-wrong/50', 'bg-accent/60', 'bg-correct/50', 'bg-correct'] as const
const STAGE_LABELS = ['Unseen', 'Recognising', 'Learning', 'Recalling', 'Mastered'] as const
const STAGE_VALUES = [0, 25, 50, 75, 100] as const

function StageBar({ cards }: { cards: Card[] }) {
  const total = cards.length
  if (total === 0) return null
  const counts = STAGE_VALUES.map((v) => cards.filter((c) => cardMastery(c) === v).length)
  return (
    <div className="mt-3">
      <div className="flex h-2 w-full overflow-hidden rounded-full">
        {counts.map((count, i) =>
          count > 0 ? (
            <div
              key={i}
              className={`${STAGE_COLORS[i]} transition-[width] duration-500`}
              style={{ width: `${(count / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {counts.map((count, i) =>
          count > 0 ? (
            <span key={i} className="flex items-center gap-1.5 text-xs text-text-dim">
              <span className={`inline-block h-2 w-2 rounded-full ${STAGE_COLORS[i]}`} />
              {STAGE_LABELS[i]} <span className="text-text-dim/60">({count})</span>
            </span>
          ) : null,
        )}
      </div>
    </div>
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
          {STAGE_LABELS[STAGE_VALUES.indexOf(cardMastery(card) as typeof STAGE_VALUES[number])] ?? 'Unseen'}
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
