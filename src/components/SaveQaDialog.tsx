import type { QaCheck, SaveQaReport } from '../lib/saveQa'

/**
 * The last screen before lyrics are written.
 *
 * Saving a song is not a normal form submit: every line becomes a card the
 * singer drills for weeks, so a wrong line is memorised and sung at the concert.
 * This dialog states what is about to be saved in numbers the singer can check
 * against the text in front of them — how many cards, whether any row is empty,
 * what happened to the second language — rather than asking them to trust a
 * button they have pressed a hundred times.
 *
 * The checks are computed offline in src/lib/saveQa.ts, so this works with the
 * AI check switched off or unavailable.
 */

interface SaveQaDialogProps {
  report: SaveQaReport
  /** Song title, for the subheading. */
  songTitle: string
  saving?: boolean
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  /** Offered when the score printed the translation above the sung text. */
  onSwapTranslation?: () => void
}

export function SaveQaDialog({
  report,
  songTitle,
  saving = false,
  confirmLabel = 'Confirm and save',
  onConfirm,
  onCancel,
  onSwapTranslation,
}: SaveQaDialogProps) {
  const warnings = report.checks.filter((c) => c.status === 'warn').length

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Check before saving"
        className="max-h-[92dvh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl border border-border bg-bg px-5 pb-[var(--pad-bottom-sheet)] pt-5 sm:rounded-3xl"
      >
        <h2 className="text-xl text-accent">Before saving</h2>
        <p className="mt-0.5 text-sm text-text-dim">
          {songTitle || 'Untitled'} · {report.lineCount} line{report.lineCount === 1 ? '' : 's'}
          {report.translationCount > 0 ? ` · ${report.translationCount} translated` : ''}
        </p>

        <p className="mt-3 text-sm text-text-dim">
          {report.blocked
            ? 'This cannot be saved yet.'
            : warnings === 0
              ? 'Everything checks out. Confirm and the lines become flashcards.'
              : `${warnings} thing${warnings === 1 ? '' : 's'} worth a look — you can still save.`}
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {report.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </ul>

        {report.translationCount > 0 && onSwapTranslation && (
          <button
            type="button"
            onClick={onSwapTranslation}
            className="mt-3 w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-text-dim hover:border-accent/50 hover:text-accent"
          >
            Wrong way round? Swap sung text and translation
          </button>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-full border border-border bg-bg-soft py-3 text-sm text-text-dim hover:text-text disabled:opacity-40"
          >
            Back to editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || report.blocked}
            className="flex-[2] rounded-full border border-accent bg-accent/15 py-3 text-sm text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            {saving ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function CheckRow({ check }: { check: QaCheck }) {
  const { mark, markColor, borderColor } = STATUS_STYLE[check.status]

  return (
    <li className={`flex gap-3 rounded-xl border px-3 py-2.5 ${borderColor}`}>
      <span aria-hidden className={`mt-0.5 shrink-0 text-sm ${markColor}`}>{mark}</span>
      <div className="min-w-0">
        <p className="text-sm text-text">{check.label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-dim">{check.detail}</p>
        {check.lines && check.lines.length > 0 && (
          <p className="mt-1 text-xs text-text-dim/70">
            Line{check.lines.length === 1 ? '' : 's'} {formatLines(check.lines)}
          </p>
        )}
      </div>
    </li>
  )
}

const STATUS_STYLE = {
  ok: { mark: '✓', markColor: 'text-correct', borderColor: 'border-border' },
  warn: { mark: '!', markColor: 'text-wrong', borderColor: 'border-wrong/50 bg-wrong/5' },
  info: { mark: '·', markColor: 'text-accent', borderColor: 'border-border' },
} as const

/** Keeps a long list of row numbers readable: "3, 7, 12 and 4 more". */
function formatLines(lines: number[]): string {
  const shown = lines.slice(0, 8).join(', ')
  return lines.length > 8 ? `${shown} and ${lines.length - 8} more` : shown
}
