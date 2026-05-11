import { useState } from 'react'
import { useStorage } from './hooks/useStorage'
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
  const { songs, addSong, updateCard, deleteSong, getSong } = useStorage()
  const [view, setView] = useState<View>({ name: 'library' })

  if (view.name === 'add') {
    return (
      <AddSong
        onCancel={() => setView({ name: 'library' })}
        onSave={(input) => {
          const song = addSong(input)
          // Jump straight into studying a freshly-added song so you feel the loop.
          setView({ name: 'study', songId: song.id })
        }}
      />
    )
  }

  if (view.name === 'stanza') {
    const song = getSong(view.songId)
    if (!song) return (
      <SongLibrary
        songs={songs}
        onOpen={(id) => setView({ name: 'stats', songId: id })}
        onStudy={(id) => setView({ name: 'study', songId: id })}
        onAdd={() => setView({ name: 'add' })}
      />
    )
    return (
      <StanzaSession
        song={song}
        onExit={() => setView({ name: 'stats', songId: song.id })}
      />
    )
  }

  if (view.name === 'study') {
    const song = getSong(view.songId)
    if (!song) {
      return (
        <SongLibrary
          songs={songs}
          onOpen={(id) => setView({ name: 'stats', songId: id })}
          onStudy={(id) => setView({ name: 'study', songId: id })}
          onAdd={() => setView({ name: 'add' })}
        />
      )
    }
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
    if (!song) {
      return (
        <SongLibrary
          songs={songs}
          onOpen={(id) => setView({ name: 'stats', songId: id })}
          onStudy={(id) => setView({ name: 'study', songId: id })}
          onAdd={() => setView({ name: 'add' })}
        />
      )
    }
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

  return (
    <SongLibrary
      songs={songs}
      onOpen={(id) => setView({ name: 'stats', songId: id })}
      onStudy={(id) => setView({ name: 'study', songId: id })}
      onAdd={() => setView({ name: 'add' })}
    />
  )
}
