import type { Card, Song } from '../types'
import { isMastered, masteryPercent } from '../hooks/useSM2'
import { getStanzaStarts } from '../lib/stanzas'
import { useNow } from '../hooks/useNow'
import { Header, IconButton, Shell } from './Shell'

interface SongStatsProps {
  song: Song
  onBack: () => void
  onStudy: () => void
  onStudyVerse: (stanzaIdx: number) => void
  onStanzaDrill: () => void
  onDelete: () => void
}

const DAY_MS = 86_400_000

export function SongStats({ song, onBack, onStudy, onStudyVerse, onStanzaDrill, onDelete }: SongStatsProps) {
  const now = useNow()
  const mastery = masteryPercent(song)

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
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </IconButton>
        }
      />

      <div className="rounded-2xl border border-border bg-bg-soft p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-text-dim">
              Mastery
            </p>
            <p className="mt-1 text-3xl text-accent">{mastery}%</p>
          </div>
          {concertDays !== null && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.15em] text-text-dim">
                Concert
              </p>
              <p
                className={`mt-1 text-lg ${concertDays <= 7 ? 'text-wrong' : 'text-text'}`}
              >
                {concertDays <= 0
                  ? 'Today'
                  : `${concertDays} day${concertDays === 1 ? '' : 's'}`}
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${mastery}%` }}
          />
        </div>
      </div>

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

      {verses.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Verses</h2>
          <ol className="flex flex-col gap-2">
            {verses.map((verse, i) => (
              <li key={verse.stanzaIdx}>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-soft px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-text-dim">
                      Verse {i + 1} · {verse.masteredCount}/{verse.cards.length} mastered
                    </p>
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

      <section className="mt-6">
        <h2 className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">
          Lines
        </h2>
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

function LineRow({
  card,
  index,
  now,
}: {
  card: Card
  index: number
  now: number
}) {
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
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
            mastered
              ? 'border-correct/40 text-correct'
              : 'border-border text-text-dim'
          }`}
        >
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
