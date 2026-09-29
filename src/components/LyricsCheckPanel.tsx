import {
  ISSUE_LABEL,
  VERDICT_LABEL,
  isSafeReplacement,
  type LyricsIssue,
  type LyricsReview,
} from '../lib/lyricsQc'

interface LyricsCheckPanelProps {
  review: LyricsReview
  /** True when the lyrics have been edited since this review was made. */
  stale: boolean
  onApplyFixes: (cleaned: string) => void
  onApplyTitle: (title: string) => void
  onApplyComposer: (composer: string) => void
  onDismiss: () => void
}

/**
 * The quality-check report. Advisory only — every fix is something the singer
 * chooses to apply, and they can always save the text as they typed it.
 */
export function LyricsCheckPanel({
  review,
  stale,
  onApplyFixes,
  onApplyTitle,
  onApplyComposer,
  onDismiss,
}: LyricsCheckPanelProps) {
  const tone = review.verdict === 'clean' ? 'correct' : review.verdict === 'needs_work' ? 'wrong' : 'accent'
  const canApply =
    !stale &&
    review.cleanedLyrics.length > 0 &&
    isSafeReplacement(review.checkedLyrics, review.cleanedLyrics, review.origin)

  return (
    <div className={`mb-2 rounded-xl border bg-bg-soft px-3 py-3 ${toneBorder[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${toneText[tone]}`}>
            {review.verdict === 'clean' ? '✓' : '!'} {VERDICT_LABEL[review.verdict]}
          </span>
          {review.origin === 'url' && <span className="text-xs text-text-dim">· imported page</span>}
          {review.origin === 'ocr' && <span className="text-xs text-text-dim">· scan</span>}
          {review.verified && <span className="text-xs text-text-dim">· checked against sources</span>}
          {review.language && <span className="text-xs text-text-dim">· {review.language}</span>}
        </div>
        <button type="button" onClick={onDismiss} className="shrink-0 text-xs text-text-dim hover:text-text">
          Hide
        </button>
      </div>

      {review.summary && <p className="mt-1.5 text-xs leading-relaxed text-text-dim">{review.summary}</p>}

      {stale && (
        <p className="mt-1.5 text-xs text-accent">
          You have edited the lyrics since this check — run it again to re-check.
        </p>
      )}

      {review.issues.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {review.issues.map((issue, i) => (
            <IssueRow key={`${issue.line}-${issue.type}-${i}`} issue={issue} />
          ))}
        </ul>
      )}

      {(review.titleSuggestion || review.composerSuggestion) && (
        <div className="mt-2 flex flex-col gap-1">
          {review.titleSuggestion && (
            <Suggestion label="Title" value={review.titleSuggestion} onApply={() => onApplyTitle(review.titleSuggestion)} />
          )}
          {review.composerSuggestion && (
            <Suggestion
              label="Composer"
              value={review.composerSuggestion}
              onApply={() => onApplyComposer(review.composerSuggestion)}
            />
          )}
        </div>
      )}

      {canApply && (
        <button
          type="button"
          onClick={() => onApplyFixes(review.cleanedLyrics)}
          className="mt-2.5 w-full rounded-lg border border-accent bg-accent/15 px-3 py-2 text-sm text-accent hover:bg-accent/25"
        >
          {review.origin === 'url' ? 'Keep only the lyrics' : 'Apply the fixes to my lyrics'}
        </button>
      )}
      {!stale && review.cleanedLyrics.length > 0 && !canApply && (
        <p className="mt-2 text-xs text-text-dim">
          The suggested rewrite changes too much to apply in one go — fix the lines above by hand.
        </p>
      )}

      {review.sources.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-text-dim">
          <span>Sources:</span>
          {review.sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent underline decoration-accent/40 hover:decoration-accent"
            >
              {s.title || new URL(s.url).hostname}
            </a>
          ))}
        </p>
      )}
    </div>
  )
}

function IssueRow({ issue }: { issue: LyricsIssue }) {
  return (
    <li className="rounded-lg border border-border bg-bg px-2.5 py-2">
      <div className="flex items-center gap-2 text-xs">
        <span className={severityCx[issue.severity]}>{severityLabel[issue.severity]}</span>
        <span className="text-text-dim">{ISSUE_LABEL[issue.type] ?? issue.type}</span>
        {issue.line > 0 && <span className="text-text-dim/70">line {issue.line}</span>}
      </div>
      {issue.quote && (
        <p className="mt-1 truncate font-mono text-xs text-text-dim/90" title={issue.quote}>
          “{issue.quote}”
        </p>
      )}
      <p className="mt-1 text-xs leading-relaxed text-text">{issue.problem}</p>
      {issue.suggestion && <p className="mt-0.5 text-xs leading-relaxed text-accent">→ {issue.suggestion}</p>}
    </li>
  )
}

function Suggestion({ label, value, onApply }: { label: string; value: string; onApply: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-2.5 py-2">
      <p className="truncate text-xs text-text">
        <span className="text-text-dim">{label}: </span>
        {value}
      </p>
      <button type="button" onClick={onApply} className="shrink-0 text-xs text-accent hover:underline">
        Use this
      </button>
    </div>
  )
}

const toneBorder = {
  correct: 'border-correct/40',
  accent: 'border-accent/40',
  wrong: 'border-wrong/50',
} as const

const toneText = {
  correct: 'text-correct',
  accent: 'text-accent',
  wrong: 'text-wrong',
} as const

const severityLabel = { blocker: 'Must fix', warning: 'Check', nit: 'Nit' } as const
const severityCx = {
  blocker: 'text-wrong',
  warning: 'text-accent',
  nit: 'text-text-dim',
} as const
