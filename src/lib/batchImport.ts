/**
 * Batch import — getting many songs into the library in one go.
 *
 * Two ways in, one pipeline:
 *
 *   look up by title   → api/find-lyrics  ─┐
 *                                          ├→ prepareLyrics → api/check-lyrics → grade
 *   scan sheet music   → api/extract-ocr  ─┘
 *
 * Every job ends with a grade, because the thing that makes a batch different
 * from adding one song is that nobody is watching each result arrive. The
 * singer needs to know, at a glance over a list of twenty, which texts came
 * back clean, which ones need a look before they are drilled, and which ones
 * did not really come back at all. A wrong line is worse than a missing one:
 * they would memorise the mistake and sing it at the concert.
 *
 * Grading combines three independent signals:
 *   - how well it was fetched  (search confidence, whether sources agreed)
 *   - whether it is right      (the quality check's verdict and blockers)
 *   - whether it is formatted  (line count, rows holding two sung phrases)
 *
 * This module is deliberately free of React and of the DOM so the pipeline can
 * be tested without a browser; the UI lives in components/BatchImport.tsx.
 */
import { checkLyrics, type LyricsReview } from './lyricsQc'
import {
  extractLyricsFromScan,
  findLyrics,
  LyricsSourceError,
  type LyricsSearchResult,
  type LyricsVersion,
} from './lyricsSources'
import { describePrepare, prepareLyrics } from './prepareLyrics'
import { cardLineCount } from './translation'
import { normalizeForSearch } from './search'
import { uid } from './id'

// ── Jobs ──────────────────────────────────────────────────────────────────────

export type BatchSource = 'lookup' | 'scan'

export type BatchStage =
  | 'queued'
  | 'fetching'
  | 'checking'
  | 'done'
  | 'failed'
  | 'cancelled'

export type BatchGrade = 'ready' | 'review' | 'poor'

export interface BatchQuality {
  grade: BatchGrade
  /** 0–100. Only ever shown next to the reasons that produced it. */
  score: number
  /** Short, singer-facing phrases: "sources disagreed", "3 blockers". */
  reasons: string[]
}

export interface BatchOutcome {
  title: string
  composer: string
  lyrics: string
  /** Rows that will become flashcards — translations and labels excluded. */
  lineCount: number
  language: string
  sourceUrl: string
  sourceTitle: string
  /** Other versions the search turned up; the singer may be rehearsing one. */
  alternatives: LyricsVersion[]
  conflictSummary: string
  notes: string
  /** What phrase/translation detection changed, when it changed anything. */
  prepareSummary: string
  review: LyricsReview | null
  quality: BatchQuality
}

export interface BatchJob {
  id: string
  source: BatchSource
  /** What the singer asked for — the typed title, or the file's name. */
  label: string
  title: string
  composer: string
  file?: File
  stage: BatchStage
  outcome?: BatchOutcome
  error?: string
  /** Ticked rows are the ones "Import" will save. */
  selected: boolean
}

// ── Parsing a pasted list ─────────────────────────────────────────────────────

/** " - ", " – ", " — ", " | " and " by " all separate a title from a composer. */
const COMPOSER_SPLIT = /\s+(?:[-–—|]|by|av)\s+/i

/**
 * A bullet or a numbered-list marker pasted in along with the titles.
 *
 * The digits must be followed by "." or ")" — choral repertoire is full of
 * titles that legitimately begin with a number ("9 Lessons and Carols",
 * "4 Last Songs", "1000 years"), and stripping the number off those searches
 * for the wrong work without ever saying so.
 */
const LIST_MARKER = /^(?:[-*•–—]|\d{1,2}[.)])\s+/

/**
 * Turns a pasted block of song names into jobs. One song per line; a composer
 * may follow the title after a dash, a pipe, "by" or "av". Blank lines and
 * lines starting with # are skipped, and a title that appears twice is only
 * looked up once.
 */
export function parseBatchList(text: string): BatchJob[] {
  const seen = new Set<string>()
  const jobs: BatchJob[] = []

  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(LIST_MARKER, '')
    if (!line || line.startsWith('#')) continue

    const [titlePart, ...rest] = line.split(COMPOSER_SPLIT)
    const title = titlePart.trim()
    if (!title) continue

    const key = normalizeForSearch(title)
    if (seen.has(key)) continue
    seen.add(key)

    jobs.push({
      id: uid(),
      source: 'lookup',
      label: line,
      title,
      composer: rest.join(' ').trim(),
      stage: 'queued',
      selected: false,
    })
  }

  return jobs
}

/** One job per picked file. Rejected files become already-failed jobs. */
export function jobsFromFiles(
  files: File[],
  reject: (file: File) => string | null,
): BatchJob[] {
  return files.map((file) => {
    const reason = reject(file)
    return {
      id: uid(),
      source: 'scan' as const,
      label: file.name,
      // The real title comes from the quality check once the text is read;
      // the filename is a stand-in so the row has something to show meanwhile.
      title: titleFromFilename(file.name),
      composer: '',
      file,
      stage: reason ? ('failed' as const) : ('queued' as const),
      error: reason ?? undefined,
      selected: false,
    }
  })
}

export function titleFromFilename(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Grading ───────────────────────────────────────────────────────────────────

const GRADE_LABEL: Record<BatchGrade, string> = {
  ready: 'Ready',
  review: 'Needs a look',
  poor: 'Not usable',
}

export function gradeLabel(grade: BatchGrade): string {
  return GRADE_LABEL[grade]
}

interface GradeInput {
  lineCount: number
  /** Absent for a scan — there was no search to be confident about. */
  confidence?: LyricsVersion['confidence']
  copyrightStatus?: LyricsVersion['copyrightStatus']
  alternatives: number
  review: LyricsReview | null
  /** The quality check could not run; the text is unvetted rather than bad. */
  reviewFailed?: boolean
}

/**
 * Turns the signals into one grade. Deductions are additive and deliberately
 * blunt — the number exists to order the list, the reasons are what the singer
 * actually reads.
 */
export function gradeOutcome(input: GradeInput): BatchQuality {
  const reasons: string[] = []
  let score = 100

  if (input.lineCount === 0) {
    return { grade: 'poor', score: 0, reasons: ['No lines to drill'] }
  }
  if (input.lineCount < 3) {
    score -= 25
    reasons.push(`Only ${input.lineCount} line${input.lineCount === 1 ? '' : 's'}`)
  }

  if (input.copyrightStatus === 'under_copyright') {
    score -= 45
    reasons.push('Likely still under copyright')
  } else if (input.copyrightStatus === 'unclear') {
    score -= 10
    reasons.push('Copyright unclear')
  }

  if (input.confidence === 'low') {
    score -= 35
    reasons.push('Low confidence in the source')
  } else if (input.confidence === 'medium') {
    score -= 15
    reasons.push('Medium confidence in the source')
  }

  if (input.alternatives > 0) {
    score -= 15
    reasons.push(
      `${input.alternatives} other version${input.alternatives === 1 ? '' : 's'} found`,
    )
  }

  if (input.reviewFailed) {
    score -= 20
    reasons.push('Quality check could not run')
  } else if (input.review) {
    const blockers = input.review.issues.filter((i) => i.severity === 'blocker').length
    const warnings = input.review.issues.filter((i) => i.severity === 'warning').length

    if (blockers > 0) {
      score -= 30 + 10 * Math.min(blockers - 1, 3)
      reasons.push(`${blockers} blocker${blockers === 1 ? '' : 's'}`)
    }
    if (warnings > 0) {
      score -= Math.min(5 * warnings, 20)
      reasons.push(`${warnings} warning${warnings === 1 ? '' : 's'}`)
    }
    if (input.review.verdict === 'needs_work' && blockers === 0 && warnings === 0) {
      score -= 25
      reasons.push('Flagged for a closer look')
    }
  }

  score = Math.max(0, Math.min(100, score))

  // "poor" is reserved for results there is no point opening: nothing to
  // drill, or so many blockers that re-fetching beats fixing. Anything a
  // singer could still salvage by looking at it belongs in "review".
  let grade: BatchGrade = score >= 80 ? 'ready' : score >= 35 ? 'review' : 'poor'

  // "Ready" means the text has been looked at and is clean. When the quality
  // check never ran, nothing has looked at it — whatever the other signals
  // say, that is a text to open, not one to import unseen.
  if (input.reviewFailed && grade === 'ready') grade = 'review'

  if (reasons.length === 0) reasons.push('Clean')
  return { grade, score, reasons }
}

// ── The pipeline ──────────────────────────────────────────────────────────────

export interface BatchDeps {
  findLyrics: typeof findLyrics
  extractLyricsFromScan: typeof extractLyricsFromScan
  checkLyrics: typeof checkLyrics
}

const DEFAULT_DEPS: BatchDeps = { findLyrics, extractLyricsFromScan, checkLyrics }

/**
 * Runs one job end to end. `onStage` fires as it moves between steps so the
 * row can say what is happening rather than spinning for a minute.
 *
 * Never throws for an expected outcome — a work that was not found, a scan with
 * no text, a quality check that fell over. Those come back as a failed job or a
 * poor grade, because a batch of twenty must not stop at the first miss.
 */
export async function runJob(
  job: BatchJob,
  opts: {
    signal?: AbortSignal
    onStage?: (stage: BatchStage) => void
    deps?: Partial<BatchDeps>
  } = {},
): Promise<BatchJob> {
  const deps = { ...DEFAULT_DEPS, ...opts.deps }
  const { signal } = opts
  const stage = (s: BatchStage) => opts.onStage?.(s)

  const fail = (error: string): BatchJob => ({ ...job, stage: 'failed', error })

  try {
    stage('fetching')

    let raw: string
    let title = job.title
    let composer = job.composer
    let search: LyricsSearchResult | null = null
    let version: LyricsVersion | null = null

    if (job.source === 'lookup') {
      search = await deps.findLyrics({ title: job.title, composer: job.composer || undefined }, { signal })

      if (search.status === 'not_found' || search.versions.length === 0) {
        return fail(search.notes?.trim() || 'No source for this text was found')
      }
      if (search.status === 'copyright_restricted') {
        return fail(
          search.notes?.trim() ||
            'The text is still under copyright, so it cannot be fetched. Scan the sheet music instead.',
        )
      }

      version = search.versions[0]
      if (!version.lyrics.trim()) {
        return fail('The source was found but returned no text')
      }
      raw = version.lyrics
      title = search.work.title?.trim() || job.title
      composer = search.work.composer?.trim() || job.composer
    } else {
      if (!job.file) return fail('No file to read')
      raw = await deps.extractLyricsFromScan(job.file, { signal })
    }

    if (signal?.aborted) return { ...job, stage: 'cancelled' }

    // Phrase and translation detection, but only where the text needs it.
    //
    // A scan arrives with syllables split across hyphens and phrases broken at
    // every system end, which is exactly what prepareLyrics was built for. A
    // search result does not: api/find-lyrics already returns one sung line per
    // row with the syllables rejoined. Running the detector over it merges
    // lines that are correctly separate — unpunctuated liturgical Latin is the
    // common case, where four sung phrases collapse into one ten-word
    // flashcard the singer cannot possibly recall as a unit.
    const prepared = job.source === 'scan' ? prepareLyrics(raw) : null
    const lyrics = prepared ? prepared.lyrics : raw
    const lineCount = cardLineCount(lyrics)

    stage('checking')

    let review: LyricsReview | null = null
    let reviewFailed = false
    try {
      review = await deps.checkLyrics(
        {
          title,
          composer: composer || undefined,
          lyrics,
          // Not 'url': that guidance describes api/fetch-lyrics, a blunt
          // HTML-to-text pass whose output is half page furniture, and it
          // pushes the reviewer to flag real lyric lines as navigation.
          // A find-lyrics result is clean prose from a source, so it is read
          // the way hand-entered text is.
          origin: job.source === 'scan' ? 'ocr' : 'typed',
          sourceUrl: version?.sourceUrl,
        },
        { signal },
      )
    } catch (err) {
      if (signal?.aborted) return { ...job, stage: 'cancelled' }
      reviewFailed = true
      void err // the grade records that the check did not run
    }

    if (signal?.aborted) return { ...job, stage: 'cancelled' }

    // The check often establishes a title a filename never could.
    if (review?.titleSuggestion?.trim()) title = review.titleSuggestion.trim()
    if (!composer && review?.composerSuggestion?.trim()) composer = review.composerSuggestion.trim()

    const alternatives = search ? search.versions.slice(1) : []

    const quality = gradeOutcome({
      lineCount,
      confidence: version?.confidence,
      copyrightStatus: version?.copyrightStatus,
      alternatives: alternatives.length,
      review,
      reviewFailed,
    })

    return {
      ...job,
      stage: 'done',
      error: undefined,
      // Pre-tick everything that is safe to import; the singer unticks rather
      // than hunting for the good ones.
      selected: quality.grade !== 'poor',
      outcome: {
        title,
        composer,
        lyrics,
        lineCount,
        language: review?.language || version?.language || '',
        sourceUrl: version?.sourceUrl ?? '',
        sourceTitle: version?.sourceTitle ?? (job.source === 'scan' ? job.label : ''),
        alternatives,
        conflictSummary: search?.conflictSummary ?? '',
        notes: search?.notes ?? '',
        prepareSummary: prepared?.changed ? describePrepare(prepared) : '',
        review,
        quality,
      },
    }
  } catch (err) {
    if (signal?.aborted) return { ...job, stage: 'cancelled' }
    if (err instanceof LyricsSourceError) return fail(err.message)
    return fail(err instanceof Error ? err.message : 'Something went wrong')
  }
}

/**
 * Runs jobs with at most `limit` in flight. These are expensive, web-searching
 * model calls; firing twenty at once would rate-limit the lot of them and tell
 * the singer nothing until the end.
 */
export async function runBatch(
  jobs: BatchJob[],
  opts: {
    limit?: number
    signal?: AbortSignal
    onUpdate: (job: BatchJob) => void
    deps?: Partial<BatchDeps>
  },
): Promise<void> {
  const limit = Math.max(1, opts.limit ?? 3)
  const pending = jobs.filter((j) => j.stage === 'queued')
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      if (opts.signal?.aborted) return
      const index = next++
      if (index >= pending.length) return

      const job = pending[index]
      const finished = await runJob(job, {
        signal: opts.signal,
        deps: opts.deps,
        onStage: (stage) => opts.onUpdate({ ...job, stage }),
      })
      opts.onUpdate(finished)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, pending.length) }, worker))
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface BatchSummary {
  total: number
  finished: number
  running: number
  ready: number
  review: number
  poor: number
  failed: number
  selected: number
}

export function summarize(jobs: BatchJob[]): BatchSummary {
  const summary: BatchSummary = {
    total: jobs.length,
    finished: 0,
    running: 0,
    ready: 0,
    review: 0,
    poor: 0,
    failed: 0,
    selected: 0,
  }

  for (const job of jobs) {
    if (job.stage === 'fetching' || job.stage === 'checking') summary.running++
    if (job.stage === 'done' || job.stage === 'failed' || job.stage === 'cancelled') summary.finished++
    if (job.stage === 'failed') summary.failed++
    if (job.stage === 'done' && job.outcome) {
      summary[job.outcome.quality.grade]++
      if (job.selected) summary.selected++
    }
  }

  return summary
}

/** What a row says while it is working. The fetch step differs by source. */
export function stageLabel(stage: BatchStage, source: BatchSource): string {
  switch (stage) {
    case 'queued': return 'Waiting'
    case 'fetching': return source === 'scan' ? 'Reading the scan' : 'Searching for the text'
    case 'checking': return 'Checking quality'
    case 'done': return 'Done'
    case 'failed': return 'Failed'
    case 'cancelled': return 'Stopped'
  }
}
