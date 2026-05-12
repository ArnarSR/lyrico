import { useEffect, useMemo, useState } from 'react'
import type { Group, PracticeList, Song, UserList } from '../types'
import { masteryPercent } from '../hooks/useSM2'
import { useNow } from '../hooks/useNow'
import { Header, IconButton, Shell } from './Shell'
import { CommunityTab } from './CommunityTab'
import { GroupsTab } from './GroupsTab'
import { FeedbackModal } from './FeedbackModal'

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
  onToggleKnown: (songId: string) => void
  onGetPracticeListSongs: (listId: string) => Promise<Song[]>
}

const DAY_MS = 86_400_000

function daysUntil(ts: number, now: number) { return Math.ceil((ts - now) / DAY_MS) }

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
  onOpenGroup, onCreateGroup, onJoinGroup, onAddToPracticeList, onTogglePublic, onToggleKnown,
  onGetPracticeListSongs,
}: SongLibraryProps) {
  const now = useNow()
  const [tab, setTab] = useState<Tab>('mine')
  const [showFeedback, setShowFeedback] = useState(false)

  const mySongIds = new Set(songs.map((s) => s.id))

  return (
    <Shell>
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}

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
            <IconButton label="Send feedback" onClick={() => setShowFeedback(true)}>
              <FeedbackIcon />
            </IconButton>
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
        <MySongsTab
          songs={songs}
          groups={groups}
          allPracticeLists={allPracticeLists}
          userLists={userLists}
          listSongIds={listSongIds}
          now={now}
          onOpen={onOpen}
          onStudy={onStudy}
          onAdd={onAdd}
          onTogglePublic={onTogglePublic}
          onToggleKnown={onToggleKnown}
          onGetPracticeListSongs={onGetPracticeListSongs}
        />
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

// ── My Songs tab ──────────────────────────────────────────────────────────────

interface MySongsTabProps {
  songs: Song[]
  groups: Group[]
  allPracticeLists: PracticeList[]
  userLists: UserList[]
  listSongIds: Map<string, Set<string>>
  now: number
  onOpen: (id: string) => void
  onStudy: (id: string) => void
  onAdd: () => void
  onTogglePublic: (id: string) => void
  onToggleKnown: (id: string) => void
  onGetPracticeListSongs: (listId: string) => Promise<Song[]>
}

function MySongsTab({
  songs, groups, allPracticeLists, userLists, listSongIds, now,
  onOpen, onStudy, onAdd, onTogglePublic, onToggleKnown, onGetPracticeListSongs,
}: MySongsTabProps) {
  const [featuredListId, setFeaturedListId] = useState<string | null>(
    () => localStorage.getItem('lyrico_featured_list'),
  )
  const [mySongsOpen, setMySongsOpen] = useState(
    () => localStorage.getItem('lyrico_mysongs_open') !== 'false',
  )
  const [showPicker, setShowPicker] = useState(false)
  const [fetchedGroupSongs, setFetchedGroupSongs] = useState<Song[]>([])
  const [fetchingGroup, setFetchingGroup] = useState(false)

  const featuredUserList = userLists.find((l) => l.id === featuredListId)
  const featuredPracticeList = allPracticeLists.find((l) => l.id === featuredListId)
  const featuredListName = featuredUserList?.name ?? featuredPracticeList?.name ?? null
  const isGroupList = !!featuredPracticeList

  // Fetch group practice list songs when selected
  useEffect(() => {
    if (!featuredListId || !isGroupList) return
    setFetchingGroup(true)
    onGetPracticeListSongs(featuredListId).then((s) => {
      setFetchedGroupSongs(s)
      setFetchingGroup(false)
    })
  }, [featuredListId, isGroupList, onGetPracticeListSongs])

  // All songs in the active list (for readiness calculation)
  const allListSongs = useMemo(() => {
    if (!featuredListId) return []
    if (isGroupList) {
      return fetchedGroupSongs.map((gs) => songs.find((s) => s.id === gs.id) ?? gs)
    }
    const ids = listSongIds.get(featuredListId) ?? new Set<string>()
    return songs.filter((s) => ids.has(s.id))
  }, [featuredListId, isGroupList, fetchedGroupSongs, songs, listSongIds])

  // Concert readiness: known songs = 100%, others = their mastery %
  const concertReadiness = useMemo(() => {
    if (allListSongs.length === 0) return null
    const total = allListSongs.reduce((sum, s) => sum + (s.isKnown ? 100 : masteryPercent(s)), 0)
    return Math.round(total / allListSongs.length)
  }, [allListSongs])

  // Songs to show in the featured "Now Practicing" section (mastery < 100%, not marked known)
  const practiceSongs = useMemo(() => {
    return allListSongs.filter((s) => masteryPercent(s) < 100 && !s.isKnown)
  }, [allListSongs])

  function selectList(id: string | null) {
    setFeaturedListId(id)
    setShowPicker(false)
    if (id) localStorage.setItem('lyrico_featured_list', id)
    else localStorage.removeItem('lyrico_featured_list')
  }

  function toggleMySongs() {
    setMySongsOpen((v) => {
      const next = !v
      localStorage.setItem('lyrico_mysongs_open', String(next))
      return next
    })
  }

  const hasLists = userLists.length > 0 || allPracticeLists.length > 0

  return (
    <div className="flex flex-col gap-4">
      {/* ── Now Practicing section ── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.15em] text-text-dim">Now practicing</h2>
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="text-xs text-accent hover:brightness-110"
          >
            {featuredListId ? 'Change list' : 'Select list'}
          </button>
        </div>

        {/* List picker */}
        {showPicker && (
          <div className="mb-3 rounded-2xl border border-border bg-bg-soft p-3">
            {!hasLists ? (
              <p className="py-2 text-sm text-text-dim">Create a personal list or join a group to get started.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {featuredListId && (
                  <li>
                    <button
                      type="button"
                      onClick={() => selectList(null)}
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-wrong/80 hover:bg-bg-card"
                    >
                      Remove pinned list
                    </button>
                  </li>
                )}
                {userLists.length > 0 && (
                  <>
                    <p className="px-3 pt-1 text-xs text-text-dim/60">My lists</p>
                    {userLists.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => selectList(l.id)}
                          className={`w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-bg-card ${featuredListId === l.id ? 'text-accent' : 'text-text'}`}
                        >
                          {l.name} {featuredListId === l.id && '✓'}
                        </button>
                      </li>
                    ))}
                  </>
                )}
                {allPracticeLists.length > 0 && (
                  <>
                    <p className="px-3 pt-2 text-xs text-text-dim/60">Group practice lists</p>
                    {allPracticeLists.map((l) => {
                      const group = groups.find((g) => g.id === l.groupId)
                      return (
                        <li key={l.id}>
                          <button
                            type="button"
                            onClick={() => selectList(l.id)}
                            className={`w-full rounded-xl px-3 py-2.5 text-left hover:bg-bg-card ${featuredListId === l.id ? 'text-accent' : 'text-text'}`}
                          >
                            <p className="text-sm">{l.name} {featuredListId === l.id && '✓'}</p>
                            {group && <p className="text-xs text-text-dim">{group.name}</p>}
                          </button>
                        </li>
                      )
                    })}
                  </>
                )}
              </ul>
            )}
          </div>
        )}

        {/* Concert readiness bar */}
        {concertReadiness !== null && !fetchingGroup && (
          <div className="mb-3 rounded-2xl border border-border bg-bg-soft px-4 py-3">
            <div className="flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-[0.15em] text-text-dim">Concert readiness</p>
              <p className={`text-lg font-medium ${concertReadiness < 50 ? 'text-wrong' : concertReadiness < 80 ? 'text-accent' : 'text-correct'}`}>
                {concertReadiness}%
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
              <div
                className={`h-full rounded-full transition-[width] ${concertReadiness < 50 ? 'bg-wrong/70' : concertReadiness < 80 ? 'bg-accent' : 'bg-correct'}`}
                style={{ width: `${concertReadiness}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-text-dim">
              {allListSongs.length} song{allListSongs.length !== 1 ? 's' : ''} · {allListSongs.filter((s) => s.isKnown).length} known · {allListSongs.filter((s) => masteryPercent(s) === 100 && !s.isKnown).length} mastered
            </p>
          </div>
        )}

        {/* Featured content */}
        {!featuredListId ? (
          <div className="rounded-2xl border border-dashed border-border bg-bg-soft p-6 text-center">
            <p className="text-sm text-text">No active practice list</p>
            <p className="mt-1 text-xs text-text-dim">Pin one of your lists to see what still needs work.</p>
          </div>
        ) : fetchingGroup ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : practiceSongs.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-soft p-5 text-center">
            <p className="text-2xl">🎉</p>
            <p className="mt-2 text-sm font-medium text-text">
              {featuredListName ? `"${featuredListName}" is fully mastered!` : 'All mastered!'}
            </p>
            <p className="mt-1 text-xs text-text-dim">Every song in this list is at 100%.</p>
          </div>
        ) : (
          <div>
            {featuredListName && (
              <p className="mb-2 truncate text-sm text-text-dim">{featuredListName} · {practiceSongs.length} song{practiceSongs.length !== 1 ? 's' : ''} to work on</p>
            )}
            <ul className="flex flex-col gap-3">
              {practiceSongs.map((song) => (
                <li key={song.id}>
                  <PracticeSongRow song={song} now={now} onOpen={() => onOpen(song.id)} onStudy={() => onStudy(song.id)} onToggleKnown={() => onToggleKnown(song.id)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── My Songs collapsible ── */}
      <section>
        <button
          type="button"
          onClick={toggleMySongs}
          className="mb-2 flex w-full items-center justify-between"
        >
          <h2 className="text-xs uppercase tracking-[0.15em] text-text-dim">
            My songs {songs.length > 0 && `(${songs.length})`}
          </h2>
          <span className="text-xs text-text-dim transition-transform" style={{ display: 'inline-block', transform: mySongsOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            ▾
          </span>
        </button>

        {mySongsOpen && (
          songs.length === 0 ? (
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
                    onTogglePublic={() => onTogglePublic(song.id)}
                  />
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  )
}

// ── Song row variants ─────────────────────────────────────────────────────────

function PracticeSongRow({ song, now, onOpen, onStudy, onToggleKnown }: { song: Song; now: number; onOpen: () => void; onStudy: () => void; onToggleKnown: () => void }) {
  const mastery = masteryPercent(song)
  const concertDays = song.concertDate ? daysUntil(song.concertDate, now) : null
  const urgent = concertDays !== null && concertDays <= 7

  return (
    <div className="rounded-2xl border border-accent/30 bg-bg-soft">
      <button type="button" onClick={onOpen} className="block w-full px-4 pt-4 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-base text-text">{song.title}</h2>
          <span className={`shrink-0 text-sm font-medium ${mastery < 30 ? 'text-wrong' : mastery < 70 ? 'text-accent' : 'text-correct'}`}>
            {mastery}%
          </span>
        </div>
        {song.composer && <p className="mt-0.5 truncate text-xs text-text-dim">{song.composer}</p>}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
          <div
            className={`h-full rounded-full transition-[width] ${mastery < 30 ? 'bg-wrong/70' : mastery < 70 ? 'bg-accent' : 'bg-correct'}`}
            style={{ width: `${mastery}%` }}
          />
        </div>
        {concertDays !== null && (
          <p className={`mt-1.5 text-xs ${urgent ? 'text-wrong' : 'text-text-dim'}`}>
            {urgent ? '⚠ ' : ''}Concert in {Math.max(0, concertDays)}d
          </p>
        )}
      </button>
      <div className="mt-3 flex border-t border-border">
        <button type="button" onClick={onToggleKnown} className="flex-1 py-3 text-sm text-text-dim hover:text-correct">
          Know it ✓
        </button>
        <div className="w-px bg-border" />
        <button type="button" onClick={onStudy} className="flex-[2] py-3 text-sm text-accent hover:brightness-110">
          Study now
        </button>
      </div>
    </div>
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
    <div className="mt-4 rounded-2xl border border-dashed border-border bg-bg-soft p-8 text-center">
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

function FeedbackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
