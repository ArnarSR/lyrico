import { useEffect, useRef, useState } from 'react'
import type { Song } from '../types'
import { getStanzaStarts } from '../lib/stanzas'
import { scoreAnswer } from '../lib/scoring'
import { Feedback } from './Feedback'
import { Header, IconButton, Shell } from './Shell'

interface StanzaSessionProps {
  song: Song
  onExit: () => void
}

export function StanzaSession({ song, onExit }: StanzaSessionProps) {
  const stanzaStarts = getStanzaStarts(song.lyrics)

  const [idx, setIdx] = useState(0)
  const [attempt, setAttempt] = useState('')
  const [hintCount, setHintCount] = useState(0)
  const [checked, setChecked] = useState<{
    quality: number
    ratio: number
    attempt: string
    hintUsed: boolean
  } | null>(null)
  const [results, setResults] = useState<number[]>([]) // quality per stanza

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (checked) nextButtonRef.current?.focus()
    else {
      const id = requestAnimationFrame(() => textareaRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [idx, checked])

  if (stanzaStarts.length < 2) {
    return (
      <Shell>
        <Header
          title={song.title}
          subtitle="Stanza starts"
          left={<BackButton onClick={onExit} />}
        />
        <p className="mt-8 text-center text-text-dim">
          This song has only one stanza — add blank lines between stanzas to use this drill.
        </p>
      </Shell>
    )
  }

  // Results screen
  if (idx >= stanzaStarts.length) {
    const passed = results.filter((q) => q >= 3).length
    return (
      <Shell>
        <Header
          title={song.title}
          subtitle="Stanza starts"
          left={<BackButton onClick={onExit} />}
        />
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <p className="text-5xl text-accent">
            {passed}/{stanzaStarts.length}
          </p>
          <p className="text-text-dim">stanza openings recalled</p>
          <div className="mt-2 flex gap-2">
            {results.map((q, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${q >= 3 ? 'bg-correct' : 'bg-wrong'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setIdx(0); setResults([]); setAttempt(''); setHintCount(0); setChecked(null) }}
            className="mt-4 rounded-full border border-accent bg-accent/15 px-6 py-3 text-accent hover:bg-accent/25"
          >
            Try again
          </button>
        </div>
      </Shell>
    )
  }

  const lineIndex = stanzaStarts[idx]
  const card = song.cards.find((c) => c.lineIndex === lineIndex)
  if (!card) return null

  // Prompt: last line of the previous stanza, or nothing for the first.
  const prevCard = idx > 0
    ? song.cards.find((c) => c.lineIndex === stanzaStarts[idx] - 1)
    : null

  const fullRecallWords = card ? card.text.split(/\s+/).filter(Boolean) : []
  const hintWords = fullRecallWords.slice(0, hintCount)
  const canHint = !checked && hintCount < fullRecallWords.length

  function onCheck() {
    if (!card || checked || attempt.trim().length === 0) return
    const { quality, ratio } = scoreAnswer(attempt, card.text)
    const cappedQuality = hintCount > 0 ? Math.min(quality, 3) : quality
    setChecked({ quality: cappedQuality, ratio, attempt, hintUsed: hintCount > 0 })
  }

  function onNext() {
    if (!checked) return
    setResults((r) => [...r, checked.quality])
    setIdx((i) => i + 1)
    setAttempt('')
    setHintCount(0)
    setChecked(null)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (checked) onNext()
      else onCheck()
    }
  }

  return (
    <Shell>
      <Header
        title={song.title}
        subtitle={`Stanza starts · ${idx + 1} / ${stanzaStarts.length}`}
        left={<BackButton onClick={onExit} />}
      />

      <section className="mt-8 rounded-2xl border border-border bg-bg-soft p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-text-dim">
          Stanza {idx + 1}
        </p>
        {prevCard ? (
          <p className="mt-2 whitespace-pre-wrap text-xl leading-relaxed text-text-dim italic">
            {prevCard.text}
          </p>
        ) : (
          <p className="mt-2 text-xl leading-relaxed text-text-dim italic">
            (start of song)
          </p>
        )}
        {hintWords.length > 0 && (
          <p className="mt-2 border-t border-border/50 pt-2 text-base text-accent-soft/80 italic">
            {hintWords.join(' ')}{hintCount < fullRecallWords.length ? ' …' : ''}
          </p>
        )}
      </section>

      <section className="mt-4">
        <textarea
          ref={textareaRef}
          value={checked ? checked.attempt : attempt}
          onChange={(e) => setAttempt(e.target.value)}
          onKeyDown={handleKey}
          disabled={!!checked}
          rows={3}
          placeholder="Type the opening line…"
          className="w-full resize-y rounded-2xl border border-border bg-bg-soft px-4 py-3 text-lg leading-relaxed text-text placeholder:text-text-dim/60 focus:border-accent disabled:opacity-70"
        />
      </section>

      {canHint && (
        <button
          type="button"
          onClick={() => setHintCount((c) => c + 1)}
          className="mt-1.5 block w-full text-right text-sm text-text-dim/60 hover:text-text-dim"
        >
          {hintCount === 0 ? 'Hint' : `${hintCount} / ${fullRecallWords.length} words revealed`}
        </button>
      )}

      {checked && (
        <Feedback
          quality={checked.quality}
          ratio={checked.ratio}
          attempt={checked.attempt}
          correct={card.text}
          showDiff
          hintUsed={checked.hintUsed}
        />
      )}

      <div className="mt-5">
        {!checked ? (
          <button
            type="button"
            onClick={onCheck}
            disabled={attempt.trim().length === 0}
            className="w-full rounded-full border border-accent bg-accent/15 py-3 text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            Check
          </button>
        ) : (
          <button
            ref={nextButtonRef}
            type="button"
            onClick={onNext}
            className="w-full rounded-full border border-accent bg-accent py-3 text-bg hover:brightness-110"
          >
            {idx + 1 < stanzaStarts.length ? 'Next stanza' : 'See results'}
          </button>
        )}
      </div>
    </Shell>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Back" onClick={onClick}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </IconButton>
  )
}
