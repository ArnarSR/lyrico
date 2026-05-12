import { useEffect, useRef, useState } from 'react'
import type { Group, PracticeList, Song, UserList, UserListType } from '../types'
import { masteryPercent } from '../hooks/useSM2'
import { useNow } from '../hooks/useNow'
import { Header, IconButton, Shell } from './Shell'
import { CommunityTab } from './CommunityTab'
import { GroupsTab } from './GroupsTab'
import { FeedbackModal } from './FeedbackModal'

type Tab = 'practice' | 'mine' | 'groups' | 'community'

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
  onCreateUserList: (name: string, listType?: UserListType, concertDate?: number) => Promise<UserList>
  onUpdateUserList: (listId: string, patch: { name?: string; listType?: UserListType; concertDate?: number | null }) => void
  onDeleteUserList: (listId: string) => void
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
  onGetPracticeListSongs, onCreateUserList, onUpdateUserList, onDeleteUserList,
}: SongLibraryProps) {
  const now = useNow()
  const [tab, setTab] = useState<Tab>('practice')
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
            {(tab === 'practice' || tab === 'mine') && (
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
        {([['practice', 'Practice'], ['mine', 'My Songs'], ['groups', 'Groups'], ['community', 'Community']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-xs transition-colors ${tab === t ? 'bg-bg-card text-accent' : 'text-text-dim hover:text-text'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'practice' && (
        <PracticeTab
          songs={songs}
          groups={groups}
          allPracticeLists={allPracticeLists}
          userLists={userLists}
          listSongIds={listSongIds}
          now={now}
          onOpen={onOpen}
          onStudy={onStudy}
          onToggleKnown={onToggleKnown}
          onGetPracticeListSongs={onGetPracticeListSongs}
          onCreateUserList={onCreateUserList}
          onUpdateUserList={onUpdateUserList}
          onDeleteUserList={onDeleteUserList}
        />
      )}

      {tab === 'mine' && (
        <MySongsTab
          songs={songs}
          now={now}
          onOpen={onOpen}
          onStudy={onStudy}
          onAdd={onAdd}
          onTogglePublic={onTogglePublic}
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

// ── Practice tab ──────────────────────────────────────────────────────────────

interface PracticeTabProps {
  songs: Song[]
  groups: Group[]
  allPracticeLists: PracticeList[]
  userLists: UserList[]
  listSongIds: Map<string, Set<string>>
  now: number
  onOpen: (id: string) => void
  onStudy: (id: string) => void
  onToggleKnown: (id: string) => void
  onGetPracticeListSongs: (listId: string) => Promise<Song[]>
  onCreateUserList: (name: string, listType?: UserListType, concertDate?: number) => Promise<UserList>
  onUpdateUserList: (listId: string, patch: { name?: string; listType?: UserListType; concertDate?: number | null }) => void
  onDeleteUserList: (listId: string) => void
}

function PracticeTab({
  songs, groups, allPracticeLists, userLists, listSongIds, now,
  onOpen, onStudy, onToggleKnown, onGetPracticeListSongs,
  onCreateUserList, onUpdateUserList,
}: PracticeTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [fetchedSongs, setFetchedSongs] = useState<Map<string, Song[]>>(new Map())
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [showNewList, setShowNewList] = useState(false)
  const [newType, setNewType] = useState<UserListType>('concert')
  const [newListName, setNewListName] = useState('')
  const [newListDate, setNewListDate] = useState('')
  const [creating, setCreating] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showNewList) nameInputRef.current?.focus()
  }, [showNewList])

  function toggleExpand(id: string) {
    const next = expandedId === id ? null : id
    setExpandedId(next)
    if (next && allPracticeLists.some((l) => l.id === id) && !fetchedSongs.has(id)) {
      setFetchingId(id)
      onGetPracticeListSongs(id).then((s) => {
        setFetchedSongs((prev) => new Map(prev).set(id, s))
        setFetchingId(null)
      })
    }
  }

  function getListSongs(listId: string, isGroup: boolean): Song[] {
    if (isGroup) {
      const raw = fetchedSongs.get(listId) ?? []
      return raw.map((gs) => songs.find((s) => s.id === gs.id) ?? gs)
    }
    const ids = listSongIds.get(listId) ?? new Set<string>()
    return songs.filter((s) => ids.has(s.id))
  }

  async function handleCreateList() {
    if (!newListName.trim()) return
    if (newType === 'concert' && !newListDate) return
    setCreating(true)
    const concertDate = newListDate ? new Date(newListDate).getTime() : undefined
    await onCreateUserList(newListName.trim(), newType, concertDate)
    setNewListName('')
    setNewListDate('')
    setShowNewList(false)
    setCreating(false)
  }

  const concertLists = userLists
    .filter((l) => l.listType === 'concert')
    .sort((a, b) => (a.concertDate ?? Infinity) - (b.concertDate ?? Infinity))
  const standardLists = userLists.filter((l) => l.listType === 'standard')
  const hasLists = userLists.length > 0 || allPracticeLists.length > 0

  return (
    <div className="flex flex-col gap-3">

      {/* ── Concert Repertoire ── */}
      {(concertLists.length > 0 || allPracticeLists.length > 0) && (
        <SectionHeader icon="🎭" label="Concert Repertoire" />
      )}
      {concertLists.map((list) => (
        <PracticeListCard
          key={list.id}
          name={list.name}
          listType="concert"
          listSongs={getListSongs(list.id, false)}
          concertDate={list.concertDate}
          now={now}
          expanded={expandedId === list.id}
          loading={false}
          isOwner
          onToggleExpand={() => toggleExpand(list.id)}
          onStudy={onStudy}
          onOpen={onOpen}
          onToggleKnown={onToggleKnown}
          onUpdateList={(patch) => onUpdateUserList(list.id, patch)}
        />
      ))}
      {allPracticeLists.map((list) => {
        const group = groups.find((g) => g.id === list.groupId)
        return (
          <PracticeListCard
            key={list.id}
            name={list.name}
            subtitle={group?.name}
            listType="concert"
            listSongs={getListSongs(list.id, true)}
            concertDate={undefined}
            now={now}
            expanded={expandedId === list.id}
            loading={fetchingId === list.id}
            isOwner={false}
            onToggleExpand={() => toggleExpand(list.id)}
            onStudy={onStudy}
            onOpen={onOpen}
            onToggleKnown={onToggleKnown}
            onUpdateList={undefined}
          />
        )
      })}

      {/* ── Standard Repertoire ── */}
      {standardLists.length > 0 && (
        <SectionHeader icon="🎵" label="Standard Repertoire" />
      )}
      {standardLists.map((list) => (
        <PracticeListCard
          key={list.id}
          name={list.name}
          listType="standard"
          listSongs={getListSongs(list.id, false)}
          concertDate={undefined}
          now={now}
          expanded={expandedId === list.id}
          loading={false}
          isOwner
          onToggleExpand={() => toggleExpand(list.id)}
          onStudy={onStudy}
          onOpen={onOpen}
          onToggleKnown={onToggleKnown}
          onUpdateList={(patch) => onUpdateUserList(list.id, patch)}
        />
      ))}

      {/* Empty state */}
      {!hasLists && !showNewList && (
        <div className="rounded-2xl border border-dashed border-border bg-bg-soft p-8 text-center">
          <p className="text-text">No practice lists yet</p>
          <p className="mt-2 text-sm text-text-dim">
            Create a Concert list for an upcoming performance, or a Standard list for songs to learn at your own pace.
          </p>
        </div>
      )}

      {/* New list form */}
      {showNewList ? (
        <div className="rounded-2xl border border-border bg-bg-soft p-4">
          {/* Type picker */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setNewType('concert')}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${newType === 'concert' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-dim hover:text-text'}`}
            >
              <p className="text-base">🎭</p>
              <p className="mt-1 text-sm font-medium">Concert</p>
              <p className="text-xs opacity-70">Linked to a date</p>
            </button>
            <button
              type="button"
              onClick={() => setNewType('standard')}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${newType === 'standard' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-dim hover:text-text'}`}
            >
              <p className="text-base">🎵</p>
              <p className="mt-1 text-sm font-medium">Standard</p>
              <p className="text-xs opacity-70">Learn at will</p>
            </button>
          </div>
          <input
            ref={nameInputRef}
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !(newType === 'concert' && !newListDate)) handleCreateList() }}
            placeholder={newType === 'concert' ? 'e.g. Spring Concert 2026' : 'e.g. Favourite Folk Songs'}
            className="mb-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/60 focus:border-accent"
          />
          {newType === 'concert' && (
            <div className="mb-3 flex items-center gap-2">
              <label className="shrink-0 text-xs text-text-dim">Concert date *</label>
              <input
                type="date"
                value={newListDate}
                onChange={(e) => setNewListDate(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowNewList(false); setNewListName(''); setNewListDate('') }}
              className="flex-1 rounded-xl border border-border py-2 text-sm text-text-dim hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!newListName.trim() || (newType === 'concert' && !newListDate) || creating}
              onClick={handleCreateList}
              className="flex-[2] rounded-xl border border-accent/30 bg-accent/15 py-2 text-sm text-accent disabled:opacity-40 hover:bg-accent/25"
            >
              {creating ? 'Creating…' : 'Create list'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNewList(true)}
          className="rounded-2xl border border-dashed border-border py-3 text-sm text-text-dim hover:border-accent/50 hover:text-accent"
        >
          + New list
        </button>
      )}
    </div>
  )
}

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <p className="text-xs uppercase tracking-[0.15em] text-text-dim">{label}</p>
    </div>
  )
}

// ── Practice list card (expandable) ──────────────────────────────────────────

interface PracticeListCardProps {
  name: string
  subtitle?: string
  listType: UserListType
  listSongs: Song[]
  concertDate?: number
  now: number
  expanded: boolean
  loading: boolean
  isOwner: boolean
  onToggleExpand: () => void
  onStudy: (id: string) => void
  onOpen: (id: string) => void
  onToggleKnown: (id: string) => void
  onUpdateList?: (patch: { concertDate?: number | null }) => void
}

function PracticeListCard({
  name, subtitle, listType, listSongs, concertDate, now, expanded, loading, isOwner,
  onToggleExpand, onStudy, onOpen, onToggleKnown, onUpdateList,
}: PracticeListCardProps) {
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState(
    concertDate ? new Date(concertDate).toISOString().split('T')[0] : '',
  )

  useEffect(() => {
    setDateValue(concertDate ? new Date(concertDate).toISOString().split('T')[0] : '')
  }, [concertDate])

  useEffect(() => {
    if (!expanded) setEditingDate(false)
  }, [expanded])

  const readiness = listSongs.length > 0
    ? Math.round(listSongs.reduce((sum, s) => sum + (s.isKnown ? 100 : masteryPercent(s)), 0) / listSongs.length)
    : null

  const daysLeft = listType === 'concert' && concertDate ? daysUntil(concertDate, now) : null
  const practiceSongs = listSongs.filter((s) => !s.isKnown && masteryPercent(s) < 100)
  const knownCount = listSongs.filter((s) => s.isKnown).length
  const masteredCount = listSongs.filter((s) => masteryPercent(s) === 100 && !s.isKnown).length
  const songsPerDay = (daysLeft !== null && daysLeft > 0 && practiceSongs.length > 0)
    ? Math.ceil(practiceSongs.length / daysLeft)
    : null

  const readinessColor = readiness === null ? '' : readiness < 50 ? 'text-wrong' : readiness < 80 ? 'text-accent' : 'text-correct'
  const barColor = readiness === null ? '' : readiness < 50 ? 'bg-wrong/70' : readiness < 80 ? 'bg-accent' : 'bg-correct'
  const daysColor = daysLeft === null ? '' : daysLeft <= 7 ? 'text-wrong' : daysLeft <= 30 ? 'text-accent' : 'text-text-dim'
  const isPast = listType === 'concert' && daysLeft !== null && daysLeft < 0

  function handleSaveDate() {
    const d = dateValue ? new Date(dateValue).getTime() : null
    onUpdateList?.({ concertDate: d })
    setEditingDate(false)
  }

  return (
    <div className={`overflow-hidden rounded-2xl border bg-bg-soft transition-opacity ${listType === 'concert' ? 'border-accent/25' : 'border-border'} ${isPast ? 'opacity-60' : ''}`}>
      {/* Clickable header */}
      <button type="button" onClick={onToggleExpand} className="w-full px-4 pt-4 pb-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base text-text">{name}</h3>
            {subtitle && <p className="text-xs text-text-dim">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {readiness !== null && (
              <span className={`text-sm font-medium ${readinessColor}`}>{readiness}%</span>
            )}
            <span className="text-xs text-text-dim">{expanded ? '▾' : '▸'}</span>
          </div>
        </div>

        {/* Progress bar */}
        {readiness !== null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
            <div
              className={`h-full rounded-full transition-[width] ${barColor}`}
              style={{ width: `${readiness}%` }}
            />
          </div>
        )}

        {/* Stats row */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {daysLeft !== null && (
            <span className={daysColor}>
              🗓 {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Concert today!' : 'Concert passed'}
            </span>
          )}
          {listType === 'concert' && !concertDate && isOwner && (
            <span className="text-wrong/70">No concert date set</span>
          )}
          {songsPerDay !== null && (
            <span className="text-text-dim">{songsPerDay} song{songsPerDay !== 1 ? 's' : ''}/day to be ready</span>
          )}
          {listSongs.length > 0 && (
            <span className="text-text-dim/60">
              {listSongs.length} song{listSongs.length !== 1 ? 's' : ''} · {knownCount} known · {masteredCount} mastered
            </span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border">
          {loading ? (
            <p className="px-4 py-4 text-sm text-text-dim">Loading…</p>
          ) : practiceSongs.length === 0 && listSongs.length > 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-xl">🎉</p>
              <p className="mt-1 text-sm text-text">All songs mastered!</p>
              <p className="text-xs text-text-dim">Every song in this list is at 100%.</p>
            </div>
          ) : listSongs.length === 0 ? (
            <p className="px-4 py-4 text-sm text-text-dim">No songs in this list yet.</p>
          ) : (
            <ul>
              {practiceSongs.map((song) => {
                const mastery = masteryPercent(song)
                const mColor = mastery < 30 ? 'text-wrong' : mastery < 70 ? 'text-accent' : 'text-correct'
                return (
                  <li key={song.id} className="flex items-center justify-between border-b border-border/40 px-4 py-3 last:border-b-0">
                    <button type="button" onClick={() => onOpen(song.id)} className="min-w-0 text-left">
                      <p className="truncate text-sm text-text">{song.title}</p>
                      <p className={`text-xs ${mColor}`}>{mastery}%</p>
                    </button>
                    <div className="ml-3 flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleKnown(song.id)}
                        className="rounded-full border border-border px-2.5 py-1 text-xs text-text-dim hover:border-correct/50 hover:text-correct"
                      >
                        Know it
                      </button>
                      <button
                        type="button"
                        onClick={() => onStudy(song.id)}
                        className="rounded-full border border-accent/30 bg-accent/15 px-2.5 py-1 text-xs text-accent hover:bg-accent/25"
                      >
                        Study
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Concert date editor (concert-type owned lists only) */}
          {isOwner && listType === 'concert' && (
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
                  <button type="button" onClick={handleSaveDate} className="text-sm text-accent hover:brightness-110">Save</button>
                  <button type="button" onClick={() => setEditingDate(false)} className="text-sm text-text-dim">✕</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDate(true)}
                  className="text-xs text-text-dim/50 hover:text-text-dim"
                >
                  {concertDate ? '✏ Edit concert date' : '+ Set concert date'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── My Songs tab ──────────────────────────────────────────────────────────────

interface MySongsTabProps {
  songs: Song[]
  now: number
  onOpen: (id: string) => void
  onStudy: (id: string) => void
  onAdd: () => void
  onTogglePublic: (id: string) => void
}

function MySongsTab({ songs, now, onOpen, onStudy, onAdd, onTogglePublic }: MySongsTabProps) {
  return (
    <div>
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
                onTogglePublic={() => onTogglePublic(song.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Song row ──────────────────────────────────────────────────────────────────

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
