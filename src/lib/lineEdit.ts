/**
 * Word-level line surgery for the lyrics editor.
 *
 * Whatever found the phrase boundaries — a scan, a scraped page, or the singer's
 * own paste — a word lands on the wrong side of a line break often enough that
 * fixing it must not mean selecting text, cutting, clicking another row and
 * pasting. Three operations cover the cases that actually occur:
 *
 *   move to previous line   a word the break left stranded at the top of a row
 *   move to next line       a word that belongs to the phrase below
 *   split the line here     one row holding two phrases
 *
 * These are pure: they take the rows, return new rows, and say what moved so the
 * caller can keep React keys, card ids and the focus ring straight. Card ids are
 * the reason the result reports indices rather than just handing back strings —
 * a row that keeps its id keeps its SM-2 progress.
 */

export interface EditableLine {
  text: string
  /** Kept with the line it translates; see src/lib/translation.ts. */
  translation?: string
}

export interface LineEditResult {
  lines: EditableLine[]
  /** Rows whose text changed, as indices into the *new* array. */
  changed: number[]
  /** Index of a row that was created, when one was. */
  inserted?: number
  /** Index in the *old* array of a row that was emptied and dropped. */
  removed?: number
  /** Where the caret belongs afterwards, as a word position in the new array. */
  focus: { line: number; word: number }
}

/** Words of a row, the unit the buttons operate on. */
export function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean)
}

export function canMoveWordToPrev(lines: EditableLine[], lineIndex: number): boolean {
  return lineIndex > 0 && lineIndex < lines.length && splitWords(lines[lineIndex].text).length > 0
}

export function canMoveWordToNext(lines: EditableLine[], lineIndex: number): boolean {
  return lineIndex >= 0 && lineIndex < lines.length - 1 && splitWords(lines[lineIndex].text).length > 0
}

export function canSplitAtWord(lines: EditableLine[], lineIndex: number, wordIndex: number): boolean {
  const words = splitWords(lines[lineIndex]?.text ?? '')
  // Splitting before the first word would only produce an empty row.
  return wordIndex > 0 && wordIndex < words.length
}

/**
 * Moves one word to the end of the row above. Moving the last word out of a row
 * removes the row — an empty row is not a card, and leaving it behind would make
 * the singer delete it by hand.
 */
export function moveWordToPrevLine(
  lines: EditableLine[],
  lineIndex: number,
  wordIndex: number,
): LineEditResult | null {
  if (!canMoveWordToPrev(lines, lineIndex)) return null
  const words = splitWords(lines[lineIndex].text)
  const word = words[wordIndex]
  if (word === undefined) return null

  const rest = [...words.slice(0, wordIndex), ...words.slice(wordIndex + 1)]
  const next = [...lines]
  const prevWords = splitWords(next[lineIndex - 1].text)
  next[lineIndex - 1] = { ...next[lineIndex - 1], text: [...prevWords, word].join(' ') }

  if (rest.length === 0) {
    next[lineIndex - 1] = carryTranslation(next[lineIndex - 1], next[lineIndex])
    next.splice(lineIndex, 1)
    return {
      lines: next,
      changed: [lineIndex - 1],
      removed: lineIndex,
      focus: { line: lineIndex - 1, word: prevWords.length },
    }
  }

  next[lineIndex] = { ...next[lineIndex], text: rest.join(' ') }
  return {
    lines: next,
    changed: [lineIndex - 1, lineIndex],
    focus: { line: lineIndex - 1, word: prevWords.length },
  }
}

/** Moves one word to the start of the row below. */
export function moveWordToNextLine(
  lines: EditableLine[],
  lineIndex: number,
  wordIndex: number,
): LineEditResult | null {
  if (!canMoveWordToNext(lines, lineIndex)) return null
  const words = splitWords(lines[lineIndex].text)
  const word = words[wordIndex]
  if (word === undefined) return null

  const rest = [...words.slice(0, wordIndex), ...words.slice(wordIndex + 1)]
  const next = [...lines]
  next[lineIndex + 1] = {
    ...next[lineIndex + 1],
    text: [word, ...splitWords(next[lineIndex + 1].text)].join(' '),
  }

  if (rest.length === 0) {
    next[lineIndex + 1] = carryTranslation(next[lineIndex + 1], next[lineIndex])
    next.splice(lineIndex, 1)
    return {
      lines: next,
      changed: [lineIndex],
      removed: lineIndex,
      focus: { line: lineIndex, word: 0 },
    }
  }

  next[lineIndex] = { ...next[lineIndex], text: rest.join(' ') }
  return {
    lines: next,
    changed: [lineIndex, lineIndex + 1],
    focus: { line: lineIndex + 1, word: 0 },
  }
}

/**
 * Splits a row in two, with the chosen word starting the second row.
 *
 * The translation stays with the first half, because there is no way to tell
 * which half of a prose translation belongs where — the singer moves it if the
 * split landed badly.
 */
export function splitLineAtWord(
  lines: EditableLine[],
  lineIndex: number,
  wordIndex: number,
): LineEditResult | null {
  if (!canSplitAtWord(lines, lineIndex, wordIndex)) return null
  const words = splitWords(lines[lineIndex].text)

  const next = [...lines]
  next[lineIndex] = { ...next[lineIndex], text: words.slice(0, wordIndex).join(' ') }
  next.splice(lineIndex + 1, 0, { text: words.slice(wordIndex).join(' ') })

  return {
    lines: next,
    changed: [lineIndex],
    inserted: lineIndex + 1,
    focus: { line: lineIndex + 1, word: 0 },
  }
}

/** Keeps a dropped row's translation rather than losing it with the row. */
function carryTranslation(target: EditableLine, dropped: EditableLine): EditableLine {
  const extra = dropped.translation?.trim()
  if (!extra) return target
  const existing = target.translation?.trim()
  return { ...target, translation: existing ? `${existing} ${extra}` : extra }
}
