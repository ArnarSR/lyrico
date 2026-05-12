import { useEffect, useRef, useState } from 'react'
import type { Song } from '../types'
import { Header, IconButton, Shell } from './Shell'

interface EditLyricsProps {
  song: Song
  onSave: (lines: { id?: string; text: string }[]) => Promise<void>
  onCancel: () => void
}

interface Row {
  key: string    // stable React key
  id?: string    // card id if this line existed before
  text: string
}

let nextKey = 0
function genKey() { return String(nextKey++) }

export function EditLyrics({ song, onSave, onCancel }: EditLyricsProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    song.cards.map((c) => ({ key: genKey(), id: c.id, text: c.text })),
  )
  const [saving, setSaving] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const inputRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())

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

  function updateText(key: string, text: string) {
    setRows((r) => r.map((row) => row.key === key ? { ...row, text } : row))
  }

  function deleteRow(key: string) {
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

  async function handleSave() {
    const lines = rows.filter((r) => r.text.trim().length > 0)
    if (lines.length === 0) return
    setSaving(true)
    try {
      await onSave(lines.map(({ id, text }) => ({ id, text: text.trim() })))
    } finally {
      setSaving(false)
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
    return !orig || r.id !== orig.id || r.text !== orig.text
  }) || nonEmptyRows.length !== song.cards.length

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
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="rounded-full border border-accent bg-accent/15 px-4 py-1.5 text-sm text-accent disabled:opacity-40 hover:bg-accent/25"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        }
      />

      {rows.length > 0 && (
        <p className="mb-4 text-xs text-text-dim">
          {rows.length} line{rows.length !== 1 ? 's' : ''} · tap a line to edit · SM‑2 progress preserved when text is unchanged
        </p>
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
        {rows.map((row, i) => (
          <li key={row.key}>
            <div className="flex items-start gap-2 py-1">
              {/* Line number */}
              <span className="mt-2.5 w-7 shrink-0 text-right text-xs text-text-dim/40 select-none">
                {i + 1}
              </span>

              {/* Editable text */}
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
                className="min-w-0 flex-1 resize-none overflow-hidden rounded-xl border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-text placeholder:text-text-dim/40 focus:border-accent focus:outline-none"
              />

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
        ))}
      </ol>

      {/* Paste panel */}
      {showPaste ? (
        <div className="mt-4 rounded-2xl border border-border bg-bg-soft p-4">
          <p className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Paste lyrics</p>
          <textarea
            ref={pasteRef}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"Paste a verse or the full song here…\nOne line per row."}
            className="w-full resize-y rounded-xl border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-text placeholder:text-text-dim/40 focus:border-accent focus:outline-none"
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
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex-[2] rounded-full border border-accent bg-accent/15 py-2.5 text-sm text-accent disabled:opacity-40 hover:bg-accent/25"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Shell>
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
