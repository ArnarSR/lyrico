// Matches section headers like "Verse 1", "Chorus", "Bridge 2", "Pre-chorus", etc.
const SECTION_LABEL_RE = /^(vers(e)?|chorus|refrain|refreng|bridge|pre-?chorus|outro|intro|hook|coda|interlude|tag|strofe)[\s\d]*$/i

/** Returns true for lines that are section labels, not lyric content. */
export function isSectionLabel(line: string): boolean {
  return SECTION_LABEL_RE.test(line.trim())
}

/**
 * The marker that makes a row a translation of the line above it, rather than
 * text to sing. src/lib/translation.ts owns the concept and re-exports these;
 * the primitives live here with the other line predicates so the two modules do
 * not have to import each other.
 */
export const TRANSLATION_PREFIX = '> '

const TRANSLATION_LINE_RE = /^>\s?/

export function isTranslationLine(line: string): boolean {
  return TRANSLATION_LINE_RE.test(line.trimStart())
}

/** The translation text of a marked row, without its marker. */
export function translationText(line: string): string {
  return line.trimStart().replace(TRANSLATION_LINE_RE, '').trim()
}

/**
 * Returns the lineIndex of the first line of each stanza.
 * Stanzas are separated by blank (whitespace-only) lines in the raw lyrics.
 * Section label lines (e.g. "Verse 1", "Chorus") are skipped, as are
 * translation rows — neither becomes a card, so neither carries a lineIndex.
 */
export function getStanzaStarts(lyrics: string): number[] {
  const lines = lyrics.split('\n')
  const starts: number[] = []
  let lineIndex = 0
  let atStart = true

  for (const line of lines) {
    if (isTranslationLine(line)) continue
    if (line.trim() === '' || isSectionLabel(line)) {
      atStart = true
    } else {
      if (atStart) starts.push(lineIndex)
      atStart = false
      lineIndex++
    }
  }

  return starts
}

/**
 * Inclusive [from, to] lineIndex range for a given stanza.
 * `to` is MAX_SAFE_INTEGER for the last stanza (no upper bound).
 */
export function getStanzaLineRange(lyrics: string, stanzaIdx: number): [number, number] {
  const starts = getStanzaStarts(lyrics)
  const from = starts[stanzaIdx]
  const to =
    stanzaIdx + 1 < starts.length ? starts[stanzaIdx + 1] - 1 : Number.MAX_SAFE_INTEGER
  return [from, to]
}
