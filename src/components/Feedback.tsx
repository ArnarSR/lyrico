import { diffWords, qualityLabel } from '../lib/scoring'

interface FeedbackProps {
  quality: number
  ratio: number
  attempt: string
  correct: string
  fullLine?: string  // when correct is only the blanked words, pass the full line here
  showDiff?: boolean // show word-level attempt diff (use for full-recall mode)
  hintUsed?: boolean // if true, show a note that a hint was used
}

// Accent color as RGB for the shimmer gradient (#d4924a)
const SHIMMER_STYLE: React.CSSProperties = {
  background:
    'linear-gradient(90deg, rgba(212,146,74,0.10) 0%, rgba(212,146,74,0.38) 40%, rgba(212,146,74,0.10) 100%)',
  backgroundSize: '200% auto',
  animation: 'lyrico-shimmer 1.8s linear infinite',
}

export function Feedback({ quality, ratio, attempt, correct, fullLine, showDiff, hintUsed }: FeedbackProps) {
  const perfect = quality === 5
  const good = quality >= 3
  const showFullLine = fullLine && fullLine !== correct

  const diff = showDiff ? diffWords(attempt, correct) : null

  const borderColor = perfect
    ? 'border-accent/70'
    : good
      ? 'border-correct/50'
      : 'border-wrong/60'
  const bgColor = perfect ? '' : good ? 'bg-correct/10' : 'bg-wrong/15'
  const labelColor = perfect ? 'text-accent' : good ? 'text-correct' : 'text-wrong'
  // Extra left accent bar for wrong/missed answers so they're impossible to miss
  const accentBar = !good && !perfect ? 'border-l-4 border-l-wrong' : ''

  return (
    <section
      className={`mt-4 rounded-2xl border p-4 ${borderColor} ${bgColor} ${accentBar}`}
      style={perfect ? SHIMMER_STYLE : undefined}
      aria-live="polite"
    >
      {/* Header row */}
      <div className="flex items-baseline justify-between">
        <div>
          <p className={`uppercase tracking-[0.15em] ${labelColor} ${perfect ? 'text-base font-semibold' : good ? 'text-sm' : 'text-base font-semibold'}`}>
            {perfect ? '✦ ' : ''}{qualityLabel(quality)}
          </p>
          {hintUsed && (
            <p className="text-xs text-text-dim/60 mt-0.5">hint used · max. Passed</p>
          )}
        </div>
        <p className={`text-sm ${labelColor}`}>{Math.round(ratio * 100)}%</p>
      </div>

      {/* Word-level diff of the attempt (full-recall mode) */}
      {diff && !perfect && (
        <>
          <p className="mt-3 text-xs uppercase tracking-[0.15em] text-text-dim">Your answer</p>
          <p className="mt-1 flex flex-wrap gap-x-1 gap-y-0.5 text-lg leading-relaxed">
            {diff.attempt.length === 0 ? (
              <span className="text-text-dim italic">—</span>
            ) : (
              diff.attempt.map(({ word, matched }, i) => (
                <span key={i} className={matched ? 'text-correct' : 'text-wrong'}>
                  {word}
                </span>
              ))
            )}
          </p>
        </>
      )}

      {/* Correct answer */}
      {perfect && diff ? (
        // Perfect + diff: show all words in accent/green as celebration
        <p className="mt-3 flex flex-wrap gap-x-1 gap-y-0.5 text-lg leading-relaxed">
          {diff.correct.map(({ word }, i) => (
            <span key={i} className="text-correct">
              {word}
            </span>
          ))}
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs uppercase tracking-[0.15em] text-text-dim">Correct answer</p>
          {diff ? (
            <p className="mt-1 flex flex-wrap gap-x-1 gap-y-0.5 text-lg leading-relaxed">
              {diff.correct.map(({ word, matched }, i) => (
                <span key={i} className={matched ? 'text-correct' : 'text-text-dim line-through'}>
                  {word}
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-lg leading-relaxed text-text">{correct}</p>
          )}
        </>
      )}

      {/* Full line context (inline mode only) */}
      {showFullLine && (
        <>
          <p className="mt-2 text-xs uppercase tracking-[0.15em] text-text-dim">Full line</p>
          <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed text-text/60">
            {fullLine}
          </p>
        </>
      )}
    </section>
  )
}
