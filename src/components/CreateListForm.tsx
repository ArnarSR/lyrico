import { useEffect, useRef, useState } from 'react'
import type { UserListType } from '../types'
import { parseDateInput } from '../lib/dates'

interface CreateListFormProps {
  onSave: (name: string, listType: UserListType, concertDate?: number) => Promise<void>
  onCancel: () => void
}

export function CreateListForm({ onSave, onCancel }: CreateListFormProps) {
  const [listType, setListType] = useState<UserListType>('concert')
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  async function handleSubmit() {
    if (!name.trim() || (listType === 'concert' && !date)) return
    setSaving(true)
    setError(null)
    try {
      const concertDate = date ? parseDateInput(date) : undefined
      await onSave(name.trim(), listType, concertDate)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create list — check your connection.')
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-soft p-4">
      {/* Type picker */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(['concert', 'standard'] as UserListType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setListType(t)}
            className={`rounded-xl border px-3 py-3 text-left transition-colors ${
              listType === t
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-text-dim hover:text-text'
            }`}
          >
            <p className="text-base">{t === 'concert' ? '🎭' : '🎵'}</p>
            <p className="mt-1 text-sm font-medium">{t === 'concert' ? 'Concert' : 'Standard'}</p>
            <p className="text-xs opacity-70">{t === 'concert' ? 'Linked to a date' : 'Learn at will'}</p>
          </button>
        ))}
      </div>

      {/* Name */}
      <input
        ref={nameRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !(listType === 'concert' && !date)) handleSubmit() }}
        placeholder={listType === 'concert' ? 'e.g. Spring Concert 2026' : 'e.g. Favourite Folk Songs'}
        className="mb-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/60 focus:border-accent"
      />

      {/* Concert date (concert only) */}
      {listType === 'concert' && (
        <div className="mb-3 flex items-center gap-2">
          <label className="shrink-0 text-xs text-text-dim">Concert date *</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mb-2 rounded-xl border border-wrong/40 bg-wrong/10 px-3 py-2 text-sm text-wrong">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-border py-2 text-sm text-text-dim hover:text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim() || (listType === 'concert' && !date) || saving}
          onClick={handleSubmit}
          className="flex-[2] rounded-xl border border-accent/30 bg-accent/15 py-2 text-sm text-accent disabled:opacity-40 hover:bg-accent/25"
        >
          {saving ? 'Creating…' : 'Create list'}
        </button>
      </div>
    </div>
  )
}
