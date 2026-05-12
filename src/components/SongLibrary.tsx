import { useState } from 'react'
import type { Group, PracticeList, Song, UserList } from '../types'
import { masteryPercent } from '../hooks/useSM2'
import { useNow } from '../hooks/useNow'
import { Header, IconButton, Shell } from './Shell'
import { CommunityTab } from './CommunityTab'
import { GroupsTab } from './GroupsTab'

type Tab = 'mine' | 'community' | 'groups'

interface SongLibraryProps {
  songs: Song[]
  publicSongs: Song[]
  groups: Group[]
  groupsLoading: boolean
  allPracticeLists: PracticeList[]
  userLists: UserList[]
  listSongIds: Map<string, Set<string>>
  onOpen: (songId: string) => void
  onStudy: (songId: string) => void
  onAdd: () => void
  onSignOut: () => void
  onCloneSong: (song: Song) => void
  onOpenGroup: (group: Group) => void
  onCreateGroup: (name: string, description?: string) => Promise<unknown>
  onJoinGroup: (inviteCode: string) => Promise<Group | null>
  onAddToPracticeList: (song: Song, listId: string) => void
  onTogglePublic: (songId: string) => void
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
  songs, publicSongs, groups, groupsLoading, allPracticeLists, userLists, listSongIds,
  onOpen, onStudy, onAdd, onSignOut, onCloneSong,
  onOpenGroup, onCreateGroup, onJoinGroup, onAddToPracticeList, onTogglePublic,
}: SongLibraryProps) {
  const now = useNow()
  const [tab, setTab] = useState<Tab>('mine')
  const [selectedList, setSelectedList] = useState<string | null>(null)

  const mySongIds = new Set(songs.map((s) => s.id))

  // Filter songs when a list is selected
  const visibleSongs = selectedList
    ? songs.filter((s) => listSongIds.get(selectedList)?.has(s.id))
    : songs

  return (
    <Shell>
      <Header
        title="Lyrico"
        subtitle="Learn your lyrics by heart"
        right={
          <div className="flex items-center gap-1">
            {tab === 'mine' && (
              <IconButton label="Add song" onClick={onAdd}>
                <PlusIcon />
              </IconButton>
            )}
            <IconButton label="Sign out" onClick={onSignOut}>
              <SignOutIcon />
            </IconButton>
          </div>
        }
      />

      {/* Tab bar */}
      <div className="mb-5 flex gap-1 rounded-xl border border-border bg-bg-soft p-1">
        {([['mine', 'My Songs'], ['community', 'Community'], ['groups', 'Groups']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm transition-colors ${tab === t ? 'bg-bg-card text-accent' : 'text-text-dim hover:text-text'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'mine' && (
        <>
          {/* List filter strip */}
          {userLists.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedList(null)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${!selectedList ? 'border-accent bg-accent/15 text-accent' : 'border-border text-text-dim hover:text-text'}`}
              >
                All
              </button>
              {userLists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setSelectedList(selectedList === list.id ? null : list.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${selectedList === list.id ? 'border-accent bg-accent/15 text-accent' : 'border-border text-text-dim hover:text-text'}`}
                >
                  {list.name}
                </button>
              ))}
            </div>
          )}

          {visibleSongs.length === 0 ? (
            selectedList ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border bg-bg-soft p-8 text-center">
                <p className="text-text">No songs in this list</p>
                <p className="mt-2 text-sm text-text-dim">Open a song and add it to this list from the details page.</p>
              </div>
            ) : (
              <EmptyState onAdd={onAdd} />
            )
          ) : (
            <ul className="flex flex-col gap-3">
              {visibleSongs.map((song) => (
                <li key={song.id}>
                  <SongRow song={song} now={now} onOpen={() => onOpen(song.id)} onStudy={() => onStudy(song.id)} onTogglePublic={() => onTogglePublic(song.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'community' && (
        <CommunityTab
          songs={publicSongs}
          mySongIds={mySongIds}
          practiceLists={allPracticeLists}
          onAddToLibrary={onCloneSong}
          onAddToPracticeList={onAddToPracticeList}
        />
      )}

      {tab === 'groups' && (
        <GroupsTab
          groups={groups}
          loading={groupsLoading}
          onOpenGroup={onOpenGroup}
          onCreateGroup={onCreateGroup}
          onJoinGroup={onJoinGroup}
        />
      )}
    </Shell>
  )
}

function SongRow({ song, now, onOpen, onStudy, onTogglePublic }: { song: Song; now: number; onOpen: () => void; onStudy: () => void; onTogglePublic: () => void }) {
  const mastery = masteryPercent(song)
  const concertDays = song.concertDate ? daysUntil(song.concertDate, now) : null
  const concertUrgent = concertDays !== null && concertDays <= 7

  return (
    <div className="rounded-2xl border border-border bg-bg-soft">
      <button type="button" onClick={onOpen} className="block w-full px-4 pt-4 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-lg text-text">{song.title}</h2>
          <span className="shrink-0 text-sm text-accent">{mastery}%</span>
        </div>
        <p className="mt-0.5 truncate text-sm text-text-dim">
          {[song.composer, song.voicePart].filter(Boolean).join(' · ') || `${song.cards.length} lines`}
        </p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${mastery}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
          <span>Last practiced {formatRelative(now, song.lastStudied)}</span>
          {concertDays !== null && (
            <span className={concertUrgent ? 'text-wrong' : 'text-accent-soft'}>
              · Concert in {Math.max(0, concertDays)}d
            </span>
          )}
        </div>
      </button>
      <div className="mt-3 flex border-t border-border">
        <button type="button" onClick={onOpen} className="flex-1 py-3 text-sm text-text-dim hover:text-text">Details</button>
        <div className="w-px bg-border" />
        <button type="button" onClick={onTogglePublic} className={`flex-1 py-3 text-sm ${song.isPublic ? 'text-accent' : 'text-text-dim hover:text-text'}`}>
          {song.isPublic ? 'Shared ✓' : 'Share'}
        </button>
        <div className="w-px bg-border" />
        <button type="button" onClick={onStudy} className="flex-1 py-3 text-sm text-accent hover:brightness-110">Study</button>
      </div>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-border bg-bg-soft p-8 text-center">
      <h2 className="text-xl text-text">No songs yet</h2>
      <p className="mt-2 text-sm text-text-dim">
        Paste a song's lyrics — one line per row — and Lyrico will drill you line by line until you have it memorized.
      </p>
      <button type="button" onClick={onAdd} className="mt-5 rounded-full border border-accent bg-accent/10 px-5 py-2 text-accent hover:bg-accent/20">
        Add your first song
      </button>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
