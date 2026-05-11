import type { Song, PracticeList } from '../types'

interface CommunityTabProps {
  songs: Song[]
  mySongIds: Set<string>
  practiceLists: PracticeList[]
  onAddToLibrary: (song: Song) => void
  onAddToPracticeList: (song: Song, listId: string) => void
}

export function CommunityTab({ songs, mySongIds, practiceLists, onAddToLibrary, onAddToPracticeList }: CommunityTabProps) {
  if (songs.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-border bg-bg-soft p-8 text-center">
        <p className="text-text">No community songs yet</p>
        <p className="mt-2 text-sm text-text-dim">When someone shares a song, it will appear here.</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {songs.map((song) => (
        <li key={song.id} className="rounded-2xl border border-border bg-bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base text-text">{song.title}</p>
              {song.composer && <p className="mt-0.5 truncate text-sm text-text-dim">{song.composer}</p>}
              <p className="mt-1 text-xs text-text-dim/60">
                {song.lyrics.split('\n').filter((l) => l.trim()).length} lines
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 items-end">
              {mySongIds.has(song.id) ? (
                <span className="text-xs text-text-dim/60 italic">In your library</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddToLibrary(song)}
                  className="rounded-full border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
                >
                  Add to library
                </button>
              )}
              {practiceLists.length > 0 && (
                <div className="relative group">
                  <button
                    type="button"
                    className="text-xs text-text-dim/60 hover:text-text-dim"
                  >
                    + Add to list ▾
                  </button>
                  <div className="absolute right-0 top-6 z-10 hidden min-w-[160px] rounded-xl border border-border bg-bg-card p-1 shadow-lg group-focus-within:block group-hover:block">
                    {practiceLists.map((list) => (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => onAddToPracticeList(song, list.id)}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-bg-soft"
                      >
                        {list.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
