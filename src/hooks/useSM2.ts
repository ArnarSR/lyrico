import { useCallback } from 'react'
import type { Card, Difficulty, Song } from '../types'

const DAY_MS = 86_400_000

// --- Pure SM-2 core --------------------------------------------------------

export interface SM2State {
  interval: number
  repetitions: number
  easeFactor: number
  nextDue: number
  lastQuality: number
  difficulty: Difficulty
}

/**
 * Apply an SM-2 review to a card.
 *
 * Rules (per the spec):
 *   - quality 0–2: reset repetitions to 0, interval to 1 day
 *   - quality 3–5: interval = 1 (first), 6 (second), round(interval*EF) thereafter;
 *                   repetitions++
 *   - easeFactor = max(1.3, EF + 0.1 - (5-q)(0.08 + (5-q)*0.02))
 *   - nextDue = now + interval * 86_400_000
 *
 * `now` defaults to Date.now() but is injectable for tests.
 *
 * `concertDate` (optional): when set, the scheduled interval is compressed as
 * the concert approaches: effectiveInterval = interval * max(0.3, daysRemaining/30).
 * The stored `interval` itself stays SM-2-pure; only `nextDue` is pulled in.
 */
export function applySM2(
  card: Card,
  quality: number,
  opts: { now?: number; concertDate?: number } = {},
): SM2State {
  const now = opts.now ?? Date.now()
  const q = Math.max(0, Math.min(5, Math.round(quality)))

  // Ease factor update — applied for every review.
  const nextEF = Math.max(
    1.3,
    card.easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02),
  )

  let repetitions: number
  let interval: number

  if (q < 3) {
    repetitions = 0
    interval = 1
  } else {
    repetitions = card.repetitions + 1
    if (repetitions === 1) interval = 1
    else if (repetitions === 2) interval = 6
    else interval = Math.round(card.interval * nextEF)
  }

  // Difficulty auto-advances on strong recall, steps back on failure.
  let difficulty = card.difficulty
  if (q >= 4 && difficulty < 2) difficulty = (difficulty + 1) as Difficulty
  else if (q < 3 && difficulty > 0) difficulty = (difficulty - 1) as Difficulty

  // Concert-date compression.
  let scheduleInterval = interval
  if (opts.concertDate && opts.concertDate > now) {
    const daysRemaining = (opts.concertDate - now) / DAY_MS
    const factor = Math.max(0.3, daysRemaining / 30)
    scheduleInterval = interval * factor
  }

  const nextDue = now + scheduleInterval * DAY_MS

  return {
    interval,
    repetitions,
    easeFactor: nextEF,
    nextDue,
    lastQuality: q,
    difficulty,
  }
}

/** Build a brand-new card with neutral SM-2 state, due immediately. */
export function makeCard(
  id: string,
  lineIndex: number,
  text: string,
  now = Date.now(),
): Card {
  return {
    id,
    lineIndex,
    text,
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    nextDue: now,
    lastQuality: null,
    difficulty: 0,
  }
}

/** A card is "mastered" once it has reached full-recall difficulty and graduated (interval ≥ 6). */
export function isMastered(card: Card): boolean {
  return card.difficulty >= 2 && card.repetitions >= 2 && card.interval >= 6
}

export function masteryPercent(song: Song): number {
  if (song.cards.length === 0) return 0
  const mastered = song.cards.filter(isMastered).length
  return Math.round((mastered / song.cards.length) * 100)
}

// --- Hook ------------------------------------------------------------------

/**
 * React helper exposing the SM-2 primitives plus a "pick next due card" helper.
 */
export function useSM2() {
  const review = useCallback(
    (card: Card, quality: number, concertDate?: number): Card => {
      const next = applySM2(card, quality, { concertDate })
      return { ...card, ...next }
    },
    [],
  )

  const nextDueCard = useCallback(
    (song: Song, now = Date.now()): Card | null => {
      const due = song.cards
        .filter((c) => c.nextDue <= now)
        .sort((a, b) => a.nextDue - b.nextDue)
      if (due.length > 0) return due[0]
      // Nothing due yet — surface the card due soonest so the session still works.
      const upcoming = [...song.cards].sort((a, b) => a.nextDue - b.nextDue)
      return upcoming[0] ?? null
    },
    [],
  )

  return { review, nextDueCard, applySM2, makeCard, isMastered, masteryPercent }
}
