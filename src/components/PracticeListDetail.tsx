import { useEffect, useMemo, useState } from 'react'
import type { LyricReport, PracticeList, Song, SongInList, UserListType } from '../types'
import { masteryPercent } from '../hooks/useSM2'
import { Header, Shell } from './Shell'
import { formatDateInput, parseDateInput } from '../lib/dates'

interface PracticeListDetailProps {
  list: PracticeList
  userId: string
  mySongIds: Set<string>
  mySongs: Song[]
  onBack: () => void
  onAddSongToLibrary: (song: Song) => void
  onGetSongs: (listId: string) => Promise<SongInList[]>
  onAddSong: (listId: string, songId: string) => Promise<{ status: 'approved' | 'pending' }>
  onRemoveSong: (listId: string, songId: string) => Promise<void>
  onUpdateList: (patch: { name?: string; listType?: UserListType; concertDate?: number | null }) => Promise<void>
  onStudy: (songId: string) => void
  isAdmin?: boolean
  canApproveSongs?: boolean
  onApproveSong?: (songId: string) => Promise<void>
  onRejectSong?: (songId: string) => Promise<void>
  onGetReports?: (songId: string) => Promise<LyricReport[]>
  onEditSongLine?: (songId: string, lineIndex: number, newText: string) => Promise<void>
  onDismissReport?: (reportId: string) => Promise<void>
}

const DAY_MS = 86_400_000
function daysUntil(ts: number) { return Math.ceil((ts - Date.now()) / DAY_MS) }

export function PracticeListDetail({
  list, userId, mySongIds, mySongs, onBack, onAddSongToLibrary, onGetSongs, onAddSong, onRemoveSong, onUpdateList, onStudy,
  isAdmin, canApproveSongs, onApproveSong, onRejectSong, onGetReports, onEditSongLine, onDismissReport,
}: PracticeListDetailProps) {
  const [songs, setSongs] = useState<SongInList[]>([])
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [addingAll, setAddingAll] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [concertDate, setConcertDate] = useState<number | undefined>(list.concertDate)
  const [dateValue, setDateValue] = useState(
    list.concertDate ? formatDateInput(list.concertDate) : '',
  )

  useEffect(() => {
    onGetSongs(list.id).then((s) => { setSongs(s); setLoading(false) })
  }, [list.id, onGetSongs])

  const isOwner = list.createdBy === userId
  const approvedSongs = useMemo(() => songs.filter((s) => s.status === 'approved'), [songs])
  const pendingSongs = useMemo(() => songs.filter((s) => s.status === 'pending'), [songs])
  const listSongIds = new Set(songs.map((s) => s.id))

  // Merge: prefer user's own mastery data over the raw list song data (approved only for stats)
  const songsWithMastery = useMemo(
    () => approvedSongs.map((s) => mySongs.find((ms) => ms.id === s.id) ?? s),
    [approvedSongs, mySongs],
  )

  const readiness = useMemo(() => {
    if (songsWithMastery.length === 0) return null
    const total = songsWithMastery.reduce((sum, s) => sum + (s.isKnown ? 100 : masteryPercent(s)), 0)
    return Math.round(total / songsWithMastery.length)
  }, [songsWithMastery])

  // Pick the lowest-mastery song the user owns for the Study button
  const studySong = useMemo(() => {
    const owned = songsWithMastery.filter((s) => mySongIds.has(s.id) && !s.isKnown)
    if (!owned.length) return null
    return owned.reduce((worst, s) => masteryPercent(s) < masteryPercent(worst) ? s : worst)
  }, [songsWithMastery, mySongIds])

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
    const { status } = await onAddSong(list.id, song.id)
    setSongs((prev) => [...prev, { ...song, status, addedBy: userId }])
    setAdding((prev) => { const s = new Set(prev); s.delete(song.id); return s })
  }

  const songsNotOwned = approvedSongs.filter((s) => !mySongIds.has(s.id))

  async function handleAddAll() {
    if (songsNotOwned.length === 0) return
    setAddingAll(true)
    for (const song of songsNotOwned) {
      onAddSongToLibrary(song)
    }
    setAddingAll(false)
  }

  async function handleRemove(songId: string) {
    const song = songs.find((s) => s.id === songId)
    setSongs((prev) => prev.filter((s) => s.id !== songId))
    if (canApproveSongs && song?.status === 'pending') {
      await onRejectSong?.(songId)
    } else {
      await onRemoveSong(list.id, songId)
    }
  }

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // Admin: pending lyric reports for all songs in this list
  const [reports, setReports] = useState<LyricReport[]>([])
  const [approvingId, setApprovingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin || !onGetReports) return
    // Load reports for all songs in the list once songs are loaded
    if (songs.length === 0) return
    Promise.all(songs.map((s) => onGetReports(s.id))).then((results) => {
      setReports(results.flat())
    })
  }, [isAdmin, onGetReports, songs])

  async function handleSaveDate() {
    const d = dateValue ? parseDateInput(dateValue) : null
    setSaveStatus('saving')
    setSaveError(null)
    try {
      await onUpdateList({ concertDate: d })
      setConcertDate(d ?? undefined)
      setEditingDate(false)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch (e) {
      setSaveStatus('error')
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : String(e)
      setSaveError(msg || 'Could not save date')
    }
  }

  const daysLeft = list.listType === 'concert' && concertDate ? daysUntil(concertDate) : null
  const dColor = daysLeft === null ? '' : daysLeft <= 7 ? 'text-wrong' : daysLeft <= 30 ? 'text-accent' : 'text-text-dim'
  const rColor = readiness === null ? '' : readiness < 50 ? 'text-wrong' : readiness < 80 ? 'text-accent' : 'text-correct'
  const barColor = readiness === null ? '' : readiness < 50 ? 'bg-wrong/70' : readiness < 80 ? 'bg-accent' : 'bg-correct'

  return (
    <Shell bottomPad>
      <Header
        title={list.name}
        subtitle={loading ? undefined : `${approvedSongs.length} song${approvedSongs.length !== 1 ? 's' : ''}${pendingSongs.length > 0 ? ` · ${pendingSongs.length} pending` : ''}`}
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
              {list.listType === 'concert' && !concertDate && (
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
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="shrink-0 text-xs text-text-dim">Concert date</label>
                    <input
                      type="date"
                      value={dateValue}
                      onChange={(e) => setDateValue(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text focus:border-accent"
                    />
                    <button
                      type="button"
                      disabled={saveStatus === 'saving'}
                      onClick={handleSaveDate}
                      className="rounded-lg px-3 py-1 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
                    >
                      {saveStatus === 'saving' ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingDate(false)} className="rounded-lg px-3 py-1 text-sm text-text-dim hover:bg-bg-card">Cancel</button>
                  </div>
                  {saveStatus === 'error' && (
                    <p className="text-xs text-wrong">{saveError ?? 'Could not save date.'}</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingDate(true)}
                    className="text-xs text-text-dim/50 hover:text-text-dim"
                  >
                    {concertDate
                      ? `🗓 ${new Date(concertDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} — edit`
                      : '+ Set concert date'}
                  </button>
                  {saveStatus === 'saved' && (
                    <span className="text-xs text-correct">✓ Saved</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="mb-4 flex gap-2">
        {studySong && (
          <button
            type="button"
            onClick={() => onStudy(studySong.id)}
            className="flex items-center gap-2 rounded-full border border-accent bg-accent px-5 py-2 text-sm font-medium text-bg hover:brightness-110"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Study
          </button>
        )}
        <button
          type="button"
          onClick={() => { setShowPicker((v) => !v); setSearch('') }}
          className="rounded-full border border-border bg-bg-soft px-4 py-2 text-sm text-text-dim hover:text-text"
        >
          {showPicker ? 'Done' : '+ Add songs'}
        </button>
      </div>

      {/* Add all songs to library banner */}
      {!loading && songsNotOwned.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-accent/25 bg-accent/5 px-4 py-3">
          <p className="text-sm text-text-dim">
            {songsNotOwned.length} song{songsNotOwned.length !== 1 ? 's' : ''} not in your library
          </p>
          <button
            type="button"
            disabled={addingAll}
            onClick={handleAddAll}
            className="shrink-0 rounded-full border border-accent bg-accent/15 px-4 py-1.5 text-sm text-accent hover:bg-accent/25 disabled:opacity-50"
          >
            {addingAll ? 'Adding…' : 'Add all to library'}
          </button>
        </div>
      )}

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
            const isPending = song.status === 'pending'
            const isMyPending = isPending && song.addedBy === userId
            const resolved = mySongs.find((ms) => ms.id === song.id) ?? song
            const m = resolved.isKnown ? 100 : masteryPercent(resolved)
            const barColor = m < 30 ? 'bg-wrong/70' : m < 70 ? 'bg-accent' : 'bg-correct'
            const textColor = m < 30 ? 'text-wrong' : m < 70 ? 'text-accent' : 'text-correct'
            const isStudyTarget = studySong?.id === song.id
            return (
              <li key={song.id} className={`rounded-2xl border bg-bg-card p-4 ${isPending ? 'border-accent/20 opacity-80' : isStudyTarget ? 'border-accent/40' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p className="truncate text-base text-text">{song.title}</p>
                      {!isPending && <span className={`shrink-0 text-xs font-medium ${textColor}`}>{m}%</span>}
                      {isPending && (
                        <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                          {isMyPending ? 'Awaiting approval' : 'Pending'}
                        </span>
                      )}
                    </div>
                    {song.composer && (
                      <p className="mt-0.5 truncate text-sm text-text-dim">{song.composer}</p>
                    )}
                    {!isPending && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-soft">
                        <div className={`h-full rounded-full transition-[width] ${barColor}`} style={{ width: `${m}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {/* Approve/Reject buttons for moderators on pending songs */}
                    {canApproveSongs && isPending && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            await onApproveSong?.(song.id)
                            setSongs((prev) => prev.map((s) => s.id === song.id ? { ...s, status: 'approved' } : s))
                          }}
                          className="rounded-full border border-correct bg-correct/10 px-3 py-1 text-xs text-correct hover:bg-correct/20"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(song.id)}
                          className="rounded-full border border-wrong/40 bg-wrong/5 px-3 py-1 text-xs text-wrong/80 hover:bg-wrong/15"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {/* Study / Add to library for approved songs */}
                    {!isPending && (
                      mySongIds.has(song.id) ? (
                        <button
                          type="button"
                          onClick={() => onStudy(song.id)}
                          className="rounded-full border border-border px-3 py-1.5 text-xs text-text-dim hover:border-accent/50 hover:text-accent"
                        >
                          Study
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAddSongToLibrary(song)}
                          className="rounded-full border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
                        >
                          Add to library
                        </button>
                      )
                    )}
                    {/* Remove: owner removes approved songs; own pending can also be withdrawn */}
                    {(isOwner || (isMyPending && !canApproveSongs)) && (
                      <button
                        type="button"
                        onClick={() => handleRemove(song.id)}
                        className="text-xs text-text-dim/50 hover:text-wrong"
                      >
                        {isMyPending ? 'Withdraw' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* ── Admin: pending lyric reports ── */}
      {isAdmin && reports.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs uppercase tracking-[0.15em] text-text-dim">
            Suggested corrections ({reports.length})
          </p>
          <ul className="flex flex-col gap-3">
            {reports.map((report) => {
              const song = songs.find((s) => s.id === report.songId)
              const canApply = !!(onEditSongLine && mySongIds.has(report.songId))
              return (
                <li key={report.id} className="rounded-2xl border border-accent/20 bg-bg-soft p-4">
                  {song && <p className="mb-1 text-xs font-medium text-accent">{song.title}</p>}
                  <p className="text-sm text-text-dim line-through">{report.currentText}</p>
                  {report.suggestedText && (
                    <p className="mt-1 text-sm text-text">{report.suggestedText}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    {canApply && report.suggestedText && (
                      <button
                        type="button"
                        disabled={approvingId === report.id}
                        onClick={async () => {
                          setApprovingId(report.id)
                          await onEditSongLine!(report.songId, report.lineIndex, report.suggestedText!)
                          await onDismissReport?.(report.id)
                          setReports((prev) => prev.filter((r) => r.id !== report.id))
                          setApprovingId(null)
                        }}
                        className="rounded-full border border-correct bg-correct/10 px-3 py-1 text-xs text-correct hover:bg-correct/20 disabled:opacity-50"
                      >
                        {approvingId === report.id ? 'Applying…' : 'Apply correction'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await onDismissReport?.(report.id)
                        setReports((prev) => prev.filter((r) => r.id !== report.id))
                      }}
                      className="rounded-full border border-border px-3 py-1 text-xs text-text-dim hover:text-text"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Shell>
  )
}
