import { useEffect, useMemo, useRef, useState } from 'react'
import type { Group, PendingApproval, PracticeList, Song, SongInList, UserList, UserListType } from '../types'
import { masteryPercent } from '../hooks/useSM2'
import { useNow } from '../hooks/useNow'
import { Header, IconButton, Shell } from './Shell'
import { CreateListForm } from './CreateListForm'
import { formatDateInput, parseDateInput } from '../lib/dates'
import { GroupsTab } from './GroupsTab'
import { FeedbackModal } from './FeedbackModal'
import { StudyStatsBanner } from './StudyStatsBanner'

type Tab = 'practice' | 'mine' | 'lists' | 'groups'

interface SongLibraryProps {
  songs: Song[]
  groups: Group[]
  groupsLoading: boolean
  allPracticeLists: PracticeList[]
  userLists: UserList[]
  listSongIds: Map<string, Set<string>>
  pendingApprovals: PendingApproval[]
  onOpen: (songId: string) => void
  onStudy: (songId: string) => void
  onAdd: () => void
  onSignOut: () => void
  onOpenProfile: () => void
  profileInitial: string
  streak: number
  todayCount: number
  dailyGoal: number
  onOpenGroup: (group: Group) => void
  onCreateGroup: (name: string, description?: string) => Promise<unknown>
  onJoinGroup: (inviteCode: string) => Promise<Group | null>
  onTogglePublic: (songId: string) => void
  onToggleKnown: (songId: string) => void
  onGetPracticeListSongs: (listId: string) => Promise<SongInList[]>
  onCreateUserList: (name: string, listType?: UserListType, concertDate?: number) => Promise<UserList>
  onUpdateUserList: (listId: string, patch: { name?: string; listType?: UserListType; concertDate?: number | null }) => void
  onDeleteUserList: (listId: string) => void
  onAddSongToUserList: (listId: string, songId: string) => Promise<void>
  onRemoveSongFromUserList: (listId: string, songId: string) => Promise<void>
  onOpenPracticeList: (list: PracticeList) => void
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
  songs, groups, groupsLoading, allPracticeLists, userLists, listSongIds, pendingApprovals,
  onOpen, onStudy, onAdd, onSignOut, onOpenProfile, profileInitial,
  streak, todayCount, dailyGoal,
  onOpenGroup, onCreateGroup, onJoinGroup, onTogglePublic, onToggleKnown,
  onGetPracticeListSongs, onCreateUserList, onUpdateUserList, onDeleteUserList,
  onAddSongToUserList, onRemoveSongFromUserList, onOpenPracticeList,
}: SongLibraryProps) {
  // onSignOut is still accepted but no longer used in the header; sign-out lives in Profile now
  void onSignOut
  const now = useNow()
  const [tab, setTab] = useState<Tab>('practice')
  const [showFeedback, setShowFeedback] = useState(false)
  const [approvalBannerDismissed, setApprovalBannerDismissed] = useState(false)

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
            <button
              type="button"
              aria-label="Profile"
              onClick={onOpenProfile}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              {profileInitial}
            </button>
          </div>
        }
      />

      {/* Pending approvals notification */}
      {!approvalBannerDismissed && pendingApprovals.length > 0 && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">
              {pendingApprovals.reduce((s, pa) => s + pa.count, 0)} song{pendingApprovals.reduce((s, pa) => s + pa.count, 0) !== 1 ? 's' : ''} awaiting approval
            </p>
            <p className="mt-0.5 text-xs text-text-dim">
              {pendingApprovals.map((pa) => `${pa.practiceListName} · ${pa.groupName}`).join(' / ')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const first = pendingApprovals[0]
                const list = allPracticeLists.find((l) => l.id === first.practiceListId)
                if (list) onOpenPracticeList(list)
              }}
              className="rounded-full border border-accent bg-accent/15 px-3 py-1.5 text-xs text-accent hover:bg-accent/25"
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => setApprovalBannerDismissed(true)}
              className="text-text-dim/40 hover:text-text-dim"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {tab === 'practice' && (
        <StudyStatsBanner
          streak={streak}
          todayCount={todayCount}
          dailyGoal={dailyGoal}
          userLists={userLists}
          allPracticeLists={allPracticeLists}
          songs={songs}
          listSongIds={listSongIds}
        />
      )}

      {/* Tab bar */}
      <div className="mb-5 flex gap-1 rounded-xl border border-border bg-bg-soft p-1">
        {([['practice', 'Practice'], ['mine', 'My Songs'], ['lists', 'Lists'], ['groups', 'Groups']] as [Tab, string][]).map(([t, label]) => (
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

      {tab === 'lists' && (
        <ListsTab
          songs={songs}
          userLists={userLists}
          listSongIds={listSongIds}
          groups={groups}
          allPracticeLists={allPracticeLists}
          now={now}
          onOpen={onOpen}
          onStudy={onStudy}
          onCreateUserList={onCreateUserList}
          onUpdateUserList={onUpdateUserList}
          onDeleteUserList={onDeleteUserList}
          onAddSongToList={onAddSongToUserList}
          onRemoveSongFromList={onRemoveSongFromUserList}
          onOpenPracticeList={onOpenPracticeList}
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
  onGetPracticeListSongs: (listId: string) => Promise<SongInList[]>
  onCreateUserList: (name: string, listType?: UserListType, concertDate?: number) => Promise<UserList>
  onUpdateUserList: (listId: string, patch: { name?: string; listType?: UserListType; concertDate?: number | null }) => void
  onDeleteUserList: (listId: string) => void
}

function PracticeTab({
  songs, groups, allPracticeLists, userLists, listSongIds, now,
  onOpen, onStudy, onToggleKnown, onGetPracticeListSongs,
  onCreateUserList, onUpdateUserList,
}: PracticeTabProps) {
  const mySongIds = useMemo(() => new Set(songs.map((s) => s.id)), [songs])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [fetchedSongs, setFetchedSongs] = useState<Map<string, SongInList[]>>(new Map())
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [showNewList, setShowNewList] = useState(false)

  // Prefetch songs for every group practice list so readiness shows on all cards
  useEffect(() => {
    let cancelled = false
    const toFetch = allPracticeLists.filter((l) => !fetchedSongs.has(l.id))
    if (toFetch.length === 0) return
    Promise.all(
      toFetch.map((l) => onGetPracticeListSongs(l.id).then((s) => [l.id, s] as const)),
    ).then((results) => {
      if (cancelled) return
      setFetchedSongs((prev) => {
        const map = new Map(prev)
        for (const [id, s] of results) map.set(id, s)
        return map
      })
    })
    return () => { cancelled = true }
  }, [allPracticeLists, onGetPracticeListSongs, fetchedSongs])

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

  // Resolve a personal user list against its source group practice list (if any).
  // Personal copies sync name/date/type from the group source so changes the
  // admin makes propagate without a re-copy.
  function resolveListMeta(list: UserList): { name: string; listType: UserListType; concertDate: number | undefined; sourceGroupName?: string; isSynced: boolean } {
    if (list.sourcePracticeListId) {
      const source = allPracticeLists.find((pl) => pl.id === list.sourcePracticeListId)
      if (source) {
        const sourceGroup = groups.find((g) => g.id === source.groupId)
        return {
          name: source.name,
          listType: source.listType,
          concertDate: source.concertDate,
          sourceGroupName: sourceGroup?.name,
          isSynced: true,
        }
      }
    }
    return { name: list.name, listType: list.listType, concertDate: list.concertDate, isSynced: false }
  }

  const resolvedUserLists = userLists.map((l) => ({ list: l, meta: resolveListMeta(l) }))
  const concertLists = resolvedUserLists
    .filter(({ meta }) => meta.listType === 'concert')
    .sort((a, b) => (a.meta.concertDate ?? Infinity) - (b.meta.concertDate ?? Infinity))
  const standardLists = resolvedUserLists.filter(({ meta }) => meta.listType === 'standard')
  const hasLists = userLists.length > 0 || allPracticeLists.length > 0

  return (
    <div className="flex flex-col gap-3">

      {/* ── Concert Repertoire ── */}
      {(concertLists.length > 0 || allPracticeLists.length > 0) && (
        <SectionHeader icon="🎭" label="Concert Repertoire" />
      )}
      {concertLists.map(({ list, meta }) => (
        <PracticeListCard
          key={list.id}
          name={meta.name}
          subtitle={meta.isSynced ? `Synced from ${meta.sourceGroupName ?? 'group'}` : undefined}
          listType="concert"
          listSongs={getListSongs(list.id, false)}
          concertDate={meta.concertDate}
          now={now}
          expanded={expandedId === list.id}
          loading={false}
          isOwner={!meta.isSynced /* synced copies can't be edited locally */}
          onToggleExpand={() => toggleExpand(list.id)}
          onStudy={onStudy}
          onOpen={onOpen}
          onToggleKnown={onToggleKnown}
          onUpdateList={(patch) => onUpdateUserList(list.id, patch)}
        />
      ))}
      {/* Group practice lists not already shown as a personal copy */}
      {allPracticeLists.filter((l) => l.listType === 'concert' && !userLists.some((ul) => ul.sourcePracticeListId === l.id)).map((list) => {
        const group = groups.find((g) => g.id === list.groupId)
        return (
          <PracticeListCard
            key={list.id}
            name={list.name}
            subtitle={group?.name}
            listType="concert"
            listSongs={getListSongs(list.id, true)}
            concertDate={list.concertDate}
            now={now}
            expanded={expandedId === list.id}
            loading={fetchingId === list.id}
            isOwner={false}
            mySongIds={mySongIds}
            onToggleExpand={() => toggleExpand(list.id)}
            onStudy={onStudy}
            onOpen={onOpen}
            onToggleKnown={onToggleKnown}
            onUpdateList={undefined}
          />
        )
      })}

      {/* ── Standard Repertoire ── */}
      {(standardLists.length > 0 || allPracticeLists.some((l) => l.listType === 'standard')) && (
        <SectionHeader icon="🎵" label="Standard Repertoire" />
      )}
      {allPracticeLists.filter((l) => l.listType === 'standard' && !userLists.some((ul) => ul.sourcePracticeListId === l.id)).map((list) => {
        const group = groups.find((g) => g.id === list.groupId)
        return (
          <PracticeListCard
            key={list.id}
            name={list.name}
            subtitle={group?.name}
            listType="standard"
            listSongs={getListSongs(list.id, true)}
            concertDate={undefined}
            now={now}
            expanded={expandedId === list.id}
            loading={fetchingId === list.id}
            isOwner={false}
            mySongIds={mySongIds}
            onToggleExpand={() => toggleExpand(list.id)}
            onStudy={onStudy}
            onOpen={onOpen}
            onToggleKnown={onToggleKnown}
            onUpdateList={undefined}
          />
        )
      })}
      {standardLists.map(({ list, meta }) => (
        <PracticeListCard
          key={list.id}
          name={meta.name}
          subtitle={meta.isSynced ? `Synced from ${meta.sourceGroupName ?? 'group'}` : undefined}
          listType="standard"
          listSongs={getListSongs(list.id, false)}
          concertDate={undefined}
          now={now}
          expanded={expandedId === list.id}
          loading={false}
          isOwner={!meta.isSynced}
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
        <CreateListForm
          onSave={async (name, listType, concertDate) => {
            await onCreateUserList(name, listType, concertDate)
            setShowNewList(false)
          }}
          onCancel={() => setShowNewList(false)}
        />
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
  mySongIds?: Set<string>
  onToggleExpand: () => void
  onStudy: (id: string) => void
  onOpen: (id: string) => void
  onToggleKnown: (id: string) => void
  onUpdateList?: (patch: { concertDate?: number | null }) => void
}

function PracticeListCard({
  name, subtitle, listType, listSongs, concertDate, now, expanded, loading, isOwner, mySongIds,
  onToggleExpand, onStudy, onOpen, onToggleKnown, onUpdateList,
}: PracticeListCardProps) {
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState(
    concertDate ? formatDateInput(concertDate) : '',
  )

  useEffect(() => {
    setDateValue(concertDate ? formatDateInput(concertDate) : '')
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
    const d = dateValue ? parseDateInput(dateValue) : null
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
              <span className={`text-sm font-medium ${readinessColor}`}>
                <span className="text-text-dim/70">{listType === 'concert' ? 'Concert readiness' : 'Repertoire readiness'} </span>
                {readiness}%
              </span>
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
                      {(!mySongIds || mySongIds.has(song.id)) && (
                        <button
                          type="button"
                          onClick={() => onStudy(song.id)}
                          className="rounded-full border border-accent/30 bg-accent/15 px-2.5 py-1 text-xs text-accent hover:bg-accent/25"
                        >
                          Study
                        </button>
                      )}
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
                  <button type="button" onClick={handleSaveDate} className="rounded-lg px-3 py-1 text-sm text-accent hover:bg-accent/10">Save</button>
                  <button type="button" onClick={() => setEditingDate(false)} className="rounded-lg px-3 py-1 text-sm text-text-dim hover:bg-bg-card">Cancel</button>
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

// ── Lists tab (management) ────────────────────────────────────────────────────

interface ListsTabProps {
  songs: Song[]
  userLists: UserList[]
  listSongIds: Map<string, Set<string>>
  groups: Group[]
  allPracticeLists: PracticeList[]
  now: number
  onOpen: (id: string) => void
  onStudy: (id: string) => void
  onCreateUserList: (name: string, listType?: UserListType, concertDate?: number) => Promise<UserList>
  onUpdateUserList: (listId: string, patch: { name?: string; listType?: UserListType; concertDate?: number | null }) => void
  onDeleteUserList: (listId: string) => void
  onAddSongToList: (listId: string, songId: string) => Promise<void>
  onRemoveSongFromList: (listId: string, songId: string) => Promise<void>
  onOpenPracticeList: (list: PracticeList) => void
}

function ListsTab({
  songs, userLists, listSongIds, groups, allPracticeLists, now,
  onOpen, onStudy,
  onCreateUserList, onUpdateUserList, onDeleteUserList,
  onAddSongToList, onRemoveSongFromList, onOpenPracticeList,
}: ListsTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingToId, setAddingToId] = useState<string | null>(null)
  const [addSearch, setAddSearch] = useState('')
  const [editingDateId, setEditingDateId] = useState<string | null>(null)
  const [dateValue, setDateValue] = useState('')
  const [showNewList, setShowNewList] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (renamingId) renameInputRef.current?.focus() }, [renamingId])

  function startRename(list: UserList) {
    setRenamingId(list.id)
    setRenameValue(list.name)
    setExpandedId(list.id)
  }

  function saveRename(listId: string) {
    if (renameValue.trim()) onUpdateUserList(listId, { name: renameValue.trim() })
    setRenamingId(null)
  }

  function startEditDate(list: UserList) {
    setEditingDateId(list.id)
    setDateValue(list.concertDate ? formatDateInput(list.concertDate) : '')
    setExpandedId(list.id)
  }

  function saveDate(listId: string) {
    const d = dateValue ? parseDateInput(dateValue) : null
    onUpdateUserList(listId, { concertDate: d })
    setEditingDateId(null)
  }

  function confirmDelete(listId: string) {
    onDeleteUserList(listId)
    setDeletingId(null)
    if (expandedId === listId) setExpandedId(null)
  }

  function getListSongs(listId: string): Song[] {
    const ids = listSongIds.get(listId) ?? new Set<string>()
    return songs.filter((s) => ids.has(s.id))
  }

  function getPickableSongs(listId: string): Song[] {
    const ids = listSongIds.get(listId) ?? new Set<string>()
    const q = addSearch.toLowerCase()
    return songs.filter((s) => !ids.has(s.id) && (!q || s.title.toLowerCase().includes(q) || (s.composer ?? '').toLowerCase().includes(q)))
  }

  const concertLists = userLists.filter((l) => l.listType === 'concert')
    .sort((a, b) => (a.concertDate ?? Infinity) - (b.concertDate ?? Infinity))
  const standardLists = userLists.filter((l) => l.listType === 'standard')

  function renderList(list: UserList) {
    const listSongs = getListSongs(list.id)
    const readiness = listSongs.length > 0
      ? Math.round(listSongs.reduce((sum, s) => sum + (s.isKnown ? 100 : masteryPercent(s)), 0) / listSongs.length)
      : null
    const daysLeft = list.listType === 'concert' && list.concertDate ? daysUntil(list.concertDate, now) : null
    const rColor = readiness === null ? '' : readiness < 50 ? 'text-wrong' : readiness < 80 ? 'text-accent' : 'text-correct'
    const bColor = readiness === null ? '' : readiness < 50 ? 'bg-wrong/70' : readiness < 80 ? 'bg-accent' : 'bg-correct'
    const dColor = daysLeft === null ? '' : daysLeft <= 7 ? 'text-wrong' : daysLeft <= 30 ? 'text-accent' : 'text-text-dim'
    const expanded = expandedId === list.id
    const isRenaming = renamingId === list.id
    const isEditingDate = editingDateId === list.id
    const isDeleting = deletingId === list.id
    const isAddingTo = addingToId === list.id

    return (
      <div key={list.id} className={`overflow-hidden rounded-2xl border bg-bg-soft ${list.listType === 'concert' ? 'border-accent/25' : 'border-border'}`}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start gap-2">
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveRename(list.id); if (e.key === 'Escape') setRenamingId(null) }}
                onBlur={() => saveRename(list.id)}
                className="min-w-0 flex-1 rounded-lg border border-accent bg-bg px-2 py-0.5 text-base text-text focus:outline-none"
              />
            ) : (
              <button type="button" onClick={() => setExpandedId(expanded ? null : list.id)} className="min-w-0 flex-1 text-left">
                <h3 className="truncate text-base text-text">{list.name}</h3>
              </button>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {readiness !== null && (
                <span className={`text-sm font-medium ${rColor}`}>{readiness}%</span>
              )}
              <button type="button" onClick={() => startRename(list)} className="rounded p-0.5 text-text-dim/50 hover:text-text-dim" title="Rename">
                <PencilIcon />
              </button>
              {isDeleting ? (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => confirmDelete(list.id)} className="text-xs text-wrong hover:brightness-110">Delete?</button>
                  <button type="button" onClick={() => setDeletingId(null)} className="text-xs text-text-dim">✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setDeletingId(list.id)} className="rounded p-0.5 text-text-dim/50 hover:text-wrong" title="Delete list">
                  <TrashIcon />
                </button>
              )}
              <button type="button" onClick={() => setExpandedId(expanded ? null : list.id)} className="text-xs text-text-dim">
                {expanded ? '▾' : '▸'}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {readiness !== null && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
              <div className={`h-full rounded-full transition-[width] ${bColor}`} style={{ width: `${readiness}%` }} />
            </div>
          )}

          {/* Meta row */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-dim">
            {daysLeft !== null && <span className={dColor}>🗓 {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Concert today!' : 'Concert passed'}</span>}
            {list.listType === 'concert' && !list.concertDate && <span className="text-wrong/70">No concert date set</span>}
            <span>{listSongs.length} song{listSongs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Expanded body */}
        {expanded && (
          <div className="border-t border-border">
            {/* Concert date editor */}
            {list.listType === 'concert' && (
              <div className="border-b border-border/40 px-4 py-3">
                {isEditingDate ? (
                  <div className="flex items-center gap-2">
                    <label className="shrink-0 text-xs text-text-dim">Concert date</label>
                    <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text focus:border-accent" />
                    <button type="button" onClick={() => saveDate(list.id)} className="rounded-lg px-3 py-1 text-sm text-accent hover:bg-accent/10">Save</button>
                    <button type="button" onClick={() => setEditingDateId(null)} className="rounded-lg px-3 py-1 text-sm text-text-dim hover:bg-bg-card">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => startEditDate(list)} className="text-xs text-text-dim/50 hover:text-text-dim">
                    {list.concertDate
                      ? `🗓 ${new Date(list.concertDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} — edit`
                      : '+ Set concert date'}
                  </button>
                )}
              </div>
            )}

            {/* Song list */}
            {listSongs.length === 0 ? (
              <p className="px-4 py-4 text-sm text-text-dim">No songs yet — add some below.</p>
            ) : (
              <ul>
                {listSongs.map((song) => {
                  const m = masteryPercent(song)
                  const mc = m < 30 ? 'text-wrong' : m < 70 ? 'text-accent' : 'text-correct'
                  return (
                    <li key={song.id} className="flex items-center justify-between border-b border-border/40 px-4 py-3 last:border-b-0">
                      <button type="button" onClick={() => onOpen(song.id)} className="min-w-0 text-left">
                        <p className="truncate text-sm text-text">{song.title}</p>
                        <p className={`text-xs ${mc}`}>{m}%</p>
                      </button>
                      <div className="ml-3 flex shrink-0 items-center gap-2">
                        <button type="button" onClick={() => onStudy(song.id)} className="text-xs text-accent hover:brightness-110">Study</button>
                        <button type="button" onClick={() => onRemoveSongFromList(list.id, song.id)} className="text-xs text-text-dim/50 hover:text-wrong">✕</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Add songs */}
            {isAddingTo ? (
              <div className="border-t border-border/40 p-3">
                <input
                  type="search"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Search your songs…"
                  autoFocus
                  className="mb-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/60 focus:border-accent"
                />
                {getPickableSongs(list.id).length === 0 ? (
                  <p className="py-2 text-center text-sm text-text-dim">{addSearch ? 'No matches' : 'All songs already in this list'}</p>
                ) : (
                  <ul className="max-h-48 overflow-y-auto">
                    {getPickableSongs(list.id).map((song) => (
                      <li key={song.id}>
                        <button type="button" onClick={() => onAddSongToList(list.id, song.id)}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-bg-card">
                          <p className="truncate text-sm text-text">{song.title}</p>
                          <span className="ml-2 shrink-0 text-xs text-accent">+ Add</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => { setAddingToId(null); setAddSearch('') }}
                  className="mt-2 w-full text-center text-xs text-text-dim hover:text-text">Done adding</button>
              </div>
            ) : (
              <div className="border-t border-border/40 px-4 py-3">
                <button type="button" onClick={() => { setAddingToId(list.id); setAddSearch('') }}
                  className="text-xs text-accent hover:brightness-110">+ Add songs</button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Group practice lists — one section per group
  const groupsWithLists = groups
    .map((g) => ({ group: g, lists: allPracticeLists.filter((l) => l.groupId === g.id) }))
    .filter(({ lists }) => lists.length > 0)

  return (
    <div className="flex flex-col gap-3">

      {/* ── Group lists ─────────────────────────────────────── */}
      {groupsWithLists.length > 0 && (
        <>
          <SectionHeader icon="👥" label="Group Lists" />
          {groupsWithLists.map(({ group, lists }) => (
            <div key={group.id}>
              <p className="mb-1.5 px-1 text-xs text-text-dim/60">{group.name}</p>
              <ul className="flex flex-col gap-2">
                {lists.map((list) => {
                  const daysLeft = list.listType === 'concert' && list.concertDate ? daysUntil(list.concertDate, now) : null
                  const dColor = daysLeft === null ? '' : daysLeft <= 7 ? 'text-wrong' : daysLeft <= 30 ? 'text-accent' : 'text-text-dim'
                  return (
                    <li key={list.id}>
                      <button
                        type="button"
                        onClick={() => onOpenPracticeList(list)}
                        className={`w-full overflow-hidden rounded-xl border bg-bg-soft px-4 py-3 text-left hover:brightness-110 ${list.listType === 'concert' ? 'border-accent/25' : 'border-border'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm text-text">{list.name}</p>
                          <span className="shrink-0 text-xs text-text-dim/60">{list.listType === 'concert' ? '🎭' : '🎵'}</span>
                        </div>
                        {list.listType === 'concert' && (
                          <p className={`mt-0.5 text-xs ${daysLeft !== null ? dColor : 'text-wrong/70'}`}>
                            {daysLeft !== null
                              ? (daysLeft > 0 ? `🗓 ${daysLeft}d left` : daysLeft === 0 ? 'Concert today!' : 'Concert passed')
                              : 'No concert date set'}
                          </p>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <div className="my-1 h-px bg-border/40" />
        </>
      )}

      {/* ── My lists ────────────────────────────────────────── */}
      {(concertLists.length > 0 || standardLists.length > 0) && (
        <SectionHeader icon="🗂" label="My Lists" />
      )}
      {concertLists.length > 0 && <SectionHeader icon="🎭" label="Concert Repertoire" />}
      {concertLists.map(renderList)}

      {standardLists.length > 0 && <SectionHeader icon="🎵" label="Standard Repertoire" />}
      {standardLists.map(renderList)}

      {userLists.length === 0 && allPracticeLists.length === 0 && !showNewList && (
        <div className="rounded-2xl border border-dashed border-border bg-bg-soft p-8 text-center">
          <p className="text-text">No lists yet</p>
          <p className="mt-2 text-sm text-text-dim">Create a Concert list for a performance or a Standard list for ongoing repertoire.</p>
        </div>
      )}

      {/* New list form */}
      {showNewList ? (
        <CreateListForm
          onSave={async (name, listType, concertDate) => {
            await onCreateUserList(name, listType, concertDate)
            setShowNewList(false)
          }}
          onCancel={() => setShowNewList(false)}
        />
      ) : (
        <button type="button" onClick={() => setShowNewList(true)}
          className="rounded-2xl border border-dashed border-border py-3 text-sm text-text-dim hover:border-accent/50 hover:text-accent">
          + New list
        </button>
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

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
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

