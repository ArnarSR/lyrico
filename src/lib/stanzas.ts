// Matches section headers like "Verse 1", "Chorus", "Bridge 2", "Pre-chorus", etc.
const SECTION_LABEL_RE = /^(vers(e)?|chorus|refrain|refreng|bridge|pre-?chorus|outro|intro|hook|coda|interlude|tag|strofe)[\s\d]*$/i

/** Returns true for lines that are section labels, not lyric content. */
export function isSectionLabel(line: string): boolean {
  return SECTION_LABEL_RE.test(line.trim())
}

/**
 * Returns the lineIndex of the first line of each stanza.
 * Stanzas are separated by blank (whitespace-only) lines in the raw lyrics.
 * Section label lines (e.g. "Verse 1", "Chorus") are skipped.
 */
export function getStanzaStarts(lyrics: string): number[] {
  const lines = lyrics.split('\n')
  const starts: number[] = []
  let lineIndex = 0
  let atStart = true

  for (const line of lines) {
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
