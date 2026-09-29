import { isSectionLabel, isTranslationLine, TRANSLATION_PREFIX, translationText } from './stanzas'

export { isTranslationLine, TRANSLATION_PREFIX, translationText }

/**
 * Two-language sheet music — telling the sung text from its translation.
 *
 * Choir scores routinely print a singing text and a translation together: the
 * German under the notes and an English prose translation beneath it, a Latin
 * motet with the Norwegian meaning in brackets, or two blocks stacked under a
 * heading. Only one of them is sung. Drilling both doubles the cards and asks
 * the singer to memorise text that will never be performed — but throwing the
 * translation away loses the one thing that makes a foreign text memorable.
 *
 * So the secondary language is kept, attached to the line it belongs to, and
 * shown after the singer has answered (see src/components/TranslationReveal.tsx).
 *
 * ── Storage ──
 * A translation lives in the song's raw `lyrics` on a row of its own, prefixed
 * with "> ", directly under the line it translates:
 *
 *     Ave verum corpus natum
 *     > Hail, true body, born
 *
 * That keeps `songs.lyrics` the single source of truth and needs no schema
 * change: cards are built from the sung rows only (see stripTranslations), and
 * the translation is re-attached to each card when a song is loaded. Anything
 * reading `lyrics` as a list of cards must strip translations first.
 */

/** True when the text carries at least one translation row. */
export function hasTranslations(raw: string): boolean {
  return raw.split('\n').some(isTranslationLine)
}

/**
 * The sung text alone. This is what cards, stanza detection and every existing
 * consumer of `lyrics` expects, so anything that counts lines goes through here.
 */
export function stripTranslations(raw: string): string {
  return raw
    .split('\n')
    .filter((l) => !isTranslationLine(l))
    .join('\n')
}

export type LineKind = 'lyric' | 'section' | 'blank'

export interface ParsedLine {
  kind: LineKind
  text: string
  /** Set on 'lyric' rows that have a translation under them. */
  translation?: string
  /** Card index, counting only lyric rows — matches Card.lineIndex. */
  lineIndex?: number
}

/**
 * Parses raw lyrics into rows, attaching each translation to the line above it
 * and numbering lyric rows the way cards are numbered.
 */
export function parseLyrics(raw: string): ParsedLine[] {
  const out: ParsedLine[] = []
  let lineIndex = 0

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (isTranslationLine(line)) {
      // Attach to the nearest lyric row above; a stray marker with nothing to
      // translate is dropped rather than turned into a card.
      const target = [...out].reverse().find((l) => l.kind === 'lyric')
      if (target) {
        const text = translationText(line)
        target.translation = target.translation ? `${target.translation} ${text}` : text
      }
      continue
    }
    if (line === '') {
      out.push({ kind: 'blank', text: '' })
      continue
    }
    if (isSectionLabel(line)) {
      out.push({ kind: 'section', text: line })
      continue
    }
    out.push({ kind: 'lyric', text: line, lineIndex: lineIndex++ })
  }

  return out
}

/**
 * Translations indexed by card lineIndex, for attaching to cards on load.
 * Gaps are `undefined` — most songs have no translation at all.
 */
export function translationsByLineIndex(raw: string): (string | undefined)[] {
  const out: (string | undefined)[] = []
  for (const line of parseLyrics(raw)) {
    if (line.kind === 'lyric') out[line.lineIndex!] = line.translation
  }
  return out
}

/**
 * How many cards a raw lyrics string is worth: sung rows only, with blank rows,
 * section labels and translations left out.
 */
export function cardLineCount(raw: string): number {
  return parseLyrics(raw).filter((l) => l.kind === 'lyric').length
}

/** Rebuilds raw lyrics from edited lines, putting translations back under them. */
export function attachTranslations(lines: { text: string; translation?: string }[]): string {
  const out: string[] = []
  for (const line of lines) {
    out.push(line.text)
    const translation = line.translation?.trim()
    if (translation) out.push(TRANSLATION_PREFIX + translation)
  }
  return out.join('\n')
}

// ── Language detection ───────────────────────────────────────────────────────

/**
 * Function words, not vocabulary. A choir text is short and often archaic, so
 * content words are unreliable; the little words that glue a sentence together
 * survive translation into whatever century the edition was printed in.
 */
const STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'i', 'my', 'your', 'we', 'our', 'with', 'for', 'are', 'that', 'this', 'all', 'be', 'thou', 'thee', 'thy', 'shall', 'will', 'from', 'have', 'not', 'you', 'me', 'his', 'her', 'they', 'was', 'who', 'what', 'when', 'a', 'it', 'on', 'as', 'by', 'but', 'o'],
  de: ['der', 'die', 'das', 'und', 'ich', 'du', 'wir', 'ist', 'nicht', 'ein', 'eine', 'den', 'dem', 'des', 'mit', 'sich', 'auf', 'für', 'von', 'zu', 'mein', 'dein', 'sein', 'sie', 'er', 'es', 'wie', 'so', 'aber', 'doch', 'noch', 'nur', 'wenn', 'dass', 'daß', 'bin', 'hat', 'hab', 'habe', 'werden', 'alle', 'dich', 'mir', 'dir', 'nach', 'über', 'aus', 'im'],
  no: ['og', 'er', 'en', 'et', 'det', 'som', 'til', 'for', 'med', 'jeg', 'du', 'vi', 'ikke', 'den', 'har', 'var', 'skal', 'vil', 'meg', 'deg', 'seg', 'min', 'din', 'sin', 'alle', 'på', 'av', 'om', 'her', 'der', 'når', 'hva', 'hvem', 'så', 'men', 'de', 'da', 'ved'],
  sv: ['och', 'är', 'det', 'som', 'till', 'för', 'med', 'jag', 'du', 'vi', 'inte', 'den', 'har', 'var', 'ska', 'vill', 'mig', 'dig', 'sig', 'alla', 'på', 'av', 'om', 'här', 'där', 'när', 'vad', 'vem', 'så', 'men', 'ett', 'en'],
  la: ['et', 'in', 'est', 'non', 'qui', 'quae', 'quod', 'cum', 'ad', 'ex', 'de', 'per', 'pro', 'sed', 'sunt', 'nos', 'nobis', 'tuus', 'tua', 'tuum', 'domine', 'deus', 'dei', 'te', 'nobis', 'omnes', 'sicut', 'eius', 'sine', 'ut'],
  fr: ['le', 'la', 'les', 'de', 'des', 'et', 'est', 'un', 'une', 'je', 'tu', 'nous', 'vous', 'ne', 'pas', 'que', 'qui', 'dans', 'pour', 'avec', 'mon', 'ton', 'son', 'mais', 'sur', 'au', 'aux', 'du', 'se', 'ce'],
  it: ['il', 'la', 'le', 'di', 'e', 'è', 'un', 'una', 'io', 'tu', 'noi', 'voi', 'non', 'che', 'chi', 'nel', 'per', 'con', 'mio', 'tuo', 'suo', 'ma', 'su', 'del', 'della', 'si', 'lo'],
  es: ['el', 'la', 'los', 'las', 'de', 'y', 'es', 'un', 'una', 'yo', 'tú', 'no', 'que', 'quien', 'en', 'para', 'con', 'mi', 'tu', 'su', 'pero', 'sobre', 'del', 'se', 'lo'],
}

const STOPWORD_SETS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(STOPWORDS).map(([code, words]) => [code, new Set(words)]),
)

/** Characters that only some of these languages use — a tie-break, not a vote. */
const CHAR_HINTS: { code: string; re: RegExp }[] = [
  { code: 'no', re: /[øåæ]/i },
  { code: 'de', re: /[äöüß]/i },
  { code: 'fr', re: /[àâçèêëîïôûù]/i },
  { code: 'it', re: /[àìòù]/i },
  { code: 'es', re: /[ñáíóú¡¿]/i },
]

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', de: 'German', no: 'Norwegian', sv: 'Swedish',
  la: 'Latin', fr: 'French', it: 'Italian', es: 'Spanish',
}

export function languageName(code: string | undefined): string {
  if (!code) return 'Unknown'
  return LANGUAGE_NAMES[code] ?? code
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean)
}

/**
 * The language of a passage, or null when the signal is too weak to act on.
 * Deliberately conservative: a wrong guess here would mark sung text as a
 * translation, which is the one outcome worth avoiding.
 */
export function detectLanguage(text: string): string | null {
  const words = tokens(text)
  if (words.length === 0) return null

  const scores = new Map<string, number>()
  for (const [code, set] of Object.entries(STOPWORD_SETS)) {
    let hits = 0
    for (const word of words) if (set.has(word)) hits++
    if (hits > 0) scores.set(code, hits / words.length)
  }
  for (const { code, re } of CHAR_HINTS) {
    if (re.test(text)) scores.set(code, (scores.get(code) ?? 0) + 0.15)
  }
  if (scores.size === 0) return null

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
  const [bestCode, bestScore] = ranked[0]
  if (bestScore < 0.12) return null
  // A near-tie between two languages means the evidence points both ways.
  const runnerUp = ranked[1]?.[1] ?? 0
  if (bestScore - runnerUp < 0.04) return null
  return bestCode
}

// ── Detection ────────────────────────────────────────────────────────────────

export type TranslationStrategy = 'none' | 'marked' | 'bracketed' | 'alternating' | 'blocks'

export interface TranslationDetection {
  /** The text with translations marked, ready to store. */
  lyrics: string
  strategy: TranslationStrategy
  /** How many rows are now marked as translations. */
  marked: number
  /** Language of the rows kept as sung text, when it could be established. */
  sungLanguage?: string
  /** Language of the rows treated as translation. */
  translationLanguage?: string
}

/**
 * Finds a translation inside a two-language text and marks it.
 *
 * Three layouts cover what scores actually do:
 *
 *   bracketed    a row wholly inside ( ) or [ ] under the line it translates
 *   alternating  sung line, translation, sung line, translation …
 *   blocks       the whole text in one language, then the whole text again
 *
 * Which side is the translation is decided by position: the sung text is the one
 * printed with the notes, which comes first in every layout above. When the score
 * had it the other way round the singer flips it with swapTranslationDirection().
 *
 * Returns the text unchanged with strategy 'none' whenever the evidence is not
 * clear — a single language, an odd layout, or two languages the detector cannot
 * separate confidently.
 */
export function detectTranslations(raw: string): TranslationDetection {
  const text = raw.replace(/\r\n?/g, '\n')
  if (hasTranslations(text)) {
    const translations = text.split('\n').filter(isTranslationLine)
    return {
      lyrics: text,
      strategy: 'marked',
      marked: translations.length,
      sungLanguage: detectLanguage(stripTranslations(text)) ?? undefined,
      translationLanguage: detectLanguage(translations.map(translationText).join(' ')) ?? undefined,
    }
  }

  return detectBracketed(text) ?? detectAlternating(text) ?? detectBlocks(text) ?? {
    lyrics: text,
    strategy: 'none',
    marked: 0,
    sungLanguage: detectLanguage(text) ?? undefined,
  }
}

/** Swaps sung text and translation — for when the score printed them the other way. */
export function swapTranslationDirection(raw: string): string {
  const out: string[] = []
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (isTranslationLine(line) || line === '' || isSectionLabel(line)) {
      if (!isTranslationLine(line)) out.push(line)
      continue
    }
    // Collect the translations that belong to this sung row.
    const translations: string[] = []
    let j = i + 1
    while (j < lines.length && isTranslationLine(lines[j].trim())) {
      translations.push(translationText(lines[j].trim()))
      j++
    }
    if (translations.length === 0) {
      out.push(line)
      continue
    }
    out.push(translations.join(' '))
    out.push(TRANSLATION_PREFIX + line)
    i = j - 1
  }

  return out.join('\n')
}

interface Row { index: number; text: string }

/** Indices of the rows holding sung text, in order, ignoring blanks and labels. */
function lyricRows(lines: string[]): Row[] {
  return lines
    .map((text, index) => ({ index, text: text.trim() }))
    .filter((r) => r.text !== '' && !isSectionLabel(r.text) && !isTranslationLine(r.text))
}

function mark(lines: string[], indices: Set<number>, strip?: (s: string) => string): string {
  return lines
    .map((line, i) => {
      if (!indices.has(i)) return line.trim()
      const text = strip ? strip(line.trim()) : line.trim()
      return TRANSLATION_PREFIX + text
    })
    .join('\n')
}

const BRACKETED_RE = /^[([{]\s*(.+?)\s*[)\]}]$/

/** A row wholly inside brackets, under a row that is not. */
function detectBracketed(text: string): TranslationDetection | null {
  const lines = text.split('\n')
  const rows = lyricRows(lines)
  const marked = new Set<number>()

  for (let i = 1; i < rows.length; i++) {
    if (BRACKETED_RE.test(rows[i].text) && !BRACKETED_RE.test(rows[i - 1].text)) {
      marked.add(rows[i].index)
    }
  }
  if (marked.size < 2) return null

  const translationText_ = rows.filter((r) => marked.has(r.index)).map((r) => r.text.replace(BRACKETED_RE, '$1')).join(' ')
  const sungText = rows.filter((r) => !marked.has(r.index)).map((r) => r.text).join(' ')

  return {
    lyrics: mark(lines, marked, (l) => l.replace(BRACKETED_RE, '$1')),
    strategy: 'bracketed',
    marked: marked.size,
    sungLanguage: detectLanguage(sungText) ?? undefined,
    translationLanguage: detectLanguage(translationText_) ?? undefined,
  }
}

/** Sung line, translation, sung line, translation — the same language each time. */
function detectAlternating(text: string): TranslationDetection | null {
  const lines = text.split('\n')
  const rows = lyricRows(lines)
  if (rows.length < 4 || rows.length % 2 !== 0) return null

  const odd = rows.filter((_, i) => i % 2 === 0)
  const even = rows.filter((_, i) => i % 2 === 1)
  const oddLang = detectLanguage(odd.map((r) => r.text).join(' '))
  const evenLang = detectLanguage(even.map((r) => r.text).join(' '))
  if (!oddLang || !evenLang || oddLang === evenLang) return null

  // Each row on its own has to agree with its side, or this is not an
  // alternating layout — it is two languages mixed by accident.
  if (!sideAgrees(odd, oddLang) || !sideAgrees(even, evenLang)) return null

  const marked = new Set(even.map((r) => r.index))
  return {
    lyrics: mark(lines, marked),
    strategy: 'alternating',
    marked: marked.size,
    sungLanguage: oddLang,
    translationLanguage: evenLang,
  }
}

/** Rows that can be identified must mostly agree with the side's language. */
function sideAgrees(rows: Row[], language: string): boolean {
  const identified = rows.map((r) => detectLanguage(r.text)).filter((l): l is string => l !== null)
  if (identified.length === 0) return false
  const agreeing = identified.filter((l) => l === language).length
  return agreeing / identified.length >= 0.6 && identified.length >= rows.length / 2
}

/** The whole text in one language, then the whole text again in another. */
function detectBlocks(text: string): TranslationDetection | null {
  const lines = text.split('\n')
  const blocks = splitIntoBlocks(lines)
  if (blocks.length !== 2) return null

  const [first, second] = blocks
  if (first.length < 2 || first.length !== second.length) return null

  const firstLang = detectLanguage(first.map((r) => r.text).join(' '))
  const secondLang = detectLanguage(second.map((r) => r.text).join(' '))
  if (!firstLang || !secondLang || firstLang === secondLang) return null
  if (!sideAgrees(first, firstLang) || !sideAgrees(second, secondLang)) return null

  // Interleave: each translation moves under the line it translates.
  const out: string[] = []
  for (let i = 0; i < first.length; i++) {
    out.push(first[i].text)
    out.push(TRANSLATION_PREFIX + second[i].text)
  }

  return {
    lyrics: out.join('\n'),
    strategy: 'blocks',
    marked: second.length,
    sungLanguage: firstLang,
    translationLanguage: secondLang,
  }
}

/** Groups lyric rows into blocks separated by a blank row or a section label. */
function splitIntoBlocks(lines: string[]): Row[][] {
  const blocks: Row[][] = []
  let current: Row[] = []
  lines.forEach((raw, index) => {
    const text = raw.trim()
    if (text === '' || isSectionLabel(text)) {
      if (current.length > 0) { blocks.push(current); current = [] }
      return
    }
    current.push({ index, text })
  })
  if (current.length > 0) blocks.push(current)
  return blocks
}
