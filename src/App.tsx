import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useStorage } from './hooks/useStorage'
import { useGroups } from './hooks/useGroups'
import { Auth } from './components/Auth'
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
  const { songs, publicSongs, addSong, cloneSong, updateCard, deleteSong, getSong } = useStorage(userId)
  const {
    myGroups, loading: groupsLoading,
    createGroup, joinGroup, leaveGroup,
    getGroupDetails, createPracticeList,
    getPracticeListSongs, addSongToPracticeList, removeSongFromPracticeList,
  } = useGroups(userId)
  const [view, setView] = useState<View>({ name: 'library' })

  const mySongIds = new Set(songs.map((s) => s.id))

  // Collect all practice lists from all groups (fetched lazily in group detail)
  // For community tab we just need the practice lists the user has access to —
  // we'll derive them from the group detail cache; for now pass an empty array
  // and let the group detail screen manage lists directly.
  // allPracticeLists is used in community tab for "add to list" dropdown:
  // we need a separate fetch. We'll keep a flat cache updated when groups are opened.
  const [allPracticeLists, setAllPracticeLists] = useState<PracticeList[]>([])

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
        onBack={() => setView({ name: 'library' })}
        onStudy={() => setView({ name: 'study', songId: song.id })}
        onStudyVerse={(stanzaIdx) => setView({ name: 'study', songId: song.id, stanzaIdx })}
        onStanzaDrill={() => setView({ name: 'stanza', songId: song.id })}
        onDelete={() => {
          deleteSong(song.id)
          setView({ name: 'library' })
        }}
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
        onGetDetails={async (groupId) => {
          const details = await getGroupDetails(groupId)
          // Cache practice lists for community tab
          setAllPracticeLists((prev) => {
            const others = prev.filter((pl) => pl.groupId !== groupId)
            return [...others, ...details.practiceLists]
          })
          return details
        }}
        onCreatePracticeList={async (groupId, name) => {
          const list = await createPracticeList(groupId, name)
          setAllPracticeLists((prev) => [...prev, list])
          return list
        }}
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
        onBack={() => {
          // Go back to the group that owns this list
          const group = myGroups.find((g) => g.id === view.list.groupId)
          if (group) setView({ name: 'group', group })
          else setView({ name: 'library' })
        }}
        onCloneSong={cloneSong}
        onGetSongs={getPracticeListSongs}
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
      onOpen={(id) => setView({ name: 'stats', songId: id })}
      onStudy={(id) => setView({ name: 'study', songId: id })}
      onAdd={() => setView({ name: 'add' })}
      onSignOut={onSignOut}
      onCloneSong={cloneSong}
      onOpenGroup={(group) => setView({ name: 'group', group })}
      onCreateGroup={createGroup}
      onJoinGroup={joinGroup}
      onAddToPracticeList={(song, listId) => addSongToPracticeList(listId, song.id)}
    />
  )
}
