import { useEffect, useRef, useState } from 'react'
import type { VoicePart } from '../types'
import { VOICE_PARTS } from '../types'
import type { NewSongInput } from '../hooks/useStorage'
import { isSectionLabel } from '../lib/stanzas'
import { trackLyricsImported } from '../lib/analytics'
import { Header, Shell } from './Shell'

const DRAFT_KEY = 'lyrico_add_song_draft'

interface Draft {
  title: string
  composer: string
  voicePart: VoicePart | ''
  lyrics: string
  concertDate: string
  isPublic: boolean
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) as Draft : null
  } catch { return null }
}

function saveDraft(d: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* ignore */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}

interface AddSongProps {
  onCancel: () => void
  onSave: (input: NewSongInput) => void
}

export function AddSong({ onCancel, onSave }: AddSongProps) {
  const draft = loadDraft()
  const [title, setTitle] = useState(draft?.title ?? '')
  const [composer, setComposer] = useState(draft?.composer ?? '')
  const [voicePart, setVoicePart] = useState<VoicePart | ''>(draft?.voicePart ?? '')
  const [lyrics, setLyrics] = useState(draft?.lyrics ?? '')
  const [concertDate, setConcertDate] = useState(draft?.concertDate ?? '')
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [audioName, setAudioName] = useState<string | undefined>()
  const [isPublic, setIsPublic] = useState(draft?.isPublic ?? false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [showRestoredBanner, setShowRestoredBanner] = useState(!!draft && (!!draft.title || !!draft.lyrics))
  const lyricsRef = useRef<HTMLTextAreaElement>(null)

  // Auto-save draft whenever key fields change
  useEffect(() => {
    saveDraft({ title, composer, voicePart, lyrics, concertDate, isPublic })
  }, [title, composer, voicePart, lyrics, concertDate, isPublic])

  // Auto-resize lyrics textarea whenever content changes
  useEffect(() => {
    const el = lyricsRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [lyrics])

  const lineCount = lyrics
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isSectionLabel(l)).length

  const canSave = title.trim().length > 0 && lineCount > 0

  function onAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    const url = URL.createObjectURL(file)
    setAudioUrl(url)
    setAudioName(file.name)
  }

  async function handleImport() {
    if (!importUrl.trim()) return
    setImporting(true)
    setImportError(null)
    try {
      const res = await fetch(`/api/fetch-lyrics?url=${encodeURIComponent(importUrl.trim())}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { lyrics: text, error } = await res.json() as { lyrics?: string; error?: string }
      if (error || !text) throw new Error(error ?? 'No text returned')
      setLyrics(text)
      setImportUrl('')
      trackLyricsImported()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    clearDraft()
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

  function handleCancel() {
    // Only clear draft if there's nothing worth keeping
    if (!title.trim() && !lyrics.trim()) clearDraft()
    onCancel()
  }

  return (
    <Shell>
      <Header
        title="New song"
        subtitle={lineCount > 0 ? `${lineCount} lines` : 'Paste lyrics below'}
        right={
          <button type="button" onClick={handleCancel} className="text-sm text-text-dim hover:text-text">
            Cancel
          </button>
        }
      />

      {showRestoredBanner && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          <span>✦ Draft restored</span>
          <button
            type="button"
            onClick={() => { clearDraft(); setTitle(''); setComposer(''); setVoicePart(''); setLyrics(''); setConcertDate(''); setIsPublic(false); setShowRestoredBanner(false) }}
            className="ml-4 text-xs text-accent/70 hover:text-accent"
          >
            Discard
          </button>
        </div>
      )}

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
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </Field>

        <Field label="Lyrics" hint="One line per row — each line becomes its own flashcard.">
          {/* URL import row */}
          <div className="mb-2 flex gap-2">
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Import from URL…"
              className={`${inputCx} flex-1 text-sm`}
            />
            <button
              type="button"
              disabled={!importUrl.trim() || importing}
              onClick={handleImport}
              className="shrink-0 rounded-xl border border-accent bg-accent/15 px-3 py-2 text-sm text-accent hover:bg-accent/25 disabled:opacity-40"
            >
              {importing ? '…' : 'Import'}
            </button>
          </div>
          {importError && <p className="mb-1 text-xs text-wrong">{importError}</p>}
          <textarea
            ref={lyricsRef}
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder={'Ave verum corpus natum\nDe Maria Virgine...'}
            className={`${inputCx} resize-none leading-relaxed`}
            style={{ minHeight: 'calc(100dvh - 480px)', overflow: 'hidden' }}
          />
        </Field>

        <Field label="Audio (optional)">
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-bg-soft px-4 py-3 text-sm text-text-dim hover:border-accent-soft">
            <span className="truncate">{audioName ?? 'Pick an audio file'}</span>
            <span className="shrink-0 text-accent">Browse</span>
            <input type="file" accept="audio/*" onChange={onAudioChange} className="hidden" />
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
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isPublic ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </div>
        </label>

        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={handleCancel}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-[0.15em] text-text-dim">{label}</span>
      {children}
      {hint && <span className="text-xs text-text-dim/80">{hint}</span>}
    </label>
  )
}
