// Scoring: compare learner's attempt to the correct lyric line.
// We normalize aggressively (lowercase, strip punctuation, collapse whitespace)
// then compute a simple word-match ratio, which is mapped to a 0..5 SM-2 quality.

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents — å→a, etc.
    .replace(/aa/g, 'a')             // Norwegian: aa = å (both become 'a')
    .replace(/[^\p{Letter}\p{Number}\s''-]/gu, ' ')
    .replace(/['']/g, '') // treat "don't" == "dont"
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokens(s: string): string[] {
  const n = normalize(s)
  return n.length === 0 ? [] : n.split(' ')
}

export interface ScoreResult {
  ratio: number // 0..1, fraction of correct words matched
  quality: number // 0..5 SM-2 quality
  matched: number
  total: number
}

/**
 * Score an attempt against the target answer.
 * - Counts how many correct-answer words appear (in-order) in the attempt.
 * - Maps the ratio onto SM-2's 0..5 quality scale.
 */
export function scoreAnswer(attempt: string, correct: string): ScoreResult {
  const tgt = tokens(correct)
  const got = tokens(attempt)
  const total = tgt.length

  if (total === 0) {
    return { ratio: 1, quality: 5, matched: 0, total: 0 }
  }

  // Longest-common-subsequence-ish: walk through the attempt in order,
  // consuming target words as we find matches. This rewards roughly-correct
  // order without being thrown off by a single missed word.
  let i = 0
  let matched = 0
  for (const w of got) {
    if (i < tgt.length && w === tgt[i]) {
      matched++
      i++
    } else {
      const j = tgt.indexOf(w, i)
      if (j !== -1) {
        matched++
        i = j + 1
      }
    }
  }

  const ratio = matched / total
  return { ratio, quality: ratioToQuality(ratio), matched, total }
}

export function ratioToQuality(ratio: number): number {
  if (ratio >= 0.98) return 5
  if (ratio >= 0.85) return 4
  if (ratio >= 0.65) return 3
  if (ratio >= 0.4) return 2
  if (ratio > 0) return 1
  return 0
}

/**
 * Word-level diff between attempt and correct answer.
 * Uses the same LCS matching as scoreAnswer so results are consistent.
 * Returns original-cased words (not normalized) for display.
 */
export function diffWords(
  attempt: string,
  correct: string,
): {
  attempt: Array<{ word: string; matched: boolean }>
  correct: Array<{ word: string; matched: boolean }>
} {
  const gotOrig = attempt.trim().split(/\s+/).filter(Boolean)
  const tgtOrig = correct.trim().split(/\s+/).filter(Boolean)
  const got = gotOrig.map(normalize)
  const tgt = tgtOrig.map(normalize)

  const tgtMatched = new Array(tgt.length).fill(false)
  const gotMatched = new Array(got.length).fill(false)

  let i = 0
  for (let j = 0; j < got.length; j++) {
    if (i < tgt.length && got[j] === tgt[i]) {
      gotMatched[j] = true
      tgtMatched[i] = true
      i++
    } else {
      const k = tgt.indexOf(got[j], i)
      if (k !== -1) {
        gotMatched[j] = true
        tgtMatched[k] = true
        i = k + 1
      }
    }
  }

  return {
    attempt: gotOrig.map((word, j) => ({ word, matched: gotMatched[j] })),
    correct: tgtOrig.map((word, k) => ({ word, matched: tgtMatched[k] })),
  }
}

export function qualityLabel(q: number): string {
  switch (q) {
    case 5:
      return 'Perfect'
    case 4:
      return 'Great'
    case 3:
      return 'Passed'
    case 2:
      return 'Shaky'
    case 1:
      return 'Missed most'
    default:
      return 'Blanked'
  }
}
