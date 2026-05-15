import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card, Song } from '../types'
import { cardMastery, useSM2 } from '../hooks/useSM2'
import { buildSegments, buildSegmentsForWords, getBlankedWords } from '../lib/blanks'
import type { Segment } from '../lib/blanks'
import { normalize, scoreAnswer, fuzzyWordMatch } from '../lib/scoring'
import { trackStudyStarted, trackStudyCompleted, trackStudyExited } from '../lib/analytics'
import { Feedback } from './Feedback'
import { Header, IconButton, Shell } from './Shell'

interface StudySessionProps {
  song: Song
  activeCards?: Card[] // if set, only these cards are drilled (e.g. a single verse)
  onExit: () => void
  onCardReviewed: (card: Card) => void
  onReportLine?: (songId: string, lineIndex: number, currentText: string, suggestion: string) => void
}

const DIFFICULTY_LABEL = ['Fill 25%', 'Fill 50%', 'Full recall'] as const

export function StudySession({
  song,
  activeCards: activeProp,
  onExit,
  onCardReviewed,
  onReportLine,
}: StudySessionProps) {
  const { review } = useSM2()
  // activeCards is the working set for this session (all or a single verse).
  const activeCards = activeProp ?? song.cards

  type RepeatEntry = { id: string; focusWords?: string[] }
  const [repeatQueue, setRepeatQueue] = useState<RepeatEntry[]>([])
  // Cards answered correctly in this session — don't show again until next session.
  const [sessionDone, setSessionDone] = useState<Set<string>>(new Set())

  // Snapshot of cards that were due when this session started. Fixed for the
  // lifetime of the session so SM-2 scheduling governs what appears each day.
  const [sessionCards] = useState<Card[]>(() => {
    const now = Date.now()
    return activeCards
      .filter((c) => c.nextDue <= now)
      .sort((a, b) => a.nextDue - b.nextDue)
  })

  const [startTime] = useState(Date.now)
  const [cardsReviewedCount, setCardsReviewedCount] = useState(0)
  const [sessionComplete, setSessionComplete] = useState(false)

  // Track session start
  useEffect(() => {
    trackStudyStarted(song.id, sessionCards.length, activeProp ? 'verse' : 'full')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleExit() {
    if (sessionComplete) {
      trackStudyCompleted(song.id, cardsReviewedCount, Date.now() - startTime)
    } else {
      const remaining = effectiveSession.filter((c) => !sessionDone.has(c.id)).length + repeatQueue.length
      trackStudyExited(song.id, cardsReviewedCount, remaining)
    }
    onExit()
  }

  // Overrides the schedule — user chose to practice even though nothing is due.
  const [overrideAll, setOverrideAll] = useState(false)
  const effectiveSession = useMemo(
    () => overrideAll ? [...activeCards].sort((a, b) => a.nextDue - b.nextDue) : sessionCards,
    [overrideAll, activeCards, sessionCards],
  )

  const current = useMemo(() => {
    // Look up live card state (updated by onCardReviewed) but only for session cards.
    const liveById = new Map(activeCards.map((c) => [c.id, c]))
    const pending = effectiveSession
      .filter((sc) => !sessionDone.has(sc.id) && !repeatQueue.some((e) => e.id === sc.id))
      .map((sc) => liveById.get(sc.id) ?? sc)
    if (pending.length > 0) return pending[0]
    if (repeatQueue.length > 0) {
      return activeCards.find((c) => c.id === repeatQueue[0].id) ?? null
    }
    return null
  }, [activeCards, effectiveSession, repeatQueue, sessionDone])

  // Inline mode: blanks rendered as inputs inside the prompt text (difficulty 0 or 1).
  // Full-recall mode: single textarea, user types the whole line (difficulty 2).
  const isInline = !!(current && current.difficulty < 2)

  // When re-showing a card from the repeat queue, only blank the specific words
  // the user got wrong last time (focusWords). Otherwise use difficulty-based blanks.
  const repeatEntry = repeatQueue.find((e) => e.id === current?.id)

  const segments = useMemo<Segment[]>(() => {
    if (!current || !isInline) return []
    if (repeatEntry?.focusWords) return buildSegmentsForWords(current.text, repeatEntry.focusWords)
    return buildSegments(current.text, current.difficulty)
  }, [current, isInline, repeatEntry])
  const blankCount = segments.filter((s) => s.type === 'blank').length

  const [blankValues, setBlankValues] = useState<string[]>(() => new Array(blankCount).fill(''))
  const [attempt, setAttempt] = useState('') // full-recall textarea
  const [hintCount, setHintCount] = useState(0)
  const [checked, setChecked] = useState<{
    card: Card
    quality: number
    ratio: number
    attempt: string
    correctAnswer: string
    wrongWords: string[]
    hintUsed: boolean
  } | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportText, setReportText] = useState('')
  const [reportSent, setReportSent] = useState(false)

  const [lastCardId, setLastCardId] = useState(current?.id)

  // Reset transient state synchronously when the card changes.
  if (current && current.id !== lastCardId) {
    setLastCardId(current.id)
    setAttempt('')
    setBlankValues(new Array(blankCount).fill(''))
    setChecked(null)
    setHintCount(0)
    setReportOpen(false)
    setReportText('')
    setReportSent(false)
  }

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const blankRefs = useRef<(HTMLInputElement | null)[]>([])
  const nextButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (checked) {
      nextButtonRef.current?.focus()
      return
    }
    const id = requestAnimationFrame(() => {
      if (isInline) blankRefs.current[0]?.focus()
      else textareaRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [current?.id, checked, isInline])

  const progress = activeCards.length === 0 ? 0
    : activeCards.reduce((sum, c) => sum + cardMastery(c), 0) / activeCards.length

  // Milestone celebration toast
  const [sessionStartMastery] = useState(() =>
    activeCards.length === 0 ? 0
      : Math.round(activeCards.reduce((sum, c) => sum + cardMastery(c), 0) / activeCards.length),
  )
  const prevMasteryRef = useRef(sessionStartMastery)
  const [milestone, setMilestone] = useState<{ icon: string; text: string; sub: string } | null>(null)

  useEffect(() => {
    if (activeCards.length === 0) return
    const current = Math.round(activeCards.reduce((sum, c) => sum + cardMastery(c), 0) / activeCards.length)
    const prev = prevMasteryRef.current
    const MILESTONES = [
      { threshold: 100, icon: '🎉', text: 'Song mastered!', sub: 'Every line is locked in.' },
      { threshold: 75, icon: '⭐', text: '75% there!', sub: 'The hard part is behind you.' },
      { threshold: 50, icon: '🎵', text: 'Halfway there!', sub: 'Keep that momentum going.' },
      { threshold: 25, icon: '🌱', text: 'Getting started!', sub: 'Your first lines are sticking.' },
    ]
    const crossed = MILESTONES.filter((m) => prev < m.threshold && current >= m.threshold)
    if (crossed.length > 0) setMilestone(crossed[0])
    prevMasteryRef.current = current
  }, [activeCards])

  useEffect(() => {
    if (!milestone) return
    const t = setTimeout(() => setMilestone(null), 2800)
    return () => clearTimeout(t)
  }, [milestone])

  if (!current) {
    if (!sessionComplete && cardsReviewedCount > 0) setSessionComplete(true)
    const isEmpty = activeCards.length === 0
    const nothingDue = !isEmpty && sessionCards.length === 0
    const nextDue = nothingDue
      ? Math.min(...activeCards.map((c) => c.nextDue))
      : null
    const nextDueLabel = nextDue
      ? new Date(nextDue).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
      : null

    return (
      <Shell>
        <Header
          title={song.title}
          subtitle="Study session"
          left={<BackButton onClick={handleExit} />}
        />
        {isEmpty ? (
          <p className="mt-8 text-center text-text-dim">This song has no lines yet.</p>
        ) : nothingDue ? (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <p className="text-5xl text-accent">◷</p>
            <p className="text-xl text-text">Nothing due yet</p>
            <p className="text-text-dim">Next review: {nextDueLabel}</p>
            <button
              type="button"
              onClick={() => setOverrideAll(true)}
              className="mt-4 rounded-full border border-accent bg-accent px-6 py-3 text-bg hover:brightness-110"
            >
              Practice anyway
            </button>
            <button
              type="button"
              onClick={handleExit}
              className="rounded-full border border-border px-6 py-2.5 text-sm text-text-dim hover:text-text"
            >
              Back to library
            </button>
          </div>
        ) : (() => {
          const pct = Math.round(progress)
          const isFullyMastered = pct === 100
          return (
            <div className="mt-12 flex flex-col items-center gap-3 text-center">
              <p className="text-5xl">{isFullyMastered ? '🎉' : '✓'}</p>
              <p className="text-xl text-text">{isFullyMastered ? 'Song mastered!' : 'Session complete'}</p>
              <p className="text-text-dim">
                {cardsReviewedCount} line{cardsReviewedCount !== 1 ? 's' : ''} reviewed
              </p>
              {/* Stage breakdown summary */}
              <div className="mt-2 w-full max-w-xs rounded-2xl border border-border bg-bg-soft px-4 py-3">
                <p className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Song progress</p>
                <StageMiniBar cards={activeCards} />
                <p className={`mt-2 text-2xl font-medium ${pct < 50 ? 'text-wrong' : pct < 80 ? 'text-accent' : 'text-correct'}`}>{pct}%</p>
              </div>
              <button
                type="button"
                onClick={handleExit}
                className="mt-4 rounded-full border border-accent bg-accent/15 px-6 py-3 text-accent hover:bg-accent/25"
              >
                Back to library
              </button>
            </div>
          )
        })()}
      </Shell>
    )
  }

  const correctAnswer =
    current.difficulty === 2
      ? current.text
      : repeatEntry?.focusWords
        ? repeatEntry.focusWords.join(' ')
        : getBlankedWords(current.text, current.difficulty)

  const effectiveAttempt = isInline ? blankValues.join(' ') : attempt
  const canCheck = effectiveAttempt.trim().length > 0

  // Hint: reveal words one at a time for full-recall mode only.
  const fullRecallWords = !isInline ? current.text.split(/\s+/).filter(Boolean) : []
  const hintWords = fullRecallWords.slice(0, hintCount)
  const canHint = !isInline && !checked && hintCount < fullRecallWords.length

  function onCheck() {
    if (!current || checked || !canCheck) return
    const result = scoreAnswer(effectiveAttempt, correctAnswer)
    // Using a hint caps the quality at 3 (Passed) — a perfect answer without hints
    // is the only way to score higher.
    const quality = hintCount > 0 ? Math.min(result.quality, 3) : result.quality

    // Identify which individual blanks were wrong so the repeat only targets those.
    const wrongWords: string[] = []
    if (isInline) {
      let bidx = 0
      for (const seg of segments) {
        if (seg.type === 'blank') {
          if (!fuzzyWordMatch(normalize(blankValues[bidx] ?? ''), normalize(seg.answer))) {
            wrongWords.push(seg.answer)
          }
          bidx++
        }
      }
    }

    setChecked({ card: current, quality, ratio: result.ratio, attempt: effectiveAttempt, correctAnswer, wrongWords, hintUsed: hintCount > 0 })
  }

  function onNext() {
    if (!checked) return
    const updated = review(checked.card, checked.quality, song.concertDate)
    onCardReviewed(updated)
    setCardsReviewedCount((n) => n + 1)
    if (checked.quality < 3) {
      const entry: RepeatEntry = {
        id: checked.card.id,
        focusWords: checked.wrongWords.length > 0 ? checked.wrongWords : undefined,
      }
      setRepeatQueue((q) => [...q.filter((e) => e.id !== checked.card.id), entry])
    } else {
      setRepeatQueue((q) => q.filter((e) => e.id !== checked.card.id))
      setSessionDone((s) => new Set([...s, checked.card.id]))
    }
    // Reset immediately — the render guard only fires when current.id changes, but
    // a re-queued card keeps the same id so the guard never triggers.
    setChecked(null)
    setAttempt('')
    setBlankValues([])
    setHintCount(0)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (checked) onNext()
      else onCheck()
    }
  }

  let blankIdx = 0

  return (
    <Shell>
      {/* Milestone toast */}
      {milestone && (
        <div className="pointer-events-none fixed inset-x-4 top-16 z-50 flex justify-center">
          <div className="rounded-2xl bg-accent px-6 py-4 text-center shadow-2xl">
            <p className="text-xl font-semibold text-bg">{milestone.icon} {milestone.text}</p>
            <p className="mt-0.5 text-sm text-bg/70">{milestone.sub}</p>
          </div>
        </div>
      )}

      <Header
        title={song.title}
        subtitle={`${DIFFICULTY_LABEL[current.difficulty]} · ${Math.round(progress)}% mastered`}
        left={<BackButton onClick={handleExit} />}
        right={song.audioUrl ? <AudioToggle src={song.audioUrl} /> : undefined}
      />

      <ProgressBar percent={progress} />

      <section className="mt-8 rounded-2xl border border-border bg-bg-soft p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-text-dim">Prompt</p>

        {(() => {
          const prevCard = song.cards.find((c) => c.lineIndex === current.lineIndex - 1)
          return prevCard ? (
            <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-text-dim/60 italic">
              {prevCard.text}
            </p>
          ) : null
        })()}

        {isInline ? (
          <p className="mt-2 text-xl leading-[2.2] text-text">
            {segments.map((seg, i) => {
              if (seg.type === 'text') return <span key={i}>{seg.value}</span>

              const idx = blankIdx++
              const isCorrect = checked && fuzzyWordMatch(normalize(blankValues[idx] ?? ''), normalize(seg.answer))
              const borderColor = !checked
                ? 'border-accent'
                : isCorrect
                  ? 'border-correct'
                  : 'border-wrong'
              const textColor = !checked ? '' : isCorrect ? 'text-correct' : 'text-wrong'

              return (
                <input
                  key={i}
                  ref={(el) => { blankRefs.current[idx] = el }}
                  value={blankValues[idx] ?? ''}
                  onChange={(e) => {
                    const next = Array.from({ length: blankCount }, (_, j) => blankValues[j] ?? '')
                    next[idx] = e.target.value
                    setBlankValues(next)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === ' ' && !checked) {
                      const next = blankRefs.current[idx + 1]
                      if (next) { e.preventDefault(); next.focus() }
                    } else {
                      handleKey(e)
                    }
                  }}
                  disabled={!!checked}
                  style={{ width: `${Math.max(seg.answer.length, 4) + 1}ch` }}
                  className={`mx-1 inline-block border-b-2 bg-transparent text-center text-xl focus:outline-none disabled:opacity-80 ${borderColor} ${textColor}`}
                />
              )
            })}
          </p>
        ) : (
          <>
            {hintWords.length > 0 && (
              <p className="mt-2 border-t border-border/50 pt-2 text-base text-accent-soft/80 italic">
                {hintWords.join(' ')}{hintCount < fullRecallWords.length ? ' …' : ''}
              </p>
            )}
          </>
        )}
      </section>

      {!isInline && (
        <section className="mt-4">
          <textarea
            ref={textareaRef}
            value={checked ? checked.attempt : attempt}
            onChange={(e) => setAttempt(e.target.value)}
            onKeyDown={handleKey}
            disabled={!!checked}
            rows={3}
            placeholder="Type the full line…"
            className="w-full resize-y rounded-2xl border border-border bg-bg-soft px-4 py-3 text-lg leading-relaxed text-text placeholder:text-text-dim/60 focus:border-accent disabled:opacity-70"
          />
          {canHint && (
            <button
              type="button"
              onClick={() => setHintCount((c) => c + 1)}
              className="mt-1.5 block w-full text-right text-sm text-text-dim/60 hover:text-text-dim"
            >
              {hintCount === 0 ? 'Hint' : `${hintCount} / ${fullRecallWords.length} words revealed`}
            </button>
          )}
        </section>
      )}

      {checked && (
        <Feedback
          quality={checked.quality}
          ratio={checked.ratio}
          attempt={checked.attempt}
          correct={checked.correctAnswer}
          fullLine={current.text}
          showDiff={!isInline}
        />
      )}

      {checked && onReportLine && (
        <div className="mt-3">
          {reportSent ? (
            <p className="text-center text-xs text-correct">Thanks for reporting — admins will review it.</p>
          ) : reportOpen ? (
            <div className="rounded-xl border border-border bg-bg-soft p-3">
              <p className="mb-2 text-xs text-text-dim">Suggest a correction (optional):</p>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder={current.text}
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-accent focus:outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await onReportLine(song.id, current.lineIndex, current.text, reportText.trim())
                    setReportSent(true)
                    setReportOpen(false)
                  }}
                  className="rounded-full border border-accent bg-accent/15 px-4 py-1.5 text-xs text-accent hover:bg-accent/25"
                >
                  Send report
                </button>
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="rounded-full border border-border px-4 py-1.5 text-xs text-text-dim hover:text-text"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="block w-full text-center text-xs text-text-dim/50 hover:text-text-dim"
            >
              Something wrong with this line?
            </button>
          )}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        {!checked ? (
          <button
            type="button"
            onClick={onCheck}
            disabled={!canCheck}
            className="flex-1 rounded-full border border-accent bg-accent/15 py-3 text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            Check
          </button>
        ) : (
          <button
            ref={nextButtonRef}
            type="button"
            onClick={onNext}
            className="flex-1 rounded-full border border-accent bg-accent py-3 text-bg hover:brightness-110"
          >
            Next line
          </button>
        )}
      </div>

      {/* Keyboard hints */}
      <p className="mt-3 hidden text-center text-xs text-text-dim/60 sm:block">
        {isInline ? (
          <>Press <Kbd>Space</Kbd> for next word · <Kbd>Enter</Kbd> to {checked ? 'continue' : 'check'}</>
        ) : (
          <>Press <Kbd>Enter</Kbd> to {checked ? 'continue' : 'check'}</>
        )}
      </p>
    </Shell>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
      {children}
    </kbd>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  const color = percent < 50 ? 'bg-wrong/70' : percent < 80 ? 'bg-accent' : 'bg-correct'
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-bg-card">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${color}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function StageMiniBar({ cards }: { cards: Card[] }) {
  const total = cards.length
  if (total === 0) return null
  const counts = [0, 25, 50, 75, 100].map((stage) => cards.filter((c) => cardMastery(c) === stage).length)
  const colors = ['bg-bg-card', 'bg-wrong/50', 'bg-accent/60', 'bg-correct/50', 'bg-correct']
  const labels = ['Unseen', 'Recognising', 'Learning', 'Recalling', 'Mastered']

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {counts.map((count, i) =>
          count > 0 ? (
            <div
              key={i}
              className={`${colors[i]} transition-[width] duration-500`}
              style={{ width: `${(count / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {counts.map((count, i) =>
          count > 0 ? (
            <span key={i} className="flex items-center gap-1 text-xs text-text-dim">
              <span className={`inline-block h-2 w-2 rounded-full ${colors[i]}`} />
              {labels[i]} ({count})
            </span>
          ) : null,
        )}
      </div>
    </div>
  )
}


function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Back to library" onClick={onClick}>
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
  )
}

function AudioToggle({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onEnd = () => setPlaying(false)
    el.addEventListener('ended', onEnd)
    el.addEventListener('pause', onEnd)
    return () => {
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('pause', onEnd)
    }
  }, [])

  function toggle() {
    const el = ref.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  return (
    <>
      <audio ref={ref} src={src} preload="metadata" />
      <IconButton label={playing ? 'Pause audio' : 'Play audio'} onClick={toggle}>
        {playing ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </IconButton>
    </>
  )
}
