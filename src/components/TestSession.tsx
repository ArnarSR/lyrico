import { useEffect, useRef, useState } from 'react'
import type { Song } from '../types'
import { scoreAnswer } from '../lib/scoring'
import { Feedback } from './Feedback'
import { Header, IconButton, Shell } from './Shell'

interface TestSessionProps {
  song: Song
  onExit: () => void
  onMasterSong: () => void
}

const PASS_THRESHOLD = 0.8

export function TestSession({ song, onExit, onMasterSong }: TestSessionProps) {
  const cards = song.cards
  const total = cards.length

  const [cardIndex, setCardIndex] = useState(0)
  const [attempt, setAttempt] = useState('')
  const [checked, setChecked] = useState<{
    quality: number; ratio: number; attempt: string; correct: string
  } | null>(null)
  const [results, setResults] = useState<Array<{ passed: boolean; line: string }>>([])
  const [songMastered, setSongMastered] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)

  const isDone = cardIndex >= total
  const passedCount = results.filter((r) => r.passed).length
  const passed = passedCount / total >= PASS_THRESHOLD
  const failedLines = results.filter((r) => !r.passed).map((r) => r.line)

  useEffect(() => {
    if (isDone) return
    if (checked) { nextButtonRef.current?.focus(); return }
    const id = requestAnimationFrame(() => textareaRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [cardIndex, checked, isDone])

  function onCheck() {
    const current = cards[cardIndex]
    if (!current || checked || !attempt.trim()) return
    const result = scoreAnswer(attempt, current.text)
    setChecked({ quality: result.quality, ratio: result.ratio, attempt, correct: current.text })
  }

  function onNext() {
    if (!checked) return
    const current = cards[cardIndex]
    setResults((prev) => [...prev, { passed: checked.quality >= 3, line: current?.text ?? '' }])
    setCardIndex((i) => i + 1)
    setAttempt('')
    setChecked(null)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (checked) onNext()
      else onCheck()
    }
  }

  function handleMasterSong() {
    onMasterSong()
    setSongMastered(true)
  }

  // ── Results screen ──────────────────────────────────────────────────────────
  if (isDone) {
    const pct = Math.round((passedCount / total) * 100)
    const color = passed ? 'text-correct' : pct >= 50 ? 'text-accent' : 'text-wrong'
    const barColor = passed ? 'bg-correct' : pct >= 50 ? 'bg-accent' : 'bg-wrong/70'

    return (
      <Shell>
        <Header title={song.title} subtitle="Test complete" left={<BackButton onClick={onExit} />} />

        <div className="flex flex-col items-center gap-5 mt-6 text-center">
          <p className="text-6xl">{passed ? '🏆' : '📝'}</p>
          <p className="text-2xl text-text">{passed ? 'Test passed!' : 'Not quite yet'}</p>

          {/* Score card */}
          <div className="w-full rounded-2xl border border-border bg-bg-soft p-5">
            <p className={`text-5xl font-medium ${color}`}>{pct}%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-card">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-text-dim">
              {passedCount} of {total} lines correct · {Math.round(PASS_THRESHOLD * 100)}% needed to pass
            </p>
          </div>

          {/* Failed lines */}
          {failedLines.length > 0 && (
            <div className="w-full rounded-2xl border border-border bg-bg-soft p-4 text-left">
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Lines to keep working on</p>
              <ul className="flex flex-col gap-1.5">
                {failedLines.map((line, i) => (
                  <li key={i} className="truncate text-sm text-wrong/80">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          {passed && !songMastered && (
            <button
              type="button"
              onClick={handleMasterSong}
              className="w-full rounded-full border border-correct bg-correct/15 py-3 text-sm text-correct hover:bg-correct/25"
            >
              Mark song as fully mastered ✓
            </button>
          )}
          {songMastered && (
            <p className="text-sm text-correct">✓ Song marked as fully mastered</p>
          )}

          <button
            type="button"
            onClick={onExit}
            className="w-full rounded-full border border-border bg-bg-soft py-3 text-sm text-text-dim hover:text-text"
          >
            Back to song
          </button>

          {!passed && (
            <button
              type="button"
              onClick={() => { setCardIndex(0); setResults([]); setAttempt(''); setChecked(null); setSongMastered(false) }}
              className="text-sm text-accent hover:brightness-110"
            >
              Try again
            </button>
          )}
        </div>
      </Shell>
    )
  }

  // ── Card screen ─────────────────────────────────────────────────────────────
  const current = cards[cardIndex]
  const prevCard = cards.find((c) => c.lineIndex === current.lineIndex - 1)
  const progress = (cardIndex / total) * 100

  return (
    <Shell>
      <Header
        title={song.title}
        subtitle={`Test · Line ${cardIndex + 1} of ${total}`}
        left={<BackButton onClick={onExit} />}
      />

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-bg-card">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Prompt */}
      <section className="mt-8 rounded-2xl border border-border bg-bg-soft p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-text-dim">What comes next?</p>
        {prevCard ? (
          <p className="mt-2 whitespace-pre-wrap text-xl leading-relaxed text-text-dim italic">{prevCard.text}</p>
        ) : (
          <p className="mt-2 text-xl leading-relaxed text-text-dim italic">(first line of the song)</p>
        )}
      </section>

      {/* Input */}
      <section className="mt-4">
        <textarea
          ref={textareaRef}
          value={checked ? checked.attempt : attempt}
          onChange={(e) => setAttempt(e.target.value)}
          onKeyDown={handleKey}
          disabled={!!checked}
          rows={3}
          placeholder="Type the full line from memory…"
          className="w-full resize-none rounded-2xl border border-border bg-bg-soft px-4 py-3 text-lg leading-relaxed text-text placeholder:text-text-dim/60 focus:border-accent disabled:opacity-70"
        />
      </section>

      {checked && (
        <Feedback
          quality={checked.quality}
          ratio={checked.ratio}
          attempt={checked.attempt}
          correct={checked.correct}
          fullLine={current.text}
          showDiff
        />
      )}

      <div className="mt-5">
        {!checked ? (
          <button
            type="button"
            onClick={onCheck}
            disabled={!attempt.trim()}
            className="w-full rounded-full border border-accent bg-accent/15 py-3 text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            Check
          </button>
        ) : (
          <button
            ref={nextButtonRef}
            type="button"
            onClick={onNext}
            className="w-full rounded-full border border-accent bg-accent py-3 text-bg hover:brightness-110"
          >
            {cardIndex + 1 < total ? 'Next line' : 'See results'}
          </button>
        )}
      </div>
    </Shell>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Exit test" onClick={onClick}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </IconButton>
  )
}
