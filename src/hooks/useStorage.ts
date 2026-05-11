import { useCallback, useEffect, useRef, useState } from 'react'
import type { Card, Song } from '../types'
import { uid } from '../lib/id'
import { makeCard } from './useSM2'
import { isSectionLabel } from '../lib/stanzas'

const STORAGE_KEY = 'lyrica_songs'

function readFromStorage(): Song[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as Song[]
  } catch {
    return []
  }
}

function writeToStorage(songs: Song[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs))
  } catch {
    // Quota exceeded or private mode — silently ignore; UI still works in-memory.
  }
}

export interface NewSongInput {
  title: string
  composer?: string
  voicePart?: Song['voicePart']
  lyrics: string
  audioUrl?: string
  audioName?: string
  concertDate?: number
}

export function useStorage() {
  const [songs, setSongs] = useState<Song[]>(() => readFromStorage())
  const skipWriteRef = useRef(true)

  // Persist on every change, but skip the very first effect run
  // (we already loaded from storage above).
  useEffect(() => {
    if (skipWriteRef.current) {
      skipWriteRef.current = false
      return
    }
    writeToStorage(songs)
  }, [songs])

  // Keep multiple tabs / PWA windows in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setSongs(readFromStorage())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const addSong = useCallback((input: NewSongInput): Song => {
    const now = Date.now()
    const lines = input.lyrics
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !isSectionLabel(l))
    const cards: Card[] = lines.map((text, i) => makeCard(uid(), i, text, now))
    const song: Song = {
      id: uid(),
      title: input.title.trim(),
      composer: input.composer?.trim() || undefined,
      voicePart: input.voicePart,
      lyrics: input.lyrics,
      audioUrl: input.audioUrl,
      audioName: input.audioName,
      concertDate: input.concertDate,
      cards,
      createdAt: now,
    }
    setSongs((prev) => [song, ...prev])
    return song
  }, [])

  const updateSong = useCallback(
    (id: string, updater: (s: Song) => Song) => {
      setSongs((prev) => prev.map((s) => (s.id === id ? updater(s) : s)))
    },
    [],
  )

  const deleteSong = useCallback((id: string) => {
    setSongs((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const getSong = useCallback(
    (id: string) => songs.find((s) => s.id === id) ?? null,
    [songs],
  )

  const updateCard = useCallback(
    (songId: string, card: Card) => {
      setSongs((prev) =>
        prev.map((s) => {
          if (s.id !== songId) return s
          return {
            ...s,
            lastStudied: Date.now(),
            cards: s.cards.map((c) => (c.id === card.id ? card : c)),
          }
        }),
      )
    },
    [],
  )

  return {
    songs,
    addSong,
    updateSong,
    updateCard,
    deleteSong,
    getSong,
  }
}
