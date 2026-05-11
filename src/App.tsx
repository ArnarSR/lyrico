import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useStorage } from './hooks/useStorage'
import { Auth } from './components/Auth'
import { SongLibrary } from './components/SongLibrary'
import { AddSong } from './components/AddSong'
import { StudySession } from './components/StudySession'
import { StanzaSession } from './components/StanzaSession'
import { SongStats } from './components/SongStats'
import { getStanzaLineRange } from './lib/stanzas'

type View =
  | { name: 'library' }
  | { name: 'add' }
  | { name: 'stats'; songId: string }
  | { name: 'study'; songId: string; stanzaIdx?: number }
  | { name: 'stanza'; songId: string }

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
  const { songs, addSong, updateCard, deleteSong, getSong } = useStorage(userId)
  const [view, setView] = useState<View>({ name: 'library' })

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
    if (!song) return <Library songs={songs} setView={setView} onSignOut={onSignOut} />
    return (
      <StanzaSession
        song={song}
        onExit={() => setView({ name: 'stats', songId: song.id })}
      />
    )
  }

  if (view.name === 'study') {
    const song = getSong(view.songId)
    if (!song) return <Library songs={songs} setView={setView} onSignOut={onSignOut} />
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
        onExit={() => setView({ name: 'stats', songId: song.id })}
        onCardReviewed={(card) => updateCard(song.id, card)}
      />
    )
  }

  if (view.name === 'stats') {
    const song = getSong(view.songId)
    if (!song) return <Library songs={songs} setView={setView} onSignOut={onSignOut} />
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

  return <Library songs={songs} setView={setView} onSignOut={onSignOut} />
}

function Library({
  songs,
  setView,
  onSignOut,
}: {
  songs: ReturnType<typeof useStorage>['songs']
  setView: (v: View) => void
  onSignOut: () => void
}) {
  return (
    <SongLibrary
      songs={songs}
      onOpen={(id) => setView({ name: 'stats', songId: id })}
      onStudy={(id) => setView({ name: 'study', songId: id })}
      onAdd={() => setView({ name: 'add' })}
      onSignOut={onSignOut}
    />
  )
}
