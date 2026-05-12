import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useStorage } from './hooks/useStorage'
import { useGroups } from './hooks/useGroups'
import { Auth } from './components/Auth'
import { Onboarding } from './components/Onboarding'
import { SongLibrary } from './components/SongLibrary'
import { AddSong } from './components/AddSong'
import { StudySession } from './components/StudySession'
import { StanzaSession } from './components/StanzaSession'
import { SongStats } from './components/SongStats'
import { GroupDetail } from './components/GroupDetail'
import { PracticeListDetail } from './components/PracticeListDetail'
import { getStanzaLineRange } from './lib/stanzas'
import type { Group, PracticeList } from './types'

type View =
  | { name: 'library' }
  | { name: 'add' }
  | { name: 'stats'; songId: string }
  | { name: 'study'; songId: string; stanzaIdx?: number }
  | { name: 'stanza'; songId: string }
  | { name: 'group'; group: Group }
  | { name: 'practice-list'; list: PracticeList }

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

  return <AppInner userId={user.id} onSignOut={signOut} />
}

function AppInner({ userId, onSignOut }: { userId: string; onSignOut: () => void }) {
  const onboardingKey = `lyrico_onboarded_${userId}`
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem(onboardingKey) === 'true',
  )
  const {
    songs, publicSongs, userLists, listSongIds, loading: songsLoading,
    addSong, cloneSong, updateSong, updateCard, deleteSong, getSong,
    createUserList, addSongToUserList, removeSongFromUserList,
  } = useStorage(userId)
  const {
    myGroups, allPracticeLists, loading: groupsLoading,
    createGroup, joinGroup, leaveGroup,
    getGroupDetails, createPracticeList,
    getPracticeListSongs, addSongToPracticeList, removeSongFromPracticeList,
  } = useGroups(userId)
  const [view, setView] = useState<View>({ name: 'library' })

  // Must be after all hooks
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

  const mySongIds = new Set(songs.map((s) => s.id))

  useEffect(() => {
    if (songsLoading) return
    if ('songId' in view && !getSong(view.songId)) {
      setView({ name: 'library' })
    }
  }, [songsLoading, view, getSong])

  const handleGetGroupDetails = useCallback(getGroupDetails, [getGroupDetails])

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
          setView({ name: 'study', songId: song.id })
        }}
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
        onExit={() => setView({ name: 'stats', songId: view.songId })}
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
        onDelete={() => {
          deleteSong(song.id)
          setView({ name: 'library' })
        }}
        onTogglePublic={() => updateSong(song.id, { isPublic: !song.isPublic })}
        onToggleKnown={() => updateSong(song.id, { isKnown: !song.isKnown })}
        onAddToPracticeList={(listId) => addSongToPracticeList(listId, song.id)}
        onAddToUserList={(listId) => addSongToUserList(listId, song.id)}
        onRemoveFromUserList={(listId) => removeSongFromUserList(listId, song.id)}
        onCreateUserList={createUserList}
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
        onCreatePracticeList={createPracticeList}
        onLeaveGroup={leaveGroup}
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
      />
    )
  }

  return (
    <SongLibrary
      songs={songs}
      publicSongs={publicSongs}
      groups={myGroups}
      groupsLoading={groupsLoading}
      allPracticeLists={allPracticeLists}
      userLists={userLists}
      listSongIds={listSongIds}
      onOpen={(id) => setView({ name: 'stats', songId: id })}
      onStudy={(id) => setView({ name: 'study', songId: id })}
      onAdd={() => setView({ name: 'add' })}
      onSignOut={onSignOut}
      onCloneSong={cloneSong}
      onOpenGroup={(group) => setView({ name: 'group', group })}
      onCreateGroup={createGroup}
      onJoinGroup={joinGroup}
      onAddToPracticeList={(song, listId) => addSongToPracticeList(listId, song.id)}
      onTogglePublic={(id) => { const s = songs.find((s) => s.id === id); if (s) updateSong(id, { isPublic: !s.isPublic }) }}
      onToggleKnown={(id) => { const s = songs.find((s) => s.id === id); if (s) updateSong(id, { isKnown: !s.isKnown }) }}
      onGetPracticeListSongs={getPracticeListSongs}
    />
  )
}
