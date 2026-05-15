import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card, Song } from '../types'
import { Header, Shell } from './Shell'
import { buildSegments, type Segment } from '../lib/blanks'
import { useSM2 } from '../hooks/useSM2'
import { trackStudyStarted, trackStudyCompleted, trackStudyExited } from '../lib/analytics'

interface WordBankSessionProps {
  song: Song
  onExit: () => void
  onCardReviewed: (card: Card) => void
}

const NUM_DISTRACTORS = 3

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[.,;:!?'"…—–-]/g, '')
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Word-bank tiles: tap to place into blanks, tap placed tile to return. */
export function WordBankSession({ song, onExit, onCardReviewed }: WordBankSessionProps) {
  const { review } = useSM2()
  // Practice all real (non-section-label) cards, lowest mastery first
  const cards = useMemo(
    () => song.cards.filter((c) => c.text.trim().length > 0)
      .slice()
      .sort((a, b) => a.repetitions - b.repetitions),
    [song.cards],
  )
  const [index, setIndex] = useState(0)
  const current = cards[index]
  const [reviewedCount, setReviewedCount] = useState(0)
  const [sessionStart] = useState(() => Date.now())
  const exitedRef = useRef(false)

  useEffect(() => {
    trackStudyStarted(song.id, cards.length, 'word_bank')
  }, [song.id, cards.length])

  function handleExit() {
    if (!exitedRef.current) {
      exitedRef.current = true
      if (current) {
        trackStudyExited(song.id, reviewedCount, cards.length - index)
      } else {
        trackStudyCompleted(song.id, reviewedCount, Date.now() - sessionStart)
      }
    }
    onExit()
  }

  if (!current) {
    return (
      <Shell>
        <Header
          title={song.title}
          subtitle="Word bank · session"
          right={
            <button type="button" onClick={handleExit} className="text-sm text-text-dim hover:text-text">
              Done
            </button>
          }
        />
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <span className="text-5xl">🎉</span>
          <p className="text-lg text-text">All lines done</p>
          <p className="text-sm text-text-dim">You reviewed {reviewedCount} line{reviewedCount !== 1 ? 's' : ''}.</p>
          <button
            type="button"
            onClick={handleExit}
            className="mt-2 rounded-full border border-accent bg-accent px-8 py-3 text-bg hover:brightness-110"
          >
            Done
          </button>
        </div>
      </Shell>
    )
  }

  return (
    <Round
      key={current.id}
      song={song}
      card={current}
      onComplete={(quality) => {
        const reviewed = review(current, quality)
        onCardReviewed(reviewed)
        setReviewedCount((n) => n + 1)
        setIndex((i) => i + 1)
      }}
      onExit={handleExit}
      progress={{ index, total: cards.length }}
    />
  )
}

// ── Single round ───────────────────────────────────────────────────────────────

interface RoundProps {
  song: Song
  card: Card
  progress: { index: number; total: number }
  onComplete: (quality: number) => void
  onExit: () => void
}

function Round({ song, card, progress, onComplete, onExit }: RoundProps) {
  // Always use a moderate blank density for word-bank mode (~50% of words)
  const segments = useMemo<Segment[]>(() => buildSegments(card.text, 1), [card])
  const blanks = useMemo(() => segments.filter((s): s is { type: 'blank'; answer: string } => s.type === 'blank'), [segments])
  const correctAnswers = blanks.map((b) => b.answer)

  // Build the tile pool: correct answers + distractors from other cards
  const tiles = useMemo(() => {
    const otherWords = song.cards
      .filter((c) => c.id !== card.id)
      .flatMap((c) => c.text.split(/\s+/))
      .map((w) => w.trim())
      .filter((w) => w.length > 1)
    const correctNormalized = new Set(correctAnswers.map(normalize))
    const distractorPool = Array.from(new Set(otherWords))
      .filter((w) => !correctNormalized.has(normalize(w)))
    const distractors = shuffle(distractorPool).slice(0, Math.min(NUM_DISTRACTORS, Math.max(2, blanks.length)))
    return shuffle([...correctAnswers, ...distractors])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  // placements[blankIndex] = poolIndex (which tile fills which blank) or null
  const [placements, setPlacements] = useState<(number | null)[]>(() => new Array(blanks.length).fill(null))
  const placedTileSet = useMemo(() => new Set(placements.filter((p): p is number => p !== null)), [placements])
  const [checked, setChecked] = useState<{ correct: boolean[]; quality: number } | null>(null)

  function placeTile(poolIndex: number) {
    if (checked) return
    if (placedTileSet.has(poolIndex)) return
    // Find first empty blank
    setPlacements((prev) => {
      const next = [...prev]
      const empty = next.findIndex((v) => v === null)
      if (empty === -1) return prev
      next[empty] = poolIndex
      return next
    })
  }

  function removeTile(blankIndex: number) {
    if (checked) return
    setPlacements((prev) => {
      const next = [...prev]
      next[blankIndex] = null
      return next
    })
  }

  const allFilled = placements.every((p) => p !== null)

  function check() {
    if (!allFilled) return
    const correct = placements.map((poolIdx, blankIdx) => {
      if (poolIdx === null) return false
      return normalize(tiles[poolIdx]) === normalize(correctAnswers[blankIdx])
    })
    const wrongCount = correct.filter((c) => !c).length
    const quality = wrongCount === 0 ? 5 : wrongCount === 1 ? 3 : wrongCount === 2 ? 2 : 1
    setChecked({ correct, quality })
  }

  return (
    <Shell>
      <Header
        title={song.title}
        subtitle={`Word bank · ${progress.index + 1} of ${progress.total}`}
        right={
          <button type="button" onClick={onExit} className="text-sm text-text-dim hover:text-text">
            Exit
          </button>
        }
      />

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-bg-card">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${(progress.index / progress.total) * 100}%` }}
        />
      </div>

      {/* Previous line (context) */}
      <PreviousLine song={song} card={card} />

      {/* Line with blanks rendered as tile slots */}
      <section className="mt-6 rounded-2xl border border-border bg-bg-soft p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-text-dim">Fill in</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-3 text-xl leading-relaxed text-text">
          {(() => {
            let blankIdx = -1
            return segments.map((seg, i) => {
              if (seg.type === 'text') {
                return <span key={i}>{seg.value}</span>
              }
              blankIdx++
              const localBlankIdx = blankIdx
              const placed = placements[localBlankIdx]
              const isCorrect = checked?.correct[localBlankIdx]
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!!checked}
                  onClick={() => placed !== null && removeTile(localBlankIdx)}
                  className={`min-w-[3.5ch] rounded-lg border-2 px-2.5 py-1 text-base transition-colors ${
                    checked
                      ? isCorrect
                        ? 'border-correct bg-correct/10 text-correct'
                        : 'border-wrong bg-wrong/10 text-wrong'
                      : placed !== null
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-dashed border-border bg-bg-card text-text-dim'
                  }`}
                  style={{ minWidth: `${Math.max(seg.answer.length, 3) + 1.5}ch` }}
                >
                  {placed !== null ? tiles[placed] : ' '}
                </button>
              )
            })
          })()}
        </div>
      </section>

      {/* Word bank pool */}
      {!checked && (
        <section className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Word bank</p>
          <div className="flex flex-wrap gap-2">
            {tiles.map((word, i) => {
              const used = placedTileSet.has(i)
              return (
                <button
                  key={`${word}-${i}`}
                  type="button"
                  disabled={used}
                  onClick={() => placeTile(i)}
                  className={`rounded-xl border px-3.5 py-2 text-base transition-colors ${
                    used
                      ? 'border-border bg-bg-card text-text-dim/40'
                      : 'border-border bg-bg-soft text-text hover:border-accent hover:text-accent active:bg-bg-card'
                  }`}
                >
                  {word}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Feedback after check */}
      {checked && (
        <section className="mt-5 rounded-2xl border border-border bg-bg-soft px-4 py-3">
          <p className="text-xs uppercase tracking-[0.15em] text-text-dim">
            {checked.correct.every(Boolean) ? '✓ Perfect' : 'Result'}
          </p>
          <p className="mt-2 text-base text-text">
            <span className="text-text-dim">Correct:</span> {card.text}
          </p>
        </section>
      )}

      {/* Action */}
      <div className="mt-5 flex gap-3">
        {!checked ? (
          <button
            type="button"
            onClick={check}
            disabled={!allFilled}
            className="flex-1 rounded-full border border-accent bg-accent/15 py-3 text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            Check
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onComplete(checked.quality)}
            autoFocus
            className="flex-1 rounded-full border border-accent bg-accent py-3 text-bg hover:brightness-110"
          >
            Next line
          </button>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-text-dim/60">
        Tap a word to place it · tap a placed word to send it back
      </p>
    </Shell>
  )
}

function PreviousLine({ song, card }: { song: Song; card: Card }) {
  const prev = song.cards.find((c) => c.lineIndex === card.lineIndex - 1)
  if (!prev) return null
  return (
    <p className="mt-6 text-base italic text-text-dim/70">{prev.text}</p>
  )
}
