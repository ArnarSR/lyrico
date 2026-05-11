import { useEffect, useState } from 'react'
import type { PracticeList, Song } from '../types'
import { Header, Shell } from './Shell'

interface PracticeListDetailProps {
  list: PracticeList
  userId: string
  mySongIds: Set<string>
  onBack: () => void
  onCloneSong: (song: Song) => void
  onGetSongs: (listId: string) => Promise<Song[]>
  onRemoveSong: (listId: string, songId: string) => Promise<void>
}

export function PracticeListDetail({
  list, userId, mySongIds, onBack, onCloneSong, onGetSongs, onRemoveSong,
}: PracticeListDetailProps) {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    onGetSongs(list.id).then((s) => { setSongs(s); setLoading(false) })
  }, [list.id, onGetSongs])

  async function handleRemove(songId: string) {
    setSongs((prev) => prev.filter((s) => s.id !== songId))
    await onRemoveSong(list.id, songId)
  }

  const isOwner = list.createdBy === userId

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

      {loading ? (
        <p className="text-center text-text-dim">Loading…</p>
      ) : songs.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-bg-soft p-8 text-center">
          <p className="text-text">No songs in this list yet</p>
          <p className="mt-2 text-sm text-text-dim">
            Go to the Community tab and add songs to this list.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {songs.map((song) => (
            <li key={song.id} className="rounded-2xl border border-border bg-bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base text-text">{song.title}</p>
                  {song.composer && (
                    <p className="mt-0.5 truncate text-sm text-text-dim">{song.composer}</p>
                  )}
                  <p className="mt-1 text-xs text-text-dim/60">
                    {song.lyrics.split('\n').filter((l) => l.trim()).length} lines
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {mySongIds.has(song.id) ? (
                    <span className="text-xs italic text-text-dim/60">In your library</span>
                  ) : (
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
          ))}
        </ul>
      )}
    </Shell>
  )
}
