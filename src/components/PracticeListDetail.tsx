import { useEffect, useMemo, useState } from 'react'
import type { PracticeList, Song, UserListType } from '../types'
import { masteryPercent } from '../hooks/useSM2'
import { Header, Shell } from './Shell'

interface PracticeListDetailProps {
  list: PracticeList
  userId: string
  mySongIds: Set<string>
  mySongs: Song[]
  onBack: () => void
  onCloneSong: (song: Song) => void
  onGetSongs: (listId: string) => Promise<Song[]>
  onAddSong: (listId: string, songId: string) => Promise<void>
  onRemoveSong: (listId: string, songId: string) => Promise<void>
  onUpdateList: (patch: { name?: string; listType?: UserListType; concertDate?: number | null }) => void
}

const DAY_MS = 86_400_000
function daysUntil(ts: number) { return Math.ceil((ts - Date.now()) / DAY_MS) }

export function PracticeListDetail({
  list, userId, mySongIds, mySongs, onBack, onCloneSong, onGetSongs, onAddSong, onRemoveSong, onUpdateList,
}: PracticeListDetailProps) {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState(
    list.concertDate ? new Date(list.concertDate).toISOString().split('T')[0] : '',
  )

  useEffect(() => {
    onGetSongs(list.id).then((s) => { setSongs(s); setLoading(false) })
  }, [list.id, onGetSongs])

  const isOwner = list.createdBy === userId
  const listSongIds = new Set(songs.map((s) => s.id))

  // Merge: prefer user's own mastery data over the raw list song data
  const songsWithMastery = useMemo(
    () => songs.map((s) => mySongs.find((ms) => ms.id === s.id) ?? s),
    [songs, mySongs],
  )

  const readiness = useMemo(() => {
    if (songsWithMastery.length === 0) return null
    const total = songsWithMastery.reduce((sum, s) => sum + (s.isKnown ? 100 : masteryPercent(s)), 0)
    return Math.round(total / songsWithMastery.length)
  }, [songsWithMastery])

  const pickableSongs = useMemo(() => {
    const q = search.toLowerCase()
    return mySongs.filter(
      (s) => !listSongIds.has(s.id) && (
        !q || s.title.toLowerCase().includes(q) || (s.composer ?? '').toLowerCase().includes(q)
      ),
    )
  }, [mySongs, listSongIds, search])

  async function handleAdd(song: Song) {
    setAdding((prev) => new Set(prev).add(song.id))
    setSongs((prev) => [...prev, song])
    await onAddSong(list.id, song.id)
    setAdding((prev) => { const s = new Set(prev); s.delete(song.id); return s })
  }

  async function handleRemove(songId: string) {
    setSongs((prev) => prev.filter((s) => s.id !== songId))
    await onRemoveSong(list.id, songId)
  }

  function handleSaveDate() {
    const d = dateValue ? new Date(dateValue).getTime() : null
    onUpdateList({ concertDate: d })
    setEditingDate(false)
  }

  const daysLeft = list.listType === 'concert' && list.concertDate ? daysUntil(list.concertDate) : null
  const dColor = daysLeft === null ? '' : daysLeft <= 7 ? 'text-wrong' : daysLeft <= 30 ? 'text-accent' : 'text-text-dim'
  const rColor = readiness === null ? '' : readiness < 50 ? 'text-wrong' : readiness < 80 ? 'text-accent' : 'text-correct'
  const barColor = readiness === null ? '' : readiness < 50 ? 'bg-wrong/70' : readiness < 80 ? 'bg-accent' : 'bg-correct'

  return (
    <Shell>
      <Header
        title={list.name}
        subtitle={loading ? undefined : `${songs.length} song${songs.length !== 1 ? 's' : ''}`}
        right={
          <button type="button" onClick={onBack} className="text-sm text-text-dim hover:text-text">
            Back
          </button>
        }
      />

      {/* Readiness + concert date card */}
      {!loading && (
        <div className={`mb-4 overflow-hidden rounded-2xl border bg-bg-soft ${list.listType === 'concert' ? 'border-accent/25' : 'border-border'}`}>
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.15em] text-text-dim">
                {list.listType === 'concert' ? '🎭 Concert readiness' : '🎵 Repertoire readiness'}
              </p>
              {readiness !== null && (
                <p className={`text-lg font-medium ${rColor}`}>{readiness}%</p>
              )}
            </div>
            {readiness !== null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
                <div className={`h-full rounded-full transition-[width] ${barColor}`} style={{ width: `${readiness}%` }} />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              {list.listType === 'concert' && daysLeft !== null && (
                <span className={dColor}>
                  🗓 {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Concert today!' : 'Concert passed'}
                </span>
              )}
              {list.listType === 'concert' && !list.concertDate && (
                <span className="text-wrong/70">No concert date set</span>
              )}
              {songsWithMastery.length > 0 && (
                <span className="text-text-dim/60">
                  {songsWithMastery.length} song{songsWithMastery.length !== 1 ? 's' : ''} · {songsWithMastery.filter((s) => s.isKnown).length} known · {songsWithMastery.filter((s) => masteryPercent(s) === 100 && !s.isKnown).length} mastered
                </span>
              )}
            </div>
          </div>

          {/* Concert date editor (owners of concert lists) */}
          {isOwner && list.listType === 'concert' && (
            <div className="border-t border-border/40 px-4 py-3">
              {editingDate ? (
                <div className="flex items-center gap-2">
                  <label className="shrink-0 text-xs text-text-dim">Concert date</label>
                  <input
                    type="date"
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text focus:border-accent"
                  />
                  <button type="button" onClick={handleSaveDate} className="text-sm text-accent">Save</button>
                  <button type="button" onClick={() => setEditingDate(false)} className="text-sm text-text-dim">✕</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDate(true)}
                  className="text-xs text-text-dim/50 hover:text-text-dim"
                >
                  {list.concertDate
                    ? `🗓 ${new Date(list.concertDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} — edit`
                    : '+ Set concert date'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add my songs button */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => { setShowPicker((v) => !v); setSearch('') }}
          className="rounded-full border border-accent bg-accent/15 px-4 py-2 text-sm text-accent hover:bg-accent/25"
        >
          {showPicker ? 'Done adding' : '+ Add my songs'}
        </button>
      </div>

      {/* Song picker */}
      {showPicker && (
        <div className="mb-5 rounded-2xl border border-border bg-bg-soft p-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your songs…"
            autoFocus
            className="mb-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/60 focus:border-accent"
          />
          {pickableSongs.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-dim">
              {search ? 'No matches' : 'All your songs are already in this list'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {pickableSongs.map((song) => (
                <li key={song.id}>
                  <button
                    type="button"
                    disabled={adding.has(song.id)}
                    onClick={() => handleAdd(song)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-bg-card disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-text">{song.title}</p>
                      {song.composer && <p className="truncate text-xs text-text-dim">{song.composer}</p>}
                    </div>
                    <span className="ml-3 shrink-0 text-xs text-accent">
                      {adding.has(song.id) ? '…' : 'Add'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-center text-text-dim">Loading…</p>
      ) : songs.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-bg-soft p-8 text-center">
          <p className="text-text">No songs in this list yet</p>
          <p className="mt-2 text-sm text-text-dim">Add your own songs above.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {songs.map((song) => {
            const m = masteryPercent(mySongs.find((ms) => ms.id === song.id) ?? song)
            const mc = m < 30 ? 'text-wrong' : m < 70 ? 'text-accent' : 'text-correct'
            return (
              <li key={song.id} className="rounded-2xl border border-border bg-bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base text-text">{song.title}</p>
                    {song.composer && (
                      <p className="mt-0.5 truncate text-sm text-text-dim">{song.composer}</p>
                    )}
                    <p className={`mt-1 text-xs ${mc}`}>{m}%</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {!mySongIds.has(song.id) && (
                      <button
                        type="button"
                        onClick={() => onCloneSong(song)}
                        className="rounded-full border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
                      >
                        Add to library
                      </button>
                    )}
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleRemove(song.id)}
                        className="text-xs text-text-dim/50 hover:text-wrong"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Shell>
  )
}
