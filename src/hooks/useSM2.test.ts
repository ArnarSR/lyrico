import { describe, expect, it } from 'vitest'
import { applySM2, cardMastery, isMastered, makeCard, masteryPercent } from './useSM2'
import type { Song } from '../types'

const NOW = 1_700_000_000_000 // fixed epoch ms
const DAY_MS = 86_400_000

describe('makeCard', () => {
  it('creates a fresh card with neutral SM-2 state, due immediately', () => {
    const card = makeCard('c1', 2, 'hello world', NOW)
    expect(card).toEqual({
      id: 'c1',
      lineIndex: 2,
      text: 'hello world',
      interval: 0,
      repetitions: 0,
      easeFactor: 2.5,
      nextDue: NOW,
      lastQuality: null,
      difficulty: 0,
    })
  })
})

describe('applySM2', () => {
  it('schedules 1 day, then 6 days, then EF-scaled intervals on consecutive successes', () => {
    let card = makeCard('c1', 0, 'line', NOW)

    const r1 = applySM2(card, 5, { now: NOW })
    expect(r1.repetitions).toBe(1)
    expect(r1.interval).toBe(1)

    card = { ...card, ...r1 }
    const r2 = applySM2(card, 5, { now: NOW })
    expect(r2.repetitions).toBe(2)
    expect(r2.interval).toBe(6)

    card = { ...card, ...r2 }
    const r3 = applySM2(card, 5, { now: NOW })
    expect(r3.repetitions).toBe(3)
    // interval = round(previous interval * the EF *after this review's update*)
    expect(r3.interval).toBe(Math.round(card.interval * (r2.easeFactor + 0.1)))
  })

  it('resets repetitions and interval to 1 day on a failing quality (<3)', () => {
    const card = { ...makeCard('c1', 0, 'line', NOW), repetitions: 4, interval: 20, easeFactor: 2.8 }
    const result = applySM2(card, 1, { now: NOW })
    expect(result.repetitions).toBe(0)
    expect(result.interval).toBe(1)
    expect(result.nextDue).toBe(NOW + DAY_MS)
  })

  it('never lets easeFactor drop below 1.3', () => {
    let card = makeCard('c1', 0, 'line', NOW)
    for (let i = 0; i < 20; i++) {
      const result = applySM2(card, 0, { now: NOW })
      card = { ...card, ...result }
      expect(card.easeFactor).toBeGreaterThanOrEqual(1.3)
    }
    expect(card.easeFactor).toBeCloseTo(1.3, 5)
  })

  it('advances difficulty on strong recall (q>=4) up to a max of 2', () => {
    let card = makeCard('c1', 0, 'line', NOW)
    expect(card.difficulty).toBe(0)
    card = { ...card, ...applySM2(card, 4, { now: NOW }) }
    expect(card.difficulty).toBe(1)
    card = { ...card, ...applySM2(card, 5, { now: NOW }) }
    expect(card.difficulty).toBe(2)
    // Already at max — stays at 2.
    card = { ...card, ...applySM2(card, 5, { now: NOW }) }
    expect(card.difficulty).toBe(2)
  })

  it('steps difficulty back on failure (q<3), floored at 0', () => {
    const card = { ...makeCard('c1', 0, 'line', NOW), difficulty: 1 as const }
    const result = applySM2(card, 1, { now: NOW })
    expect(result.difficulty).toBe(0)
    const again = applySM2({ ...card, ...result }, 1, { now: NOW })
    expect(again.difficulty).toBe(0)
  })

  it('clamps out-of-range quality into 0..5', () => {
    const card = makeCard('c1', 0, 'line', NOW)
    const tooHigh = applySM2(card, 9, { now: NOW })
    const exactlyFive = applySM2(card, 5, { now: NOW })
    expect(tooHigh).toEqual(exactlyFive)

    const tooLow = applySM2(card, -3, { now: NOW })
    const exactlyZero = applySM2(card, 0, { now: NOW })
    expect(tooLow).toEqual(exactlyZero)
  })

  it('compresses nextDue as a concert approaches without changing the stored interval', () => {
    let card = makeCard('c1', 0, 'line', NOW)
    card = { ...card, ...applySM2(card, 5, { now: NOW }) } // interval 1
    card = { ...card, ...applySM2(card, 5, { now: NOW }) } // interval 6, repetitions 2

    const withoutConcert = applySM2(card, 5, { now: NOW })

    // Exactly 30 days out: factor = max(0.3, 30/30) = 1 — identical to no concert date.
    const exactly30DaysOut = NOW + 30 * DAY_MS
    const withThirtyDayConcert = applySM2(card, 5, { now: NOW, concertDate: exactly30DaysOut })
    expect(withThirtyDayConcert.interval).toBe(withoutConcert.interval)
    expect(withThirtyDayConcert.nextDue).toBe(withoutConcert.nextDue)

    // Close concert — factor floors at 0.3, pulling nextDue in (SM-2 interval itself is untouched).
    const soonConcert = NOW + 3 * DAY_MS
    const withSoonConcert = applySM2(card, 5, { now: NOW, concertDate: soonConcert })
    expect(withSoonConcert.interval).toBe(withoutConcert.interval)
    expect(withSoonConcert.nextDue).toBeLessThan(withoutConcert.nextDue)
    expect(withSoonConcert.nextDue).toBe(NOW + withoutConcert.interval * 0.3 * DAY_MS)
  })

  it('ignores a concertDate that has already passed', () => {
    const card = makeCard('c1', 0, 'line', NOW)
    const result = applySM2(card, 5, { now: NOW, concertDate: NOW - DAY_MS })
    const baseline = applySM2(card, 5, { now: NOW })
    expect(result).toEqual(baseline)
  })
})

describe('isMastered', () => {
  it('requires full-recall difficulty, at least 2 repetitions, and a graduated interval', () => {
    expect(isMastered({ ...makeCard('c', 0, 't', NOW), difficulty: 2, repetitions: 2, interval: 6 })).toBe(true)
    expect(isMastered({ ...makeCard('c', 0, 't', NOW), difficulty: 1, repetitions: 5, interval: 30 })).toBe(false)
    expect(isMastered({ ...makeCard('c', 0, 't', NOW), difficulty: 2, repetitions: 1, interval: 6 })).toBe(false)
    expect(isMastered({ ...makeCard('c', 0, 't', NOW), difficulty: 2, repetitions: 2, interval: 5 })).toBe(false)
  })
})

describe('cardMastery', () => {
  it('maps card state to the 0/25/50/75/100 mastery scale', () => {
    expect(cardMastery(makeCard('c', 0, 't', NOW))).toBe(0) // never studied
    expect(cardMastery({ ...makeCard('c', 0, 't', NOW), lastQuality: 5, difficulty: 0 })).toBe(25)
    expect(cardMastery({ ...makeCard('c', 0, 't', NOW), lastQuality: 5, difficulty: 1 })).toBe(50)
    expect(cardMastery({ ...makeCard('c', 0, 't', NOW), lastQuality: 5, difficulty: 2, repetitions: 1, interval: 1 })).toBe(75)
    expect(cardMastery({ ...makeCard('c', 0, 't', NOW), lastQuality: 5, difficulty: 2, repetitions: 2, interval: 6 })).toBe(100)
  })
})

describe('masteryPercent', () => {
  it('returns 0 for a song with no cards', () => {
    const song = { cards: [] } as unknown as Song
    expect(masteryPercent(song)).toBe(0)
  })

  it('averages cardMastery across all of a song\'s cards', () => {
    const song = {
      cards: [
        makeCard('a', 0, 't', NOW), // 0
        { ...makeCard('b', 1, 't', NOW), lastQuality: 5, difficulty: 0 }, // 25
        { ...makeCard('c', 2, 't', NOW), lastQuality: 5, difficulty: 1 }, // 50
      ],
    } as unknown as Song
    expect(masteryPercent(song)).toBe(Math.round((0 + 25 + 50) / 3))
  })
})
