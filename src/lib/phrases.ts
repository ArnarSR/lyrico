import { isSectionLabel } from './stanzas'
import { isTranslationLine } from './translation'

/**
 * Phrase detection — deciding what counts as one sung line.
 *
 * A raw import is not a list of phrases. A sheet-music scan breaks a phrase
 * wherever the system ends, runs two phrases onto one row when they share a
 * staff, splits words into syllables under the notes, and carries the score's
 * own markings along. A web page imposes its own line layout on top. Every
 * non-empty line becomes one flashcard, so the line layout *is* the drill: a
 * phrase cut in half is a card with no meaning, and two phrases on one row is a
 * card nobody can answer.
 *
 * This is the deterministic pass that runs before the singer sees the text. It
 * rejoins syllables, drops score furniture, merges rows that are one phrase
 * broken across a system break, and splits rows that hold more than one phrase.
 *
 * It never invents or reorders words, and it only splits where the text itself
 * marks a phrase end with punctuation. A long row with no punctuation is left
 * alone and reported instead (see src/lib/saveQa.ts) — guessing a boundary
 * mid-sentence is worse than one long card, and the editor has "Split line
 * here" for the cases only the singer can judge.
 *
 * Lines already marked as translations (see src/lib/translation.ts) pass through
 * untouched, which is why translation detection has to run first. Compose the
 * two with prepareLyrics() rather than calling them in your own order.
 */

export interface PhraseOptions {
  /** Above this many words a row is assumed to hold more than one phrase. */
  maxWords: number
  /** A phrase shorter than this is not worth a card of its own. */
  minWords: number
}

export const DEFAULT_PHRASE_OPTIONS: PhraseOptions = { maxWords: 10, minWords: 2 }

export interface PhraseStats {
  /** "Ky- ri- e" → "Kyrie", including syllables rejoined across a row break. */
  syllablesRejoined: number
  /** Rows dropped or trimmed because they were score markings, not text. */
  furnitureRemoved: number
  /** Rows joined into the row above because they continued its phrase. */
  merged: number
  /** Rows that held more than one phrase and were split at punctuation. */
  split: number
}

export interface PhraseResult {
  lyrics: string
  stats: PhraseStats
  /** True when anything at all was changed — drives the undo notice in the UI. */
  changed: boolean
}

/** Score markings that occupy a row of their own and are never sung. */
const FURNITURE_RE = new RegExp(
  '^(?:' +
    [
      // Dynamics, with or without a trailing dot
      '(?:ppp|pp|p|mp|mf|f|ff|fff|sf|sfz|fp)\\.?',
      // Tempo and articulation words that stand alone in a score
      'cresc\\.?', 'decresc\\.?', 'dim\\.?', 'rit\\.?', 'ritard\\.?', 'accel\\.?',
      'a\\s?tempo', 'tempo\\s?(?:i|primo)', 'adagio', 'andante', 'allegro', 'largo',
      'lento', 'moderato', 'presto', 'vivace', 'dolce', 'legato', 'staccato',
      'marcato', 'tenuto', 'sostenuto', 'espressivo', 'subito',
      // Navigation and structure markings
      'fine', 'coda', 'segno', 'fermata', 'attacca',
      'd\\.?\\s?c\\.?(?:\\s*al\\s*(?:fine|coda))?', 'd\\.?\\s?s\\.?(?:\\s*al\\s*(?:fine|coda))?',
      // Scoring indications
      'tutti', 'soli', 'solo', 'div\\.?', 'unis\\.?', 'a\\s?cappella',
      // Bar, page and rehearsal references
      '(?:bar|takt|m\\.?|measure)\\s*\\d+', '(?:page|side|s\\.?|p\\.?)\\s*\\d+',
      '\\d{1,3}', '\\[\\s*\\d{1,3}\\s*\\]',
      // Copyright and edition lines
      '©.*', '\\(c\\)\\s*\\d{4}.*', '\\(?\\d{4}\\)?',
    ].join('|') +
    ')$',
  'iu',
)

/** A rehearsal letter on a row of its own — upper case only, never a word. */
const REHEARSAL_RE = /^[A-Z]{1,2}\.?$/
/** Roman numerals used as movement or verse numbers. */
const ROMAN_RE = /^[IVXLCDM]{1,4}\.?$/

/** "Sopran:", "S.A.T.B.", "Tenor 1 -" and friends, at the head of a row. */
const VOICE_LABEL_RE =
  /^(?:sopran[o]?|mezzo(?:-?sopran[o]?)?|alt[o]?|tenor|bariton[e]?|bass[o]?|unison|kvinner|menn|damer|herrer|[satb](?:\.[satb])+\.?|[SATB]{2,4})\s*\d*\s*[:.–-]\s*/i

export function detectPhrases(raw: string, opts: Partial<PhraseOptions> = {}): PhraseResult {
  const o = { ...DEFAULT_PHRASE_OPTIONS, ...opts }
  const stats: PhraseStats = { syllablesRejoined: 0, furnitureRemoved: 0, merged: 0, split: 0 }

  const normalized = normalize(raw)
  let lines = normalized.split('\n')
  lines = rejoinSyllables(lines, stats)
  lines = dropFurniture(lines, stats)
  lines = mergeContinuations(lines, o, stats)
  lines = splitLongRows(lines, o, stats)

  const lyrics = collapseBlanks(lines).join('\n')
  return { lyrics, stats, changed: lyrics !== normalized }
}

/** True when the pass found nothing to do. */
export function isCleanPhrasing(stats: PhraseStats): boolean {
  return stats.syllablesRejoined === 0 && stats.furnitureRemoved === 0 &&
    stats.merged === 0 && stats.split === 0
}

/** A one-line, human summary of what the pass did, or '' when it did nothing. */
export function describePhraseStats(stats: PhraseStats): string {
  const parts: string[] = []
  if (stats.merged > 0) parts.push(`${stats.merged} row${plural(stats.merged)} joined`)
  if (stats.split > 0) parts.push(`${stats.split} row${plural(stats.split)} split`)
  if (stats.syllablesRejoined > 0) parts.push(`${stats.syllablesRejoined} syllable${plural(stats.syllablesRejoined)} rejoined`)
  if (stats.furnitureRemoved > 0) parts.push(`${stats.furnitureRemoved} score marking${plural(stats.furnitureRemoved)} removed`)
  return parts.join(' · ')
}

function plural(n: number): string { return n === 1 ? '' : 's' }

/** Words of a row, as the editor and the card counter see them. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

// ── Steps ────────────────────────────────────────────────────────────────────

function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200b-\u200d\uFEFF]/g, '')
    .split('\n')
    .map((l) => l.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
}

/**
 * Sheet music prints one syllable per note, so a scan hands back "Ky- ri- e" and
 * words broken over a row end ("Ky-" / "rie"). Both are rejoined; a hyphen with
 * a space on *both* sides is an ordinary dash and is left alone.
 */
function rejoinSyllables(lines: string[], stats: PhraseStats): string[] {
  const out = lines.map((line) => {
    if (!isEditable(line)) return line
    return line.replace(/(\p{L})-[ \t]+(?=\p{L})/gu, (_m, letter: string) => {
      stats.syllablesRejoined++
      return letter
    })
  })

  // A row ending in a hyphenated syllable continues into the next row.
  for (let i = 0; i < out.length - 1; i++) {
    while (
      isEditable(out[i]) && /\p{L}-$/u.test(out[i]) &&
      out[i + 1] !== undefined && isEditable(out[i + 1]) && out[i + 1].trim() !== ''
    ) {
      out[i] = out[i].slice(0, -1) + out[i + 1].trimStart()
      out.splice(i + 1, 1)
      stats.syllablesRejoined++
    }
  }
  return out
}

function dropFurniture(lines: string[], stats: PhraseStats): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (!isEditable(line) || line.trim() === '') {
      out.push(line)
      continue
    }
    const stripped = line.replace(VOICE_LABEL_RE, '').trim()
    const isFurniture =
      stripped === '' || FURNITURE_RE.test(stripped) || REHEARSAL_RE.test(stripped) || ROMAN_RE.test(stripped)
    if (isFurniture) {
      stats.furnitureRemoved++
      continue
    }
    if (stripped !== line) stats.furnitureRemoved++
    out.push(stripped)
  }
  return out
}

/**
 * A row that ends without punctuation and is followed by a row starting in lower
 * case is one phrase the score broke at a system end. Merging is repeated until
 * nothing changes, so a phrase spread over three rows comes back whole.
 *
 * The guard against runaway merging is the phrase length itself: two rows are
 * only joined when the result still fits one card.
 */
function mergeContinuations(lines: string[], o: PhraseOptions, stats: PhraseStats): string[] {
  const out = [...lines]
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i]
      const b = out[i + 1]
      if (!isLyricRow(a) || !isLyricRow(b)) continue
      // Punctuation at the end of a row is the score's own phrase mark.
      if (!/[\p{L}\p{N}]$/u.test(a)) continue
      if (!/^\p{Ll}/u.test(b)) continue
      if (wordCount(a) + wordCount(b) > o.maxWords) continue
      out[i] = `${a} ${b}`
      out.splice(i + 1, 1)
      stats.merged++
      merged = true
      break
    }
  }
  return out
}

function splitLongRows(lines: string[], o: PhraseOptions, stats: PhraseStats): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (!isLyricRow(line) || wordCount(line) <= o.maxWords) {
      out.push(line)
      continue
    }
    const pieces = splitPhrase(line, o)
    if (pieces.length > 1) stats.split += pieces.length - 1
    out.push(...pieces)
  }
  return out
}

/** Splits at the punctuation nearest the middle, then recurses into the halves. */
function splitPhrase(text: string, o: PhraseOptions): string[] {
  const words = text.split(' ').filter(Boolean)
  if (words.length <= o.maxWords) return [words.join(' ')]
  const at = bestSplit(words, o)
  if (at === null) return [words.join(' ')]
  return [
    ...splitPhrase(words.slice(0, at).join(' '), o),
    ...splitPhrase(words.slice(at).join(' '), o),
  ]
}

function bestSplit(words: string[], o: PhraseOptions): number | null {
  const strong: number[] = []
  const weak: number[] = []
  for (let i = 0; i < words.length - 1; i++) {
    if (/[.!?;…][»"'’”)\]]?$/u.test(words[i])) strong.push(i + 1)
    else if (/[,:—–][»"'’”)\]]?$/u.test(words[i])) weak.push(i + 1)
  }
  const middle = words.length / 2
  const nearestUsable = (candidates: number[]): number | undefined =>
    candidates
      .filter((i) => i >= o.minWords && words.length - i >= o.minWords)
      .sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0]
  return nearestUsable(strong) ?? nearestUsable(weak) ?? null
}

function collapseBlanks(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (line.trim() === '' && (out.length === 0 || out[out.length - 1].trim() === '')) continue
    out.push(line)
  }
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
  return out
}

// ── Row classification ───────────────────────────────────────────────────────

/** Translations are carried through verbatim; everything else may be rewritten. */
function isEditable(line: string): boolean {
  return !isTranslationLine(line)
}

/** A row holding sung text — not blank, not a section label, not a translation. */
function isLyricRow(line: string): boolean {
  return isEditable(line) && line.trim() !== '' && !isSectionLabel(line)
}
