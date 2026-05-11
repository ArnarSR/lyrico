import type { Difficulty } from '../types'

/**
 * Given a lyric line and a target difficulty, return a prompt string where
 * a percentage of words are replaced with underscores.
 *
 *   difficulty 0 → 25% blanks
 *   difficulty 1 → 50% blanks
 *   difficulty 2 → full recall (all words blanked)
 *
 * The choice of *which* words to blank is deterministic per line so users
 * see consistent prompts across sessions.
 */
export function buildPrompt(text: string, difficulty: Difficulty): string {
  const { parts, blanked } = computeBlanks(text, difficulty)
  return parts
    .map((p, i) => {
      if (!blanked.has(i)) return p
      return '_'.repeat(Math.min(Math.max(p.length, 2), 8))
    })
    .join('')
}

/** Returns only the words that are blanked out, joined by spaces. */
export function getBlankedWords(text: string, difficulty: Difficulty): string {
  const { parts, blanked } = computeBlanks(text, difficulty)
  return parts.filter((_, i) => blanked.has(i)).join(' ')
}

export type Segment =
  | { type: 'text'; value: string }
  | { type: 'blank'; answer: string }

/**
 * Splits a line into alternating text and blank segments for inline rendering.
 * Consecutive non-blank parts are merged into a single text segment.
 */
export function buildSegments(text: string, difficulty: Difficulty): Segment[] {
  const { parts, blanked } = computeBlanks(text, difficulty)
  return partsToSegments(parts, blanked)
}

/**
 * Like buildSegments but blanks only the specific words provided (consumed
 * left-to-right so duplicates are handled correctly).
 */
export function buildSegmentsForWords(text: string, blankWords: string[]): Segment[] {
  const parts = text.split(/(\s+)/)
  const pending = [...blankWords]
  const blanked = new Set<number>()
  for (let i = 0; i < parts.length; i++) {
    if (!/\S/.test(parts[i])) continue
    const j = pending.indexOf(parts[i])
    if (j !== -1) {
      blanked.add(i)
      pending.splice(j, 1)
    }
  }
  return partsToSegments(parts, blanked)
}

function partsToSegments(parts: string[], blanked: Set<number>): Segment[] {
  const result: Segment[] = []
  for (let i = 0; i < parts.length; i++) {
    if (blanked.has(i)) {
      result.push({ type: 'blank', answer: parts[i] })
    } else {
      const last = result[result.length - 1]
      if (last?.type === 'text') {
        last.value += parts[i]
      } else if (parts[i].length > 0) {
        result.push({ type: 'text', value: parts[i] })
      }
    }
  }
  return result
}

function computeBlanks(
  text: string,
  difficulty: Difficulty,
): { parts: string[]; blanked: Set<number> } {
  const parts = text.split(/(\s+)/)
  const wordIndices: number[] = []
  parts.forEach((p, i) => {
    if (/\S/.test(p)) wordIndices.push(i)
  })
  if (wordIndices.length === 0) return { parts, blanked: new Set() }

  const ratio = difficulty === 0 ? 0.25 : difficulty === 1 ? 0.5 : 1
  const blankCount =
    difficulty === 2
      ? wordIndices.length
      : Math.max(1, Math.round(wordIndices.length * ratio))

  const order = wordIndices
    .map((idx) => ({ idx, key: hash(`${text}:${idx}`) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, blankCount)
    .map((o) => o.idx)

  return { parts, blanked: new Set(order) }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
