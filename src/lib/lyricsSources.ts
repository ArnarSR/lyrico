/**
 * Typed clients for the two endpoints that bring lyrics into the app:
 * `api/find-lyrics` (search the web for a work's sung text) and
 * `api/extract-lyrics-ocr` (read it off a sheet-music scan).
 *
 * Both were called inline from the New-song screen. They live here now because
 * batch import needs them too, and a batch run has to be able to tell a real
 * failure from a work that simply was not found.
 */

export type LyricsConfidence = 'high' | 'medium' | 'low'

export type CopyrightStatus =
  | 'public_domain'
  | 'likely_public_domain'
  | 'under_copyright'
  | 'unclear'

/** One version of a work's text, as `api/find-lyrics` returns it. */
export interface LyricsVersion {
  label: string
  distinguishedBy: string
  language: string
  lyrics: string
  sourceUrl: string
  sourceTitle: string
  confidence: LyricsConfidence
  copyrightStatus: CopyrightStatus
}

export interface LyricsSearchResult {
  status: 'found' | 'not_found' | 'copyright_restricted'
  work: { title: string; composer: string; textAuthor: string }
  versions: LyricsVersion[]
  /** How the versions differ, when more than one was found. */
  conflictSummary: string
  notes: string
  /** Parallel to `versions`: true where the singer will not read the language. */
  needsTranslation: boolean[]
}

/** Thrown when an endpoint answered, but with an error rather than a result. */
export class LyricsSourceError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LyricsSourceError'
    this.status = status
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json() as { error?: string }
    if (data?.error) return data.error
  } catch {
    // Not JSON — fall through to the status line.
  }
  return `Request failed (HTTP ${res.status})`
}

/**
 * Searches the web for a work's sung text. Resolves with status "not_found"
 * rather than throwing when nothing turned up: that is an answer, not a fault,
 * and a batch run wants to show it as one.
 */
export async function findLyrics(
  input: { title: string; composer?: string },
  opts: { signal?: AbortSignal } = {},
): Promise<LyricsSearchResult> {
  const res = await fetch('/api/find-lyrics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({ title: input.title, composer: input.composer }),
  })

  if (!res.ok) throw new LyricsSourceError(await readError(res), res.status)

  const data = await res.json() as Partial<LyricsSearchResult>
  if (!data.status) throw new LyricsSourceError('The search returned an unexpected response')

  return {
    status: data.status,
    work: data.work ?? { title: input.title, composer: input.composer ?? '', textAuthor: '' },
    versions: data.versions ?? [],
    conflictSummary: data.conflictSummary ?? '',
    notes: data.notes ?? '',
    needsTranslation: data.needsTranslation ?? [],
  }
}

/** Reads the sung text off one image or PDF of a score. */
export async function extractLyricsFromScan(
  file: File,
  opts: { signal?: AbortSignal } = {},
): Promise<string> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch('/api/extract-lyrics-ocr', {
    method: 'POST',
    body: form,
    signal: opts.signal,
  })

  if (!res.ok) throw new LyricsSourceError(await readError(res), res.status)

  const data = await res.json() as { lyrics?: string; error?: string }
  if (data.error) throw new LyricsSourceError(data.error)
  if (!data.lyrics?.trim()) throw new LyricsSourceError('No lyrics were found in this file')
  return data.lyrics
}

export const SCAN_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf'

const SCAN_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])

/** Anthropic's own ceiling for an attached file. */
export const MAX_SCAN_BYTES = 30 * 1024 * 1024

/** Why a file cannot be scanned, or null when it can. */
export function scanRejectReason(file: File): string | null {
  if (!SCAN_TYPES.has(file.type)) return `Unsupported file type (${file.type || 'unknown'})`
  if (file.size > MAX_SCAN_BYTES) return `Too large (${Math.round(file.size / 1024 / 1024)} MB of max 30 MB)`
  return null
}
