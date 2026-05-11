import type { Song } from '../types'
import { masteryPercent } from '../hooks/useSM2'
import { useNow } from '../hooks/useNow'
import { Header, IconButton, Shell } from './Shell'

interface SongLibraryProps {
  songs: Song[]
  onOpen: (songId: string) => void
  onStudy: (songId: string) => void
  onAdd: () => void
}

const DAY_MS = 86_400_000

function daysUntil(ts: number, now: number): number {
  return Math.ceil((ts - now) / DAY_MS)
}

function formatRelative(now: number, ts?: number): string {
  if (!ts) return 'never'
  const diff = now - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  const days = Math.floor(diff / 86_400_000)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

export function SongLibrary({
  songs,
  onOpen,
  onStudy,
  onAdd,
}: SongLibraryProps) {
  const now = useNow()
  return (
    <Shell>
      <Header
        title="Lyrica"
        subtitle="Learn your lyrics by heart"
        right={
          <IconButton label="Add song" onClick={onAdd}>
            <PlusIcon />
          </IconButton>
        }
      />

      {songs.length === 0 ? (
        <EmptyState onAdd={onAdd} />
      ) : (
        <ul className="flex flex-col gap-3">
          {songs.map((song) => (
            <li key={song.id}>
              <SongRow
                song={song}
                now={now}
                onOpen={() => onOpen(song.id)}
                onStudy={() => onStudy(song.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}

function SongRow({
  song,
  now,
  onOpen,
  onStudy,
}: {
  song: Song
  now: number
  onOpen: () => void
  onStudy: () => void
}) {
  const mastery = masteryPercent(song)
  const concertDays = song.concertDate ? daysUntil(song.concertDate, now) : null
  const concertUrgent = concertDays !== null && concertDays <= 7

  return (
    <div className="rounded-2xl border border-border bg-bg-soft">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full px-4 pt-4 text-left"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-lg text-text">{song.title}</h2>
          <span className="shrink-0 text-sm text-accent">{mastery}%</span>
        </div>
        <p className="mt-0.5 truncate text-sm text-text-dim">
          {[song.composer, song.voicePart].filter(Boolean).join(' · ') ||
            `${song.cards.length} lines`}
        </p>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${mastery}%` }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
          <span>Last practiced {formatRelative(now, song.lastStudied)}</span>
          {concertDays !== null && (
            <span
              className={
                concertUrgent ? 'text-wrong' : 'text-accent-soft'
              }
            >
              · Concert in {Math.max(0, concertDays)}d
            </span>
          )}
        </div>
      </button>

      <div className="mt-3 flex border-t border-border">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 py-3 text-sm text-text-dim hover:text-text"
        >
          Details
        </button>
        <div className="w-px bg-border" />
        <button
          type="button"
          onClick={onStudy}
          className="flex-1 py-3 text-sm text-accent hover:brightness-110"
        >
          Study
        </button>
      </div>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-border bg-bg-soft p-8 text-center">
      <h2 className="text-xl text-text">No songs yet</h2>
      <p className="mt-2 text-sm text-text-dim">
        Paste a song's lyrics — one line per row — and Lyrica will drill you
        line by line until you have it memorized.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-5 rounded-full border border-accent bg-accent/10 px-5 py-2 text-accent hover:bg-accent/20"
      >
        Add your first song
      </button>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
