import { Component, useCallback, useEffect, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useAuth } from './hooks/useAuth'
import { useStorage } from './hooks/useStorage'
import { useGroups } from './hooks/useGroups'
import { Auth } from './components/Auth'
import { Onboarding } from './components/Onboarding'
import { SongLibrary } from './components/SongLibrary'
import { AddSong } from './components/AddSong'
import { StudySession } from './components/StudySession'
import { StanzaSession } from './components/StanzaSession'
import { TestSession } from './components/TestSession'
import { SongStats } from './components/SongStats'
import { GroupDetail } from './components/GroupDetail'
import { PracticeListDetail } from './components/PracticeListDetail'
import { EditLyrics } from './components/EditLyrics'
import { getStanzaLineRange } from './lib/stanzas'
import { trackSongAdded, trackSongDeleted, trackLyricsEdited, trackViewChanged, trackPracticeListStudy } from './lib/analytics'
import type { Group, PracticeList } from './types'

type View =
  | { name: 'library' }
  | { name: 'add' }
  | { name: 'stats'; songId: string }
  | { name: 'study'; songId: string; stanzaIdx?: number; returnTo?: View }
  | { name: 'stanza'; songId: string }
  | { name: 'test'; songId: string }
  | { name: 'edit-lyrics'; songId: string }
  | { name: 'group'; group: Group }
  | { name: 'practice-list'; list: PracticeList }

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('App crash:', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg text-text">Something went wrong</p>
          <p className="max-w-sm text-sm text-text-dim">{this.state.error.message}</p>
          <button onClick={() => { this.setState({ error: null }); window.location.reload() }}
            className="rounded-full border border-accent bg-accent/15 px-6 py-2 text-accent">
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-text-dim">Loading…</p>
      </div>
    )
  }

  if (!user) return <Auth />

  return (
    <ErrorBoundary>
      <AppInner userId={user.id} onSignOut={signOut} />
    </ErrorBoundary>
  )
}

function AppInner({ userId, onSignOut }: { userId: string; onSignOut: () => void }) {
  const onboardingKey = `lyrico_onboarded_${userId}`
  const [onboarded, setOnboarded] = useState(true) // onboarding disabled for now
  const {
    songs, userLists, listSongIds, loading: songsLoading,
    addSong, cloneSong, updateSong, updateCard, deleteSong, getSong, masterSong,
    editSongLines,
    createUserList, updateUserList, deleteUserList, addSongToUserList, removeSongFromUserList,
  } = useStorage(userId)
  const {
    myGroups, allPracticeLists, loading: groupsLoading,
    createGroup, joinGroup, leaveGroup,
    getGroupDetails, createPracticeList, updatePracticeList,
    getPracticeListSongs, addSongToPracticeList, removeSongFromPracticeList,
  } = useGroups(userId)
  const [view, setViewRaw] = useState<View>({ name: 'library' })
  const setView = useCallback((v: View | ((prev: View) => View)) => {
    setViewRaw((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      trackViewChanged(next.name)
      return next
    })
  }, [])

  // These hooks must be before any early returns (React rules of hooks)
  useEffect(() => {
    if (songsLoading) return
    if ('songId' in view && !getSong(view.songId)) {
      setView({ name: 'library' })
    }
  }, [songsLoading, view, getSong, setView])

  const handleGetGroupDetails = useCallback(getGroupDetails, [getGroupDetails])
  const mySongIds = new Set(songs.map((s) => s.id))

  if (!onboarded) {
    return (
      <Onboarding
        onDone={() => {
          localStorage.setItem(onboardingKey, 'true')
          setOnboarded(true)
        }}
      />
    )
  }

  if (songsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-text-dim">Loading…</p>
      </div>
    )
  }

  if (view.name === 'add') {
    return (
      <AddSong
        onCancel={() => setView({ name: 'library' })}
        onSave={(input) => {
          const song = addSong(input)
          trackSongAdded(song.id, song.cards.length, !!input.audioUrl, !!input.isPublic)
          setView({ name: 'stats', songId: song.id })
        }}
      />
    )
  }

  if (view.name === 'test') {
    const song = getSong(view.songId)
    if (!song) return null
    return (
      <TestSession
        song={song}
        onExit={() => setView({ name: 'stats', songId: view.songId })}
        onMasterSong={() => masterSong(view.songId)}
      />
    )
  }

  if (view.name === 'stanza') {
    const song = getSong(view.songId)
    if (!song) return null
    return (
      <StanzaSession
        song={song}
        onExit={() => setView({ name: 'stats', songId: view.songId })}
      />
    )
  }

  if (view.name === 'study') {
    const song = getSong(view.songId)
    if (!song) return null
    const activeCards =
      view.stanzaIdx !== undefined
        ? (() => {
            const [from, to] = getStanzaLineRange(song.lyrics, view.stanzaIdx)
            return song.cards.filter((c) => c.lineIndex >= from && c.lineIndex <= to)
          })()
        : undefined
    return (
      <StudySession
        song={song}
        activeCards={activeCards}
        onExit={() => setView(view.returnTo ?? { name: 'stats', songId: view.songId })}
        onCardReviewed={(card) => updateCard(song.id, card)}
      />
    )
  }

  if (view.name === 'stats') {
    const song = getSong(view.songId)
    if (!song) return null
    return (
      <SongStats
        song={song}
        allPracticeLists={allPracticeLists}
        userLists={userLists}
        listSongIds={listSongIds}
        onBack={() => setView({ name: 'library' })}
        onStudy={() => setView({ name: 'study', songId: song.id })}
        onStudyVerse={(stanzaIdx) => setView({ name: 'study', songId: song.id, stanzaIdx })}
        onStanzaDrill={() => setView({ name: 'stanza', songId: song.id })}
        onTest={() => setView({ name: 'test', songId: song.id })}
        onEditLyrics={() => setView({ name: 'edit-lyrics', songId: song.id })}
        onDelete={() => {
          deleteSong(song.id)
          trackSongDeleted()
          setView({ name: 'library' })
        }}
        onTogglePublic={() => updateSong(song.id, { isPublic: !song.isPublic })}
        onToggleKnown={() => updateSong(song.id, { isKnown: !song.isKnown })}
        onAddToPracticeList={(listId) => addSongToPracticeList(listId, song.id)}
        onAddToUserList={(listId) => addSongToUserList(listId, song.id)}
        onRemoveFromUserList={(listId) => removeSongFromUserList(listId, song.id)}
        onCreateUserList={(name) => createUserList(name, 'standard')}
      />
    )
  }

  if (view.name === 'edit-lyrics') {
    const song = getSong(view.songId)
    if (!song) return null
    return (
      <EditLyrics
        song={song}
        onSave={async (lines) => {
          await editSongLines(song.id, lines)
          trackLyricsEdited(song.id, lines.length)
          setView({ name: 'stats', songId: song.id })
        }}
        onCancel={() => setView({ name: 'stats', songId: view.songId })}
      />
    )
  }

  if (view.name === 'group') {
    return (
      <GroupDetail
        group={view.group}
        userId={userId}
        onBack={() => setView({ name: 'library' })}
        onOpenPracticeList={(list) => setView({ name: 'practice-list', list })}
        onGetDetails={handleGetGroupDetails}
        onCreatePracticeList={(groupId, name, listType, concertDate) => createPracticeList(groupId, name, listType, concertDate)}
        onUpdatePracticeList={updatePracticeList}
        onLeaveGroup={leaveGroup}
        onAddToPractice={async (list) => {
          const plSongs = await getPracticeListSongs(list.id)
          const userList = await createUserList(list.name, list.listType, list.concertDate)
          for (const song of plSongs) {
            // Clone songs not already in library, then add to user list
            const ownedSong = mySongIds.has(song.id) ? song : cloneSong(song)
            await addSongToUserList(userList.id, ownedSong.id)
          }
        }}
      />
    )
  }

  if (view.name === 'practice-list') {
    return (
      <PracticeListDetail
        list={view.list}
        userId={userId}
        mySongIds={mySongIds}
        mySongs={songs}
        onBack={() => {
          const group = myGroups.find((g) => g.id === view.list.groupId)
          if (group) setView({ name: 'group', group })
          else setView({ name: 'library' })
        }}
        onCloneSong={cloneSong}
        onGetSongs={getPracticeListSongs}
        onAddSong={addSongToPracticeList}
        onRemoveSong={removeSongFromPracticeList}
        onUpdateList={(patch) => updatePracticeList(view.list.id, patch)}
        onStudy={(songId) => {
          trackPracticeListStudy(view.list.id, songId)
          setView({ name: 'study', songId, returnTo: view })
        }}
      />
    )
  }

  return (
    <SongLibrary
      songs={songs}
      groups={myGroups}
      groupsLoading={groupsLoading}
      allPracticeLists={allPracticeLists}
      userLists={userLists}
      listSongIds={listSongIds}
      onOpen={(id) => setView({ name: 'stats', songId: id })}
      onStudy={(id) => setView({ name: 'study', songId: id })}
      onAdd={() => setView({ name: 'add' })}
      onSignOut={onSignOut}
      onOpenGroup={(group) => setView({ name: 'group', group })}
      onCreateGroup={createGroup}
      onJoinGroup={joinGroup}
      onTogglePublic={(id) => { const s = songs.find((s) => s.id === id); if (s) updateSong(id, { isPublic: !s.isPublic }) }}
      onToggleKnown={(id) => { const s = songs.find((s) => s.id === id); if (s) updateSong(id, { isKnown: !s.isKnown }) }}
      onGetPracticeListSongs={getPracticeListSongs}
      onOpenPracticeList={(list) => setView({ name: 'practice-list', list })}
      onCreateUserList={(name, listType, concertDate) => createUserList(name, listType, concertDate)}
      onUpdateUserList={updateUserList}
      onDeleteUserList={deleteUserList}
      onAddSongToUserList={addSongToUserList}
      onRemoveSongFromUserList={removeSongFromUserList}
    />
  )
}
