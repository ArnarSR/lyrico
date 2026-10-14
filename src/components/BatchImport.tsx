import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NewSongInput } from '../hooks/useStorage'
import {
  jobsFromFiles,
  parseBatchList,
  runBatch,
  stageLabel,
  summarize,
  type BatchGrade,
  type BatchJob,
  type BatchSource,
} from '../lib/batchImport'
import { ISSUE_LABEL, VERDICT_LABEL } from '../lib/lyricsQc'
import { MAX_SCAN_BYTES, SCAN_ACCEPT, scanRejectReason } from '../lib/lyricsSources'
import { sameTitle } from '../lib/search'
import { trackBatchStarted } from '../lib/analytics'
import { languageName } from '../lib/translation'
import { Header, Shell } from './Shell'

/**
 * Batch import — look several songs up by name, or read a stack of scanned
 * scores, in one pass.
 *
 * The screen is built around the fact that nobody watches twenty jobs run. It
 * shows what each one is doing while it runs, and when it is finished it leads
 * with a verdict — ready, needs a look, not usable — because that is the only
 * thing that scales to a list this long. Everything else (the text itself, the
 * issues the quality check found, the source, the other versions it turned up)
 * is one tap away on the row.
 *
 * Nothing is saved until the singer presses Import. The pipeline lives in
 * src/lib/batchImport.ts.
 */

/** Expensive, web-searching model calls — a few at a time, not twenty. */
const CONCURRENCY = 3

const GRADE_STYLE: Record<BatchGrade, string> = {
  ready: 'border-correct/40 bg-correct/10 text-correct',
  review: 'border-accent/40 bg-accent/10 text-accent',
  poor: 'border-wrong/40 bg-wrong/10 text-wrong',
}

/** Quieter than the grade pill — these sit in a row of their own. */
const REASON_STYLE: Record<BatchGrade, string> = {
  ready: 'bg-correct/10 text-correct/80',
  review: 'bg-accent/10 text-accent/80',
  poor: 'bg-wrong/10 text-wrong/80',
}

const GRADE_TEXT: Record<BatchGrade, string> = {
  ready: 'Ready',
  review: 'Needs a look',
  poor: 'Not usable',
}

const PLACEHOLDER = `Gamle Norge
Ave verum corpus - Mozart
Deilig er jorden – Ingemann
Hymne a l'amour | Edith Piaf`

interface BatchImportProps {
  /** Titles already in the library, so a duplicate can be pointed out. */
  existingTitles: string[]
  onCancel: () => void
  /** Called once with everything the singer ticked. */
  onImport: (songs: NewSongInput[]) => void
}

export function BatchImport({ existingTitles, onCancel, onImport }: BatchImportProps) {
  const [source, setSource] = useState<BatchSource>('lookup')
  const [list, setList] = useState('')
  const [jobs, setJobs] = useState<BatchJob[]>([])
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // A run outlives a re-render but must not outlive the screen.
  useEffect(() => () => abortRef.current?.abort(), [])

  const summary = useMemo(() => summarize(jobs), [jobs])
  const selected = useMemo(
    () => jobs.filter((j) => j.stage === 'done' && j.selected && j.outcome),
    [jobs],
  )

  const updateJob = useCallback((next: BatchJob) => {
    setJobs((prev) => prev.map((j) => (j.id === next.id ? { ...next } : j)))
  }, [])

  const pendingList = useMemo(() => (source === 'lookup' ? parseBatchList(list) : []), [source, list])

  function handleFiles(picked: FileList | null) {
    if (!picked?.length) return
    setFileError(null)
    const files = Array.from(picked)
    const oversize = files.filter((f) => f.size > MAX_SCAN_BYTES)
    if (oversize.length === files.length && oversize.length > 0) {
      setFileError(`Every file is over the ${Math.round(MAX_SCAN_BYTES / 1024 / 1024)} MB limit.`)
    }
    setJobs(jobsFromFiles(files, scanRejectReason))
  }

  async function start() {
    const queued = source === 'lookup' ? pendingList : jobs
    if (queued.length === 0) return

    const controller = new AbortController()
    abortRef.current = controller
    setJobs(queued)
    setRunning(true)
    trackBatchStarted(source, queued.length)
    try {
      await runBatch(queued, {
        limit: CONCURRENCY,
        signal: controller.signal,
        onUpdate: updateJob,
      })
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
    setRunning(false)
    setJobs((prev) =>
      prev.map((j) => (j.stage === 'queued' || j.stage === 'fetching' || j.stage === 'checking'
        ? { ...j, stage: 'cancelled' }
        : j)),
    )
  }

  function toggle(id: string) {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, selected: !j.selected } : j)))
  }

  function reset() {
    abortRef.current?.abort()
    abortRef.current = null
    setJobs([])
    setRunning(false)
    setExpanded(null)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function importSelected() {
    onImport(
      selected.map((job) => ({
        title: job.outcome!.title,
        composer: job.outcome!.composer || undefined,
        lyrics: job.outcome!.lyrics,
      })),
    )
  }

  const started = jobs.length > 0
  const canStart = !running && (source === 'lookup' ? pendingList.length > 0 : jobs.some((j) => j.stage === 'queued'))

  return (
    <Shell bottomPad>
      <Header
        title="Add several songs"
        subtitle={
          started
            ? `${summary.finished} of ${summary.total} done`
            : 'Look songs up by name, or read a stack of scores'
        }
        right={
          <button type="button" onClick={onCancel} className="text-sm text-text-dim hover:text-text">
            Cancel
          </button>
        }
      />

      {!started && (
        <>
          <div className="mb-4 flex rounded-full border border-border bg-bg-soft p-1 text-sm">
            {([
              ['lookup', 'By name'],
              ['scan', 'Scan scores'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setSource(id); setFileError(null) }}
                className={`flex-1 rounded-full py-2 transition-colors ${source === id ? 'bg-accent/15 text-accent' : 'text-text-dim hover:text-text'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {source === 'lookup' ? (
            <div>
              <label htmlFor="batch-list" className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-text-dim/60">
                One song per line
              </label>
              <textarea
                id="batch-list"
                value={list}
                onChange={(e) => setList(e.target.value)}
                rows={8}
                placeholder={PLACEHOLDER}
                className="w-full resize-y rounded-2xl border border-border bg-bg-soft px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-dim/40 focus:border-accent"
              />
              <p className="mt-2 text-xs text-text-dim/60">
                Add the composer after a dash, a pipe or “by” when a title is ambiguous — it makes the
                search far more accurate. Each text is searched for, then put through the same quality
                check as a song you add by hand.
              </p>
              {pendingList.length > 0 && (
                <p className="mt-2 text-xs text-accent">
                  {pendingList.length} song{pendingList.length === 1 ? '' : 's'} to look up
                </p>
              )}
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={SCAN_ACCEPT}
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
                id="batch-files"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-2xl border border-dashed border-border bg-bg-soft px-6 py-10 text-center hover:border-accent/50"
              >
                <p className="text-text">Choose scores</p>
                <p className="mt-1.5 text-xs text-text-dim">
                  Photos or PDFs, several at a time. Each one is read on its own, so one bad scan does
                  not hold up the rest.
                </p>
              </button>
              {fileError && <p className="mt-2 text-xs text-wrong">{fileError}</p>}
            </div>
          )}
        </>
      )}

      {started && (
        <>
          <ProgressBar done={summary.finished} total={summary.total} />

          <div className="mb-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
            {summary.ready > 0 && <span className="text-correct">{summary.ready} ready</span>}
            {summary.review > 0 && <span className="text-accent">{summary.review} need a look</span>}
            {summary.poor > 0 && <span className="text-wrong">{summary.poor} not usable</span>}
            {summary.failed > 0 && <span className="text-wrong/80">{summary.failed} failed</span>}
            {summary.running > 0 && <span>{summary.running} running</span>}
          </div>

          <ul className="flex flex-col gap-2">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobRow
                  job={job}
                  expanded={expanded === job.id}
                  duplicate={!!job.outcome && existingTitles.some((t) => sameTitle(t, job.outcome!.title))}
                  onToggleExpand={() => setExpanded((cur) => (cur === job.id ? null : job.id))}
                  onToggleSelect={() => toggle(job.id)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Action bar ── */}
      <div className="mt-6 flex flex-col gap-2">
        {!started && (
          <button
            type="button"
            disabled={!canStart}
            onClick={start}
            className="rounded-full bg-accent py-3 text-sm font-medium text-bg transition-opacity hover:brightness-110 disabled:opacity-40"
          >
            {source === 'lookup'
              ? `Find ${pendingList.length || ''} ${pendingList.length === 1 ? 'song' : 'songs'}`.replace('  ', ' ')
              : 'Read the scores'}
          </button>
        )}

        {started && running && (
          <button
            type="button"
            onClick={stop}
            className="rounded-full border border-border py-3 text-sm text-text-dim hover:text-text"
          >
            Stop
          </button>
        )}

        {started && !running && (
          <>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={importSelected}
              className="rounded-full bg-accent py-3 text-sm font-medium text-bg transition-opacity hover:brightness-110 disabled:opacity-40"
            >
              {selected.length === 0
                ? 'Nothing selected'
                : `Import ${selected.length} song${selected.length === 1 ? '' : 's'}`}
            </button>
            <button type="button" onClick={reset} className="py-2 text-center text-xs text-text-dim hover:text-text">
              Start over
            </button>
          </>
        )}
      </div>
    </Shell>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-bg-card">
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  )
}

function JobRow({
  job,
  expanded,
  duplicate,
  onToggleExpand,
  onToggleSelect,
}: {
  job: BatchJob
  expanded: boolean
  duplicate: boolean
  onToggleExpand: () => void
  onToggleSelect: () => void
}) {
  const busy = job.stage === 'fetching' || job.stage === 'checking'
  const outcome = job.outcome
  const title = outcome?.title || job.title || job.label

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-soft">
      <div className="flex items-start gap-3 px-4 py-3">
        {outcome ? (
          <input
            type="checkbox"
            checked={job.selected}
            onChange={onToggleSelect}
            aria-label={`Import ${title}`}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
          />
        ) : (
          <span className="mt-1 h-4 w-4 shrink-0" />
        )}

        <button type="button" onClick={onToggleExpand} className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm text-text">{title}</p>
            {outcome && (
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${GRADE_STYLE[outcome.quality.grade]}`}>
                {GRADE_TEXT[outcome.quality.grade]}
              </span>
            )}
          </div>

          {/* Where this job stands. While it runs, one line; once it is done,
              the facts on one line and the verdict's reasons as chips below —
              a reason truncated off the end of a line is the one thing on this
              screen the singer most needs to read. */}
          {job.stage === 'failed' ? (
            <p className="mt-0.5 text-xs text-wrong/80">{job.error}</p>
          ) : job.stage === 'cancelled' ? (
            <p className="mt-0.5 text-xs text-text-dim">Stopped</p>
          ) : busy || job.stage === 'queued' ? (
            <p className={`mt-0.5 truncate text-xs ${busy ? 'text-accent' : 'text-text-dim'}`}>
              {stageLabel(job.stage, job.source)}
              {busy && '…'}
            </p>
          ) : outcome ? (
            <>
              <p className="mt-0.5 truncate text-xs text-text-dim">
                {[
                  `${outcome.lineCount} line${outcome.lineCount === 1 ? '' : 's'}`,
                  outcome.composer,
                  outcome.language ? languageName(outcome.language) : '',
                ].filter(Boolean).join(' · ')}
              </p>
              <span className="mt-1.5 flex flex-wrap gap-1">
                {outcome.quality.reasons.map((reason) => (
                  <span
                    key={reason}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${REASON_STYLE[outcome.quality.grade]}`}
                  >
                    {reason}
                  </span>
                ))}
              </span>
            </>
          ) : null}

          {duplicate && (
            <p className="mt-1 text-xs text-accent/80">Already in your library — importing adds a second copy</p>
          )}
        </button>
      </div>

      {expanded && outcome && <JobDetail job={job} />}
    </div>
  )
}

function JobDetail({ job }: { job: BatchJob }) {
  const outcome = job.outcome!
  const review = outcome.review
  const blockers = review?.issues.filter((i) => i.severity === 'blocker') ?? []
  const rest = review?.issues.filter((i) => i.severity !== 'blocker') ?? []

  return (
    <div className="border-t border-border/50 px-4 py-3">
      {review && (
        <p className="mb-3 text-xs text-text-dim">
          <span className="text-text">{VERDICT_LABEL[review.verdict]}</span>
          {review.summary ? ` · ${review.summary}` : ''}
        </p>
      )}

      {outcome.prepareSummary && (
        <p className="mb-3 text-xs text-text-dim/70">Line layout: {outcome.prepareSummary}</p>
      )}

      {(blockers.length > 0 || rest.length > 0) && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {[...blockers, ...rest].slice(0, 6).map((issue, i) => (
            <li key={i} className="text-xs">
              <span className={issue.severity === 'blocker' ? 'text-wrong' : 'text-accent/80'}>
                {ISSUE_LABEL[issue.type]}
              </span>
              {issue.line > 0 && <span className="text-text-dim/50"> · line {issue.line}</span>}
              <span className="text-text-dim"> — {issue.problem}</span>
            </li>
          ))}
          {blockers.length + rest.length > 6 && (
            <li className="text-xs text-text-dim/50">
              +{blockers.length + rest.length - 6} more, shown when you open the song
            </li>
          )}
        </ul>
      )}

      {outcome.conflictSummary && (
        <p className="mb-3 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-text-dim">
          <span className="text-accent">Versions differ.</span> {outcome.conflictSummary}
        </p>
      )}

      {outcome.alternatives.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs text-text-dim/60">Other versions found</p>
          <ul className="flex flex-col gap-1">
            {outcome.alternatives.map((alt, i) => (
              <li key={i} className="text-xs text-text-dim">
                {alt.label}
                {alt.distinguishedBy && <span className="text-text-dim/60"> — {alt.distinguishedBy}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-text-dim/50">
            The first one was taken. Edit the lyrics after importing to use another.
          </p>
        </div>
      )}

      {outcome.notes && <p className="mb-3 text-xs text-text-dim/70">{outcome.notes}</p>}

      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-bg px-3 py-2 font-serif text-xs leading-relaxed text-text-dim">
        {outcome.lyrics}
      </pre>

      {outcome.sourceUrl && (
        <a
          href={outcome.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-block text-xs text-accent hover:brightness-110"
        >
          Source: {outcome.sourceTitle || outcome.sourceUrl} ↗
        </a>
      )}
      {!outcome.sourceUrl && outcome.sourceTitle && (
        <p className="mt-2 text-xs text-text-dim/60">Read from {outcome.sourceTitle}</p>
      )}
    </div>
  )
}
