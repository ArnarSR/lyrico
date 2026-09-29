import { isSectionLabel } from './stanzas'
import { wordCount, DEFAULT_PHRASE_OPTIONS } from './phrases'
import { languageName, parseLyrics, detectLanguage, stripTranslations } from './translation'

/**
 * The checklist shown before lyrics are written.
 *
 * Every line becomes a flashcard the singer will drill for weeks, and a mistake
 * is expensive in a way a normal form field is not: they will memorise it and
 * sing it at the concert. The AI quality check (src/lib/lyricsQc.ts) catches what
 * needs judgement, but it is behind a flag, costs a round trip and can be down.
 *
 * This is the deterministic gate that always runs: a short, countable summary of
 * what is about to be saved — how many cards, whether every one has text, what
 * happened to the second language, and which of the rehearsal fields are still
 * empty — so the singer confirms a number they can check rather than a button
 * they have stopped reading.
 */

export type QaStatus = 'ok' | 'warn' | 'info'

export interface QaCheck {
  id: string
  label: string
  /** The countable detail: "24 lines", "3 rows over 10 words", … */
  detail: string
  status: QaStatus
  /** Rows this check points at, 1-based as the editor numbers them. */
  lines?: number[]
}

export interface SaveQaReport {
  checks: QaCheck[]
  /** Cards that will be created. */
  lineCount: number
  /** Rows kept as translation rather than sung text. */
  translationCount: number
  /** True when something is worth a second look before saving. */
  needsAttention: boolean
  /** True when the text cannot be saved at all. */
  blocked: boolean
}

export interface SaveQaInput {
  title: string
  lyrics: string
  composer?: string
  voicePart?: string
  concertDate?: number
  hasAudio?: boolean
  /** Left out when editing an existing song, where these fields are not in view. */
  includeMetadata?: boolean
}

/** Encoding damage that survives a copy-paste and is invisible until you look. */
const MOJIBAKE_RE = /Ã.|â€|&nbsp;|&amp;|&#\d+;|Â|ï»¿|<\/?[a-z]+>/i
/** A syllable hyphen a scan left behind: "Ky- ri- e". */
const SYLLABLE_HYPHEN_RE = /\p{L}-(?:\s|$)/u
/** Score markings that should never have become part of a line. */
const FURNITURE_IN_LINE_RE = /\b(?:cresc|decresc|dim|rit|ritard|accel|D\.?\s?C\.?|D\.?\s?S\.?|mf|mp|pp|ff)\b\.?/i

export function buildSaveQa(input: SaveQaInput): SaveQaReport {
  const parsed = parseLyrics(input.lyrics)
  const lyricLines = parsed.filter((l) => l.kind === 'lyric')
  const translations = lyricLines.filter((l) => l.translation)
  const sectionLabels = parsed.filter((l) => l.kind === 'section')

  // 1-based row numbers as the editor shows them, counting only sung rows.
  const rowNumber = (index: number) => index + 1

  const checks: QaCheck[] = []

  // ── The cards themselves ───────────────────────────────────────────────────

  checks.push({
    id: 'line_count',
    label: 'Lines to drill',
    detail: lyricLines.length === 0
      ? 'No lines — nothing to save'
      : `${lyricLines.length} line${lyricLines.length === 1 ? '' : 's'} become ${lyricLines.length === 1 ? 'one flashcard' : 'one flashcard each'}`,
    status: lyricLines.length === 0 ? 'warn' : 'ok',
  })

  const thin = lyricLines
    .map((l, i) => ({ row: rowNumber(i), text: l.text }))
    .filter(({ text }) => wordCount(text) === 0 || !/[\p{L}\p{N}]/u.test(text))
  checks.push({
    id: 'every_line_has_text',
    label: 'Every line has text',
    detail: thin.length === 0
      ? 'No empty or punctuation-only lines'
      : `${thin.length} line${thin.length === 1 ? '' : 's'} with nothing to sing`,
    status: thin.length === 0 ? 'ok' : 'warn',
    lines: thin.map((t) => t.row),
  })

  const long = lyricLines
    .map((l, i) => ({ row: rowNumber(i), words: wordCount(l.text) }))
    .filter(({ words }) => words > DEFAULT_PHRASE_OPTIONS.maxWords)
  checks.push({
    id: 'phrase_length',
    label: 'Lines are one phrase each',
    detail: long.length === 0
      ? `All lines are ${DEFAULT_PHRASE_OPTIONS.maxWords} words or fewer`
      : `${long.length} line${long.length === 1 ? '' : 's'} over ${DEFAULT_PHRASE_OPTIONS.maxWords} words — split ${long.length === 1 ? 'it' : 'them'} in the editor`,
    status: long.length === 0 ? 'ok' : 'warn',
    lines: long.map((l) => l.row),
  })

  const seen = new Map<string, number>()
  const duplicates: number[] = []
  lyricLines.forEach((l, i) => {
    const key = l.text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim()
    if (key === '') return
    if (seen.has(key)) duplicates.push(rowNumber(i))
    else seen.set(key, i)
  })
  checks.push({
    id: 'duplicates',
    label: 'No repeated lines',
    detail: duplicates.length === 0
      ? 'Every line is distinct'
      : `${duplicates.length} repeated line${duplicates.length === 1 ? '' : 's'} — fine if the text really repeats`,
    status: duplicates.length === 0 ? 'ok' : 'info',
    lines: duplicates,
  })

  // ── Leftovers from wherever the text came from ─────────────────────────────

  const artifacts = lyricLines
    .map((l, i) => ({ row: rowNumber(i), text: l.text }))
    .filter(({ text }) =>
      MOJIBAKE_RE.test(text) || SYLLABLE_HYPHEN_RE.test(text) || FURNITURE_IN_LINE_RE.test(text))
  checks.push({
    id: 'clean_text',
    label: 'No scan or encoding leftovers',
    detail: artifacts.length === 0
      ? 'No split syllables, score markings or mojibake'
      : `${artifacts.length} line${artifacts.length === 1 ? '' : 's'} still holding a hyphenated syllable, a marking or broken characters`,
    status: artifacts.length === 0 ? 'ok' : 'warn',
    lines: artifacts.map((a) => a.row),
  })

  // ── The second language ───────────────────────────────────────────────────

  if (translations.length > 0) {
    const language = detectLanguage(translations.map((l) => l.translation!).join(' '))
    const sung = detectLanguage(stripTranslations(input.lyrics))
    checks.push({
      id: 'translation',
      label: 'Second language kept as translation',
      detail: `${translations.length} of ${lyricLines.length} lines have a translation` +
        (language ? ` (${languageName(language)}${sung ? `, sung text ${languageName(sung)}` : ''})` : '') +
        ' — shown after Check, never drilled',
      status: 'info',
    })
  }

  if (sectionLabels.length > 0) {
    checks.push({
      id: 'section_labels',
      label: 'Section labels skipped',
      detail: `${sectionLabels.length} label${sectionLabels.length === 1 ? '' : 's'} (${sectionLabels.slice(0, 3).map((l) => l.text).join(', ')}${sectionLabels.length > 3 ? '…' : ''}) separate stanzas instead of becoming cards`,
      status: 'info',
    })
  }

  // ── Rehearsal fields ──────────────────────────────────────────────────────

  if (input.includeMetadata !== false) {
    checks.push({
      id: 'title',
      label: 'Title',
      detail: input.title.trim() || 'Missing — required to save',
      status: input.title.trim() ? 'ok' : 'warn',
    })

    const missing: string[] = []
    if (!input.composer?.trim()) missing.push('composer')
    if (!input.voicePart) missing.push('voice part')
    if (!input.concertDate) missing.push('concert date')
    if (!input.hasAudio) missing.push('audio')
    checks.push({
      id: 'rehearsal_fields',
      label: 'Rehearsal details',
      detail: missing.length === 0
        ? 'Composer, voice part, concert date and audio all set'
        : `Not set: ${missing.join(', ')} — all optional`,
      status: missing.length === 0 ? 'ok' : 'info',
    })
  }

  return {
    checks,
    lineCount: lyricLines.length,
    translationCount: translations.length,
    needsAttention: checks.some((c) => c.status === 'warn'),
    blocked: lyricLines.length === 0 || (input.includeMetadata !== false && input.title.trim() === ''),
  }
}

/** Rows the checklist points at, deduplicated — for highlighting in the editor. */
export function flaggedRows(report: SaveQaReport): number[] {
  const rows = new Set<number>()
  for (const check of report.checks) {
    if (check.status !== 'warn') continue
    for (const row of check.lines ?? []) rows.add(row)
  }
  return [...rows].sort((a, b) => a - b)
}

/** Lines that would become section labels rather than cards — used by the editor. */
export function isSkippedRow(text: string): boolean {
  return text.trim() === '' || isSectionLabel(text)
}
