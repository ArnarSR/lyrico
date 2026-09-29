/**
 * Lyrics quality check — the client side of `api/check-lyrics`.
 *
 * A Claude agent reads the pasted text the way a choir librarian would and
 * reports what would go wrong if the singer started drilling it: page furniture
 * and credits that came along with a URL import, mojibake, scan leftovers,
 * repeated lines, rows holding two sung lines, section labels that would become
 * flashcards of their own. In verify mode it also searches the web and compares
 * the text against real sources.
 *
 * Where the text came from is passed along, because it decides what to look for
 * — see ORIGIN_GUIDANCE in api/check-lyrics.ts.
 */

export type LyricsIssueType =
  | 'garbled_text'
  | 'ocr_artifact'
  | 'encoding'
  | 'not_lyrics'
  | 'section_label'
  | 'duplicate_line'
  | 'line_break'
  | 'wrong_word'
  | 'missing_text'
  | 'language_mix'
  | 'punctuation'
  | 'metadata'
  | 'copyright'
  | 'other'

export type LyricsIssueSeverity = 'blocker' | 'warning' | 'nit'

/** How the text got into the form. */
export type LyricsOrigin = 'url' | 'ocr' | 'typed'

export interface LyricsIssue {
  type: LyricsIssueType
  severity: LyricsIssueSeverity
  /** 1-based line in the submitted text, counting blank lines. 0 = whole text. */
  line: number
  quote: string
  problem: string
  suggestion: string
}

export interface LyricsReview {
  verdict: 'clean' | 'minor' | 'needs_work'
  language: string
  summary: string
  issues: LyricsIssue[]
  /** Text with the flagged fixes applied, or '' when there is nothing to apply. */
  cleanedLyrics: string
  titleSuggestion: string
  composerSuggestion: string
  sources: { url: string; title: string }[]
  /** True when the agent checked the text against web sources. */
  verified: boolean
  origin: LyricsOrigin
  lineCount: number
  /** The exact text this review was made from — used to spot a stale review. */
  checkedLyrics: string
}

export interface CheckLyricsInput {
  title: string
  composer?: string
  lyrics: string
  /** Search the web and compare against real sources. Slower, much stronger. */
  verify?: boolean
  /** Where the text came from — decides what the reviewer looks for. */
  origin?: LyricsOrigin
  /** The page a URL import came from, when there was one. */
  sourceUrl?: string
}

/**
 * Runs the quality check. Rejects with a human-readable message — the caller is
 * expected to show it and let the user save anyway.
 */
export async function checkLyrics(
  input: CheckLyricsInput,
  opts: { signal?: AbortSignal } = {},
): Promise<LyricsReview> {
  const lyrics = input.lyrics.replace(/\r\n/g, '\n')

  const res = await fetch('/api/check-lyrics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      title: input.title,
      composer: input.composer,
      lyrics,
      verify: input.verify === true,
      origin: input.origin ?? 'typed',
      sourceUrl: input.sourceUrl,
    }),
  })

  let data: (Partial<LyricsReview> & { error?: string }) | null = null
  try {
    data = await res.json() as Partial<LyricsReview> & { error?: string }
  } catch {
    // Fall through to the status-based message below.
  }

  if (!res.ok || data?.error) {
    throw new Error(data?.error ?? `The check failed (HTTP ${res.status})`)
  }
  if (!data || !data.verdict) {
    throw new Error('The check returned an unexpected response')
  }

  return {
    verdict: data.verdict,
    language: data.language ?? '',
    summary: data.summary ?? '',
    issues: sortIssues(data.issues ?? []),
    cleanedLyrics: data.cleanedLyrics ?? '',
    titleSuggestion: data.titleSuggestion ?? '',
    composerSuggestion: data.composerSuggestion ?? '',
    sources: data.sources ?? [],
    verified: data.verified === true,
    origin: data.origin ?? input.origin ?? 'typed',
    lineCount: data.lineCount ?? lyrics.split('\n').length,
    checkedLyrics: lyrics,
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<LyricsIssueSeverity, number> = { blocker: 0, warning: 1, nit: 2 }

/** Worst first, then by line, so the list reads top-down within a severity. */
export function sortIssues(issues: LyricsIssue[]): LyricsIssue[] {
  return [...issues].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || a.line - b.line,
  )
}

/** True when the review found something the singer should look at before saving. */
export function needsAttention(review: LyricsReview): boolean {
  return review.verdict === 'needs_work' || review.issues.some((i) => i.severity === 'blocker')
}

/**
 * Guards the one-click "apply fixes" button. Applying the agent's text
 * overwrites what the user has in the textarea, so refuse anything that looks
 * like a rewrite rather than a fix.
 *
 * Deleting lines is the expected direction — a scraped page is often more
 * furniture than lyrics — so how much shrinkage is allowed depends on where the
 * text came from. Added text is the dangerous direction in every case: lines
 * that appear out of nowhere are invented verses, not fixes.
 */
export function isSafeReplacement(original: string, cleaned: string, origin: LyricsOrigin = 'typed'): boolean {
  const before = contentLines(original)
  const after = contentLines(cleaned)
  if (after.length === 0) return false
  if (before.length === 0) return true

  // A URL import is mostly junk often enough that a big cut is the point; text
  // someone typed should only lose a line here and there.
  const keepAtLeast = origin === 'url' ? 0.2 : 0.67
  if (after.length < Math.ceil(before.length * keepAtLeast)) return false

  // The upper bound leaves room for splitting rows that held two sung lines,
  // with a couple of lines of slack so it is not punishing on short texts.
  if (after.length > Math.max(Math.floor(before.length * 1.5), before.length + 2)) return false

  // Compared word by word, not line by line: the fixes worth applying — moving a
  // line break, rejoining "Ve- re" into "Vere", dropping a credits line — barely
  // change the vocabulary, while text that was written rather than cleaned is
  // mostly words the original never had.
  const known = new Set(words(before.join(' ')))
  const afterWords = words(after.join(' '))
  const fresh = afterWords.filter((w) => !known.has(w)).length
  return fresh <= Math.max(2, Math.ceil(afterWords.length * 0.2))
}

function contentLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
}

/** Lower-cased words, punctuation dropped — re-punctuating is not a rewrite. */
function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0)
}

export const VERDICT_LABEL: Record<LyricsReview['verdict'], string> = {
  clean: 'Looks good',
  minor: 'Minor notes',
  needs_work: 'Needs a look',
}

export const ISSUE_LABEL: Record<LyricsIssueType, string> = {
  garbled_text: 'Garbled text',
  ocr_artifact: 'Scan leftover',
  encoding: 'Encoding',
  not_lyrics: 'Not lyrics',
  section_label: 'Section label',
  duplicate_line: 'Repeated line',
  line_break: 'Line break',
  wrong_word: 'Wrong word',
  missing_text: 'Missing text',
  language_mix: 'Mixed languages',
  punctuation: 'Punctuation',
  metadata: 'Title/composer',
  copyright: 'Copyright',
  other: 'Note',
}
