import { useState } from 'react'
import type { VoicePart } from '../types'
import { VOICE_PARTS } from '../types'
import type { NewSongInput } from '../hooks/useStorage'
import { isSectionLabel } from '../lib/stanzas'
import { Header, Shell } from './Shell'

interface AddSongProps {
  onCancel: () => void
  onSave: (input: NewSongInput) => void
}

export function AddSong({ onCancel, onSave }: AddSongProps) {
  const [title, setTitle] = useState('')
  const [composer, setComposer] = useState('')
  const [voicePart, setVoicePart] = useState<VoicePart | ''>('')
  const [lyrics, setLyrics] = useState('')
  const [concertDate, setConcertDate] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [audioName, setAudioName] = useState<string | undefined>()
  const [isPublic, setIsPublic] = useState(false)

  const lineCount = lyrics
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isSectionLabel(l)).length

  const canSave = title.trim().length > 0 && lineCount > 0

  function onAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Revoke any previously-created URL to avoid leaks on repeated picks.
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    const url = URL.createObjectURL(file)
    setAudioUrl(url)
    setAudioName(file.name)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    onSave({
      title: title.trim(),
      composer: composer.trim() || undefined,
      voicePart: voicePart || undefined,
      lyrics,
      audioUrl,
      audioName,
      concertDate: concertDate ? new Date(concertDate).getTime() : undefined,
      isPublic,
    })
  }

  return (
    <Shell>
      <Header
        title="New song"
        subtitle={lineCount > 0 ? `${lineCount} lines` : 'Paste lyrics below'}
        right={
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-text-dim hover:text-text"
          >
            Cancel
          </button>
        }
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Ave Verum Corpus"
            className={inputCx}
            autoFocus
          />
        </Field>

        <Field label="Composer">
          <input
            type="text"
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder="Optional"
            className={inputCx}
          />
        </Field>

        <Field label="Voice part">
          <select
            value={voicePart}
            onChange={(e) => setVoicePart(e.target.value as VoicePart | '')}
            className={`${inputCx} appearance-none pr-8`}
          >
            <option value="">—</option>
            {VOICE_PARTS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Lyrics"
          hint="One line per row — each line becomes its own flashcard."
        >
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={10}
            placeholder={'Ave verum corpus natum\nDe Maria Virgine...'}
            className={`${inputCx} resize-y leading-relaxed`}
          />
        </Field>

        <Field label="Audio (optional)">
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-bg-soft px-4 py-3 text-sm text-text-dim hover:border-accent-soft">
            <span className="truncate">
              {audioName ?? 'Pick an audio file'}
            </span>
            <span className="shrink-0 text-accent">Browse</span>
            <input
              type="file"
              accept="audio/*"
              onChange={onAudioChange}
              className="hidden"
            />
          </label>
        </Field>

        <Field label="Concert date (optional)">
          <input
            type="date"
            value={concertDate}
            onChange={(e) => setConcertDate(e.target.value)}
            className={inputCx}
          />
        </Field>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-bg-soft px-4 py-3">
          <div>
            <p className="text-sm text-text">Share with community</p>
            <p className="text-xs text-text-dim">Others can find and add this song to their library</p>
          </div>
          <div
            onClick={() => setIsPublic((v) => !v)}
            className={`relative h-6 w-11 rounded-full transition-colors ${isPublic ? 'bg-accent' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isPublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </label>

        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-border bg-bg-soft py-3 text-text-dim hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="flex-[2] rounded-full border border-accent bg-accent/15 py-3 text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            Save song
          </button>
        </div>
      </form>
    </Shell>
  )
}

const inputCx =
  'w-full rounded-xl border border-border bg-bg-soft px-4 py-3 text-base text-text placeholder:text-text-dim/60 focus:border-accent'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-[0.15em] text-text-dim">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-text-dim/80">{hint}</span>}
    </label>
  )
}
