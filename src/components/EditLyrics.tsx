import { useEffect, useMemo, useRef, useState } from 'react'
import type { Song } from '../types'
import { Header, IconButton, Shell } from './Shell'
import { SaveQaDialog } from './SaveQaDialog'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import {
  canMoveWordToNext,
  canMoveWordToPrev,
  canSplitAtWord,
  moveWordToNextLine,
  moveWordToPrevLine,
  splitLineAtWord,
  splitWords,
  type EditableLine,
  type LineEditResult,
} from '../lib/lineEdit'
import { describePrepare, prepareLyrics } from '../lib/prepareLyrics'
import { buildSaveQa, flaggedRows } from '../lib/saveQa'
import { attachTranslations, parseLyrics, swapTranslationDirection } from '../lib/translation'
import { wordCount, DEFAULT_PHRASE_OPTIONS } from '../lib/phrases'
import {
  trackLineSplit,
  trackLinesRedetectUndone,
  trackLinesRedetected,
  trackSaveQaResolved,
  trackSaveQaShown,
  trackTranslationSwapped,
  trackWordMoved,
} from '../lib/analytics'

export interface EditedLine {
  id?: string
  text: string
  translation?: string
}

interface EditLyricsProps {
  song: Song
  onSave: (lines: EditedLine[]) => Promise<void>
  onCancel: () => void
}

interface Row {
  key: string    // stable React key
  id?: string    // card id if this line existed before
  text: string
  translation?: string
}

let nextKey = 0
function genKey() { return String(nextKey++) }

function editDraftKey(songId: string) { return `lyrico_edit_draft_${songId}` }

function loadEditDraft(songId: string): EditedLine[] | null {
  try {
    const raw = localStorage.getItem(editDraftKey(songId))
    return raw ? JSON.parse(raw) as EditedLine[] : null
  } catch { return null }
}

export function EditLyrics({ song, onSave, onCancel }: EditLyricsProps) {
  const wordToolsEnabled = useFeatureFlag('word-line-tools')
  const splitEnabled = useFeatureFlag('line-split')
  const redetectEnabled = useFeatureFlag('smart-line-detection')
  const qaEnabled = useFeatureFlag('save-qa-checklist')

  const draft = loadEditDraft(song.id)
  const [rows, setRows] = useState<Row[]>(() => {
    if (!draft) return song.cards.map((c) => ({ key: genKey(), id: c.id, text: c.text, translation: c.translation }))
    // A draft written before translations existed carries only id and text, so
    // the translation is taken from the card the row still points at.
    const byId = new Map(song.cards.map((c) => [c.id, c]))
    return draft.map((line) => ({
      key: genKey(),
      id: line.id,
      text: line.text,
      translation: line.translation ?? (line.id ? byId.get(line.id)?.translation : undefined),
    }))
  })
  const [showRestoredBanner, setShowRestoredBanner] = useState(!!draft)
  const [saving, setSaving] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const inputRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())

  // The word whose move/split buttons are open: one at a time, so the row does
  // not turn into a wall of arrows.
  const [selectedWord, setSelectedWord] = useState<{ key: string; index: number } | null>(null)
  // Set after a re-detect pass so it can be undone in one press.
  const [redetected, setRedetected] = useState<{ rows: Row[]; summary: string } | null>(null)
  const [qaOpen, setQaOpen] = useState(false)

  // Auto-save edit draft whenever rows change
  useEffect(() => {
    try {
      localStorage.setItem(
        editDraftKey(song.id),
        JSON.stringify(rows.map(({ id, text, translation }) => ({ id, text, translation }))),
      )
    } catch { /* ignore */ }
  }, [rows, song.id])

  useEffect(() => {
    if (showPaste) pasteRef.current?.focus()
  }, [showPaste])

  // Focus the row whose key matches focusKey
  useEffect(() => {
    if (!focusKey) return
    const el = inputRefs.current.get(focusKey)
    if (el) {
      el.focus()
      // Move cursor to end
      el.setSelectionRange(el.value.length, el.value.length)
    }
    setFocusKey(null)
  }, [focusKey, rows])

  const editedLines = useMemo<EditedLine[]>(
    () => rows.filter((r) => r.text.trim().length > 0)
      .map(({ id, text, translation }) => ({ id, text: text.trim(), translation: translation?.trim() || undefined })),
    [rows],
  )

  const qaReport = useMemo(
    () => buildSaveQa({
      title: song.title,
      lyrics: attachTranslations(editedLines),
      includeMetadata: false,
    }),
    [editedLines, song.title],
  )
  const flagged = useMemo(() => new Set(flaggedRows(qaReport)), [qaReport])

  function updateText(key: string, text: string) {
    setRows((r) => r.map((row) => row.key === key ? { ...row, text } : row))
    setSelectedWord(null)
  }

  function updateTranslation(key: string, translation: string) {
    setRows((r) => r.map((row) => row.key === key ? { ...row, translation } : row))
  }

  function deleteRow(key: string) {
    setSelectedWord(null)
    setRows((r) => {
      const next = r.filter((row) => row.key !== key)
      return next.length > 0 ? next : r // never allow empty
    })
  }

  function appendPasted() {
    const newRows: Row[] = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((text) => ({ key: genKey(), text }))
    if (newRows.length === 0) return
    setRows((r) => [...r, ...newRows])
    setPasteText('')
    setShowPaste(false)
    // Focus the first newly added row
    setFocusKey(newRows[0].key)
  }

  function insertAfter(afterKey: string | null) {
    const newRow: Row = { key: genKey(), text: '' }
    setRows((r) => {
      if (afterKey === null) return [newRow, ...r]
      const idx = r.findIndex((row) => row.key === afterKey)
      const next = [...r]
      next.splice(idx + 1, 0, newRow)
      return next
    })
    setFocusKey(newRow.key)
  }

  // ── Word moves and splits ──────────────────────────────────────────────────

  /**
   * Turns a line-edit result back into rows, keeping each surviving row's React
   * key and card id — a row that keeps its id keeps its SM-2 progress, so the
   * mapping is not cosmetic.
   */
  function applyLineEdit(result: LineEditResult) {
    setRows((prev) => {
      const out: Row[] = []
      let old = 0
      for (let i = 0; i < result.lines.length; i++) {
        const line = result.lines[i]
        if (result.inserted === i) {
          out.push({ key: genKey(), text: line.text, translation: line.translation })
          continue
        }
        if (result.removed === old) old++
        const previous = prev[old]
        out.push({
          key: previous?.key ?? genKey(),
          id: previous?.id,
          text: line.text,
          translation: line.translation,
        })
        old++
      }
      return out
    })
    setSelectedWord(null)
    setRedetected(null)
  }

  const editableLines = (): EditableLine[] =>
    rows.map(({ text, translation }) => ({ text, translation }))

  function moveWord(lineIndex: number, wordIndex: number, direction: 'prev' | 'next') {
    const lines = editableLines()
    const result = direction === 'prev'
      ? moveWordToPrevLine(lines, lineIndex, wordIndex)
      : moveWordToNextLine(lines, lineIndex, wordIndex)
    if (!result) return
    applyLineEdit(result)
    trackWordMoved(direction)
  }

  function splitHere(lineIndex: number, wordIndex: number) {
    const result = splitLineAtWord(editableLines(), lineIndex, wordIndex)
    if (!result) return
    applyLineEdit(result)
    trackLineSplit()
  }

  // ── Re-detect lines ───────────────────────────────────────────────────────

  function redetectLines() {
    const before = rows
    const result = prepareLyrics(attachTranslations(editedLines))
    if (!result.changed) {
      setRedetected({ rows: before, summary: 'Nothing to change — the lines already look right.' })
      return
    }
    setRows(rowsFromLyrics(result.lyrics, before))
    setSelectedWord(null)
    setRedetected({ rows: before, summary: describePrepare(result) })
    trackLinesRedetected('edit', result.phrases.merged, result.phrases.split, result.translation.marked)
  }

  function undoRedetect() {
    if (!redetected) return
    setRows(redetected.rows)
    setRedetected(null)
    trackLinesRedetectUndone('edit')
  }

  function swapTranslations() {
    const swapped = swapTranslationDirection(attachTranslations(editedLines))
    setRows(rowsFromLyrics(swapped, rows))
    setSelectedWord(null)
    trackTranslationSwapped('edit')
  }

  // ── Saving ────────────────────────────────────────────────────────────────

  function requestSave() {
    if (editedLines.length === 0) return
    if (!qaEnabled) { void commitSave(); return }
    trackSaveQaShown('edit', qaReport.lineCount, qaReport.checks.filter((c) => c.status === 'warn').length)
    setQaOpen(true)
  }

  async function commitSave() {
    if (editedLines.length === 0) return
    if (qaOpen) {
      trackSaveQaResolved('edit', 'confirmed', qaReport.checks.filter((c) => c.status === 'warn').length)
    }
    setSaving(true)
    try {
      await onSave(editedLines)
      try { localStorage.removeItem(editDraftKey(song.id)) } catch { /* ignore */ }
    } finally {
      setSaving(false)
      setQaOpen(false)
    }
  }

  // Auto-resize textarea
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const nonEmptyRows = rows.filter((r) => r.text.trim().length > 0)
  const isDirty = nonEmptyRows.some((r, i) => {
    const orig = song.cards[i]
    return !orig || r.id !== orig.id || r.text !== orig.text || (r.translation ?? undefined) !== orig.translation
  }) || nonEmptyRows.length !== song.cards.length

  const hasTranslations = rows.some((r) => r.translation?.trim())

  return (
    <Shell>
      <Header
        title="Edit lyrics"
        subtitle={song.title}
        left={
          <IconButton label="Cancel" onClick={onCancel}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </IconButton>
        }
        right={
          <button
            type="button"
            onClick={requestSave}
            disabled={saving || !isDirty}
            className="rounded-full border border-accent bg-accent/15 px-4 py-1.5 text-sm text-accent disabled:opacity-40 hover:bg-accent/25"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        }
      />

      {showRestoredBanner && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          <span>✦ Unsaved draft restored</span>
          <button
            type="button"
            onClick={() => {
              try { localStorage.removeItem(editDraftKey(song.id)) } catch { /* ignore */ }
              setRows(song.cards.map((c) => ({ key: genKey(), id: c.id, text: c.text, translation: c.translation })))
              setShowRestoredBanner(false)
            }}
            className="ml-4 text-xs text-accent/70 hover:text-accent"
          >
            Discard
          </button>
        </div>
      )}

      {redetected && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          <span className="min-w-0">{redetected.summary}</span>
          <button
            type="button"
            onClick={undoRedetect}
            className="shrink-0 text-xs text-accent/70 hover:text-accent"
          >
            Undo
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <p className="mb-2 text-xs text-text-dim">
          {rows.length} line{rows.length !== 1 ? 's' : ''} · tap a line to edit
          {wordToolsEnabled || splitEnabled ? ' · tap a word to move or split' : ''}
          {' · SM‑2 progress preserved when text is unchanged'}
        </p>
      )}

      {rows.length > 0 && (redetectEnabled || (hasTranslations && wordToolsEnabled)) && (
        <div className="mb-3 flex gap-2">
          {redetectEnabled && (
            <button
              type="button"
              onClick={redetectLines}
              title="Rejoin split syllables, drop score markings and re-phrase the lines"
              className="flex-1 rounded-xl border border-border bg-bg-soft px-3 py-2 text-xs text-text-dim hover:border-accent-soft hover:text-text"
            >
              Re-detect lines
            </button>
          )}
          {hasTranslations && (
            <button
              type="button"
              onClick={swapTranslations}
              title="Use the translation as the sung text instead"
              className="flex-1 rounded-xl border border-border bg-bg-soft px-3 py-2 text-xs text-text-dim hover:border-accent-soft hover:text-text"
            >
              Swap translation
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && !showPaste && (
        <div className="mt-8 flex flex-col items-center gap-4">
          <p className="text-text-dim">This song has no lines yet.</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => insertAfter(null)}
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm text-text-dim hover:border-accent/50 hover:text-accent"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add line
            </button>
            <button
              type="button"
              onClick={() => setShowPaste(true)}
              className="flex items-center gap-2 rounded-full border border-accent bg-accent/15 px-4 py-2.5 text-sm text-accent hover:bg-accent/25"
            >
              <PasteIcon />
              Paste lyrics
            </button>
          </div>
        </div>
      )}

      {/* Insert-before-first button (only visible when there are already rows) */}
      {rows.length > 0 && <InsertButton onClick={() => insertAfter(null)} />}

      <ol className="flex flex-col">
        {rows.map((row, i) => {
          const words = splitWords(row.text)
          const isFlagged = flagged.has(i + 1)
          const selected = selectedWord?.key === row.key ? selectedWord.index : null

          return (
            <li key={row.key}>
              <div className="flex items-start gap-2 py-1">
                {/* Line number */}
                <span className={`mt-2.5 w-7 shrink-0 text-right text-xs select-none ${isFlagged ? 'text-wrong' : 'text-text-dim/40'}`}>
                  {i + 1}
                </span>

                {/* Editable text */}
                <div className="min-w-0 flex-1">
                  <textarea
                    ref={(el) => {
                      if (el) {
                        inputRefs.current.set(row.key, el)
                        autoResize(el)
                      } else {
                        inputRefs.current.delete(row.key)
                      }
                    }}
                    value={row.text}
                    rows={1}
                    onChange={(e) => {
                      updateText(row.key, e.target.value)
                      autoResize(e.target)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        insertAfter(row.key)
                      }
                      if (e.key === 'Backspace' && row.text === '' && rows.length > 1) {
                        e.preventDefault()
                        // Focus the row above before deleting
                        const prev = rows[i - 1]
                        if (prev) setFocusKey(prev.key)
                        deleteRow(row.key)
                      }
                    }}
                    placeholder="Line text…"
                    className={`w-full resize-none overflow-hidden rounded-xl border bg-bg px-3 py-2 text-sm leading-relaxed text-text placeholder:text-text-dim/40 focus:border-accent focus:outline-none ${isFlagged ? 'border-wrong/50' : 'border-border'}`}
                  />

                  {/* Translation of this line — kept with it, never drilled. */}
                  {row.translation !== undefined && (
                    <div className="mt-1 flex items-start gap-1.5">
                      <span aria-hidden className="mt-1.5 shrink-0 text-xs text-text-dim/50">↳</span>
                      <input
                        value={row.translation}
                        onChange={(e) => updateTranslation(row.key, e.target.value)}
                        aria-label={`Translation of line ${i + 1}`}
                        placeholder="Translation…"
                        className="min-w-0 flex-1 rounded-lg border border-border/60 bg-bg px-2.5 py-1.5 text-xs italic leading-relaxed text-text-dim placeholder:text-text-dim/40 focus:border-accent focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Word tools */}
                  {(wordToolsEnabled || splitEnabled) && words.length > 0 && (
                    <WordTools
                      words={words}
                      selected={selected}
                      tooLong={wordCount(row.text) > DEFAULT_PHRASE_OPTIONS.maxWords}
                      canPrev={wordToolsEnabled && canMoveWordToPrev(editableLines(), i)}
                      canNext={wordToolsEnabled && canMoveWordToNext(editableLines(), i)}
                      canSplit={splitEnabled && selected !== null && canSplitAtWord(editableLines(), i, selected)}
                      onSelect={(index) =>
                        setSelectedWord((prev) =>
                          prev?.key === row.key && prev.index === index ? null : { key: row.key, index })
                      }
                      onMovePrev={() => selected !== null && moveWord(i, selected, 'prev')}
                      onMoveNext={() => selected !== null && moveWord(i, selected, 'next')}
                      onSplit={() => selected !== null && splitHere(i, selected)}
                    />
                  )}
                </div>

                {/* Delete row */}
                <button
                  type="button"
                  onClick={() => deleteRow(row.key)}
                  disabled={rows.length <= 1}
                  title="Delete line"
                  className="mt-1.5 shrink-0 rounded-lg p-1.5 text-text-dim/40 hover:bg-wrong/10 hover:text-wrong disabled:opacity-20"
                >
                  <TrashIcon />
                </button>
              </div>

              {/* Insert-after button */}
              <InsertButton onClick={() => insertAfter(row.key)} />
            </li>
          )
        })}
      </ol>

      {/* Paste panel */}
      {showPaste ? (
        <div className="mt-4 rounded-2xl border border-border bg-bg-soft p-4">
          <p className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Paste lyrics</p>
          <textarea
            ref={pasteRef}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Paste a verse or the full song here…\nOne line per row."}
            className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-text placeholder:text-text-dim/40 focus:border-accent focus:outline-none"
            style={{ height: 'calc(100dvh - 260px)', minHeight: '160px' }}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => { setShowPaste(false); setPasteText('') }}
              className="flex-1 rounded-xl border border-border py-2 text-sm text-text-dim hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={appendPasted}
              disabled={pasteText.trim().length === 0}
              className="flex-[2] rounded-xl border border-accent/30 bg-accent/15 py-2 text-sm text-accent disabled:opacity-40 hover:bg-accent/25"
            >
              {rows.length === 0 ? 'Set lyrics' : 'Append lines'}
            </button>
          </div>
        </div>
      ) : (
        rows.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPaste(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm text-text-dim hover:border-accent/50 hover:text-accent"
          >
            <PasteIcon />
            Paste verse or lyrics
          </button>
        )
      )}

      {/* Bottom save for long songs */}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-full border border-border py-2.5 text-sm text-text-dim hover:text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={requestSave}
          disabled={saving || !isDirty}
          className="flex-[2] rounded-full border border-accent bg-accent/15 py-2.5 text-sm text-accent disabled:opacity-40 hover:bg-accent/25"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {qaOpen && (
        <SaveQaDialog
          report={qaReport}
          songTitle={song.title}
          saving={saving}
          confirmLabel="Confirm and save changes"
          onConfirm={() => void commitSave()}
          onCancel={() => {
            trackSaveQaResolved('edit', 'cancelled', qaReport.checks.filter((c) => c.status === 'warn').length)
            setQaOpen(false)
          }}
          onSwapTranslation={() => { swapTranslations(); setQaOpen(false) }}
        />
      )}
    </Shell>
  )
}

/**
 * Rebuilds rows from raw lyrics, reusing the card id of any row whose text came
 * through unchanged so its progress survives. A merged or split line is new text
 * and gets a new card — which is the honest outcome: it is a different line.
 */
function rowsFromLyrics(lyrics: string, previous: Row[]): Row[] {
  const unclaimed = new Map<string, Row[]>()
  for (const row of previous) {
    const key = row.text.trim()
    if (!unclaimed.has(key)) unclaimed.set(key, [])
    unclaimed.get(key)!.push(row)
  }

  return parseLyrics(lyrics)
    .filter((line) => line.kind === 'lyric')
    .map((line) => {
      const match = unclaimed.get(line.text)?.shift()
      return {
        key: match?.key ?? genKey(),
        id: match?.id,
        text: line.text,
        translation: line.translation,
      }
    })
}

/**
 * The word row under a line: every word is a button, and the one that is tapped
 * opens the three operations that fix a bad line break without cut and paste.
 */
function WordTools({
  words,
  selected,
  tooLong,
  canPrev,
  canNext,
  canSplit,
  onSelect,
  onMovePrev,
  onMoveNext,
  onSplit,
}: {
  words: string[]
  selected: number | null
  tooLong: boolean
  canPrev: boolean
  canNext: boolean
  canSplit: boolean
  onSelect: (index: number) => void
  onMovePrev: () => void
  onMoveNext: () => void
  onSplit: () => void
}) {
  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1">
        {words.map((word, index) => (
          <button
            key={`${index}-${word}`}
            type="button"
            onClick={() => onSelect(index)}
            aria-pressed={selected === index}
            className={`rounded-md border px-1.5 py-0.5 text-xs transition-colors ${
              selected === index
                ? 'border-accent bg-accent/20 text-accent'
                : 'border-transparent text-text-dim/60 hover:border-border hover:text-text-dim'
            }`}
          >
            {word}
          </button>
        ))}
        {tooLong && selected === null && (
          <span className="self-center px-1 text-xs text-wrong/70">
            {words.length} words — split it?
          </span>
        )}
      </div>

      {selected !== null && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          <WordAction disabled={!canPrev} onClick={onMovePrev} title="Move this word to the end of the line above">
            ← move to previous line
          </WordAction>
          <WordAction disabled={!canNext} onClick={onMoveNext} title="Move this word to the start of the line below">
            move to next line →
          </WordAction>
          <WordAction disabled={!canSplit} onClick={onSplit} title="Start a new line at this word">
            ⤶ split line here
          </WordAction>
        </div>
      )}
    </div>
  )
}

function WordAction({
  children,
  disabled,
  title,
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-full border border-border bg-bg-soft px-2.5 py-1 text-xs text-text-dim hover:border-accent/50 hover:text-accent disabled:opacity-30 disabled:hover:border-border disabled:hover:text-text-dim"
    >
      {children}
    </button>
  )
}

function InsertButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="group flex items-center gap-2 px-9 py-0.5">
      <button
        type="button"
        onClick={onClick}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-text-dim/30 opacity-0 transition-opacity group-hover:opacity-100 hover:!border-accent/60 hover:!text-accent"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <div className="h-px flex-1 bg-border/30 opacity-0 group-hover:opacity-100" />
    </div>
  )
}

function PasteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}
