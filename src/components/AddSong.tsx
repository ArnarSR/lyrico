import { useEffect, useRef, useState } from 'react'
import type { VoicePart } from '../types'
import { VOICE_PARTS } from '../types'
import type { NewSongInput } from '../hooks/useStorage'
import { isSectionLabel } from '../lib/stanzas'
import {
  trackLyricsCheckFailed,
  trackLyricsChecked,
  trackLyricsFixesApplied,
  trackLyricsImported,
  trackLyricsSavedWithIssues,
} from '../lib/analytics'
import { checkLyrics, needsAttention, type LyricsOrigin, type LyricsReview } from '../lib/lyricsQc'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { LyricsCheckPanel } from './LyricsCheckPanel'
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

  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const ocrInputRef = useRef<HTMLInputElement>(null)

  // Claude quality check — see src/lib/lyricsQc.ts and api/check-lyrics.ts
  const checkEnabled = useFeatureFlag('ai-lyrics-check')
  const [review, setReview] = useState<LyricsReview | null>(null)
  const [checkMode, setCheckMode] = useState<'quick' | 'verify' | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [reviewHidden, setReviewHidden] = useState(false)
  const [checkNotice, setCheckNotice] = useState<string | null>(null)
  const checking = checkMode !== null
  const reviewStale = !!review && review.checkedLyrics !== lyrics.replace(/\r\n/g, '\n')

  const lineCount = lyrics
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isSectionLabel(l)).length

  const canSave = title.trim().length > 0 && lineCount > 0
  // The check has already run and flagged something: the next press saves anyway.
  const saveLabel = review && !reviewStale && needsAttention(review) ? 'Save anyway' : 'Save song'

  /**
   * Runs the check and returns the review, or null when it could not run. An
   * outage must never block a save, so failures are surfaced and swallowed.
   */
  async function runCheck(
    opts: { verify?: boolean; automatic: boolean; origin?: LyricsOrigin; sourceUrl?: string; text?: string },
  ): Promise<LyricsReview | null> {
    const verify = opts.verify === true
    // The text is passed in when the check follows an import, because the state
    // update that holds it has not been applied yet.
    const text = opts.text ?? lyrics
    setCheckMode(verify ? 'verify' : 'quick')
    setCheckError(null)
    setCheckNotice(null)
    setReviewHidden(false)
    try {
      const result = await checkLyrics({
        title: title.trim(),
        composer: composer.trim() || undefined,
        lyrics: text,
        verify,
        origin: opts.origin ?? 'typed',
        sourceUrl: opts.sourceUrl,
      })
      setReview(result)
      trackLyricsChecked(result.verdict, result.issues.length, result.verified, opts.automatic)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The check failed'
      setCheckError(message)
      trackLyricsCheckFailed(message)
      return null
    } finally {
      setCheckMode(null)
    }
  }

  function onAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(URL.createObjectURL(file))
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
      const url = importUrl.trim()
      setImportUrl('')
      trackLyricsImported()
      if (checkEnabled) void runCheck({ automatic: true, origin: 'url', sourceUrl: url, text })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function handleOcrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setOcrFile(file)
    setOcrError(null)
  }

  async function handleOcrExtract() {
    if (!ocrFile) return
    setOcrBusy(true)
    setOcrError(null)
    try {
      const form = new FormData()
      form.append('file', ocrFile)
      const res = await fetch('/api/extract-lyrics-ocr', { method: 'POST', body: form })
      const data = await res.json() as { lyrics?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
      setLyrics(data.lyrics ?? '')
      setOcrFile(null)
      if (ocrInputRef.current) ocrInputRef.current.value = ''
      if (checkEnabled && data.lyrics) void runCheck({ automatic: true, origin: 'ocr', text: data.lyrics })
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setOcrBusy(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave || checking) return

    // First save of text that has not been checked: check it, and stop here if
    // the singer should look at something. A second press saves regardless.
    let current = review && !reviewStale ? review : null
    if (checkEnabled && !current) {
      current = await runCheck({ automatic: true })
      if (current && needsAttention(current)) return
    }
    if (current && needsAttention(current)) {
      trackLyricsSavedWithIssues(current.verdict, current.issues.length)
    }

    save()
  }

  function save() {
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
          {/* URL import */}
          <div className="mb-2 flex gap-2">
            <input
              type="text"
              inputMode="url"
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

          {/* Sheet music OCR */}
          <div className="mb-2 rounded-xl border border-border bg-bg-soft px-3 py-3">
            <p className="mb-2 text-xs text-text-dim">
              Scan sheet music — upload an image or PDF and the lyrics will be extracted automatically.
            </p>
            <div className="flex gap-2">
              <label className="flex flex-1 cursor-pointer items-center justify-between rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-dim hover:border-accent-soft">
                <span className="truncate">{ocrFile ? ocrFile.name : 'Choose image or PDF…'}</span>
                {ocrFile && <span className="ml-2 shrink-0 text-xs text-accent">✓</span>}
                <input
                  ref={ocrInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleOcrFileChange}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                disabled={!ocrFile || ocrBusy}
                onClick={handleOcrExtract}
                className="shrink-0 rounded-xl border border-accent bg-accent/15 px-3 py-2 text-sm text-accent hover:bg-accent/25 disabled:opacity-40"
              >
                {ocrBusy ? 'Reading…' : 'Extract'}
              </button>
            </div>
            {ocrError && <p className="mt-1 text-xs text-wrong">{ocrError}</p>}
          </div>

          {/* Claude quality check */}
          {checkEnabled && (
            <>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  disabled={lineCount === 0 || checking}
                  onClick={() => void runCheck({ automatic: false })}
                  className="flex-1 rounded-xl border border-border bg-bg-soft px-3 py-2 text-sm text-text-dim hover:border-accent-soft hover:text-text disabled:opacity-40"
                >
                  {checkMode === 'quick' ? 'Checking…' : 'Quality check'}
                </button>
                <button
                  type="button"
                  disabled={lineCount === 0 || checking}
                  onClick={() => void runCheck({ verify: true, automatic: false })}
                  className="flex-1 rounded-xl border border-border bg-bg-soft px-3 py-2 text-sm text-text-dim hover:border-accent-soft hover:text-text disabled:opacity-40"
                  title="Searches the web and compares your text against real sources. Slower."
                >
                  {checkMode === 'verify' ? 'Searching…' : 'Check against sources'}
                </button>
              </div>
              {checkError && <p className="mb-1 text-xs text-wrong">{checkError}</p>}
              {checkNotice && <p className="mb-1 text-xs text-correct">{checkNotice}</p>}
              {review && !reviewHidden && (
                <LyricsCheckPanel
                  review={review}
                  stale={reviewStale}
                  onApplyFixes={(cleaned) => {
                    setLyrics(cleaned)
                    trackLyricsFixesApplied(review.issues.length)
                    // The text is no longer the one that was reviewed; drop the
                    // report rather than leave stale line numbers on screen.
                    setReview(null)
                    setCheckNotice('Fixes applied — check again to confirm.')
                  }}
                  onApplyTitle={setTitle}
                  onApplyComposer={setComposer}
                  onDismiss={() => setReviewHidden(true)}
                />
              )}
            </>
          )}

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
            disabled={!canSave || checking}
            className="flex-[2] rounded-full border border-accent bg-accent/15 py-3 text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            {checking ? 'Checking lyrics…' : saveLabel}
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
