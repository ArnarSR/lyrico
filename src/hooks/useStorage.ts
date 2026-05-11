import { useCallback, useEffect, useState } from 'react'
import type { Card, Song } from '../types'
import { uid } from '../lib/id'
import { makeCard } from './useSM2'
import { isSectionLabel } from '../lib/stanzas'
import { supabase } from '../lib/supabase'

export interface NewSongInput {
  title: string
  composer?: string
  voicePart?: Song['voicePart']
  lyrics: string
  audioUrl?: string
  audioName?: string
  concertDate?: number
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

interface SongRow {
  id: string
  user_id: string
  title: string
  composer: string | null
  voice_part: string | null
  lyrics: string
  audio_url: string | null
  audio_name: string | null
  concert_date: number | null
  created_at: number
}

interface CardRow {
  id: string
  song_id: string
  user_id: string
  line_index: number
  text: string
  interval_days: number
  repetitions: number
  ease_factor: number
  next_due: number
  last_quality: number | null
  difficulty: number
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function rowToCard(row: CardRow): Card {
  return {
    id: row.id,
    lineIndex: row.line_index,
    text: row.text,
    interval: row.interval_days,
    repetitions: row.repetitions,
    easeFactor: row.ease_factor,
    nextDue: row.next_due,
    lastQuality: row.last_quality,
    difficulty: row.difficulty as Card['difficulty'],
  }
}

function cardToRow(card: Card, songId: string, userId: string): CardRow {
  return {
    id: card.id,
    song_id: songId,
    user_id: userId,
    line_index: card.lineIndex,
    text: card.text,
    interval_days: card.interval,
    repetitions: card.repetitions,
    ease_factor: card.easeFactor,
    next_due: card.nextDue,
    last_quality: card.lastQuality,
    difficulty: card.difficulty,
  }
}

function buildSong(songRow: SongRow, cardRows: CardRow[]): Song {
  const cards = cardRows
    .filter((c) => c.song_id === songRow.id)
    .sort((a, b) => a.line_index - b.line_index)
    .map(rowToCard)
  return {
    id: songRow.id,
    title: songRow.title,
    composer: songRow.composer ?? undefined,
    voicePart: (songRow.voice_part as Song['voicePart']) ?? undefined,
    lyrics: songRow.lyrics,
    audioUrl: songRow.audio_url ?? undefined,
    audioName: songRow.audio_name ?? undefined,
    concertDate: songRow.concert_date ?? undefined,
    cards,
    createdAt: songRow.created_at,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStorage(userId: string) {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [songsRes, cardsRes] = await Promise.all([
        supabase.from('songs').select('*').order('created_at', { ascending: false }),
        supabase.from('cards').select('*'),
      ])
      if (cancelled) return
      if (songsRes.error || cardsRes.error) {
        console.error(songsRes.error ?? cardsRes.error)
        setLoading(false)
        return
      }
      const songRows = songsRes.data as SongRow[]
      const cardRows = cardsRes.data as CardRow[]
      setSongs(songRows.map((sr) => buildSong(sr, cardRows)))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [userId])

  const addSong = useCallback((input: NewSongInput): Song => {
    const now = Date.now()
    const lines = input.lyrics
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !isSectionLabel(l))
    const cards: Card[] = lines.map((text, i) => makeCard(uid(), i, text, now))
    const songId = uid()

    const songRow: SongRow = {
      id: songId,
      user_id: userId,
      title: input.title.trim(),
      composer: input.composer?.trim() || null,
      voice_part: input.voicePart ?? null,
      lyrics: input.lyrics,
      audio_url: input.audioUrl ?? null,
      audio_name: input.audioName ?? null,
      concert_date: input.concertDate ?? null,
      created_at: now,
    }
    const cardRows = cards.map((c) => cardToRow(c, songId, userId))

    // Optimistic local update, then persist in background.
    const song: Song = buildSong(songRow, cardRows)
    setSongs((prev) => [song, ...prev])

    supabase.from('songs').insert(songRow).then(({ error }) => {
      if (error) console.error('addSong (songs):', error)
    })
    supabase.from('cards').insert(cardRows).then(({ error }) => {
      if (error) console.error('addSong (cards):', error)
    })

    return song
  }, [userId])

  const updateCard = useCallback((songId: string, card: Card) => {
    // Optimistic local update.
    setSongs((prev) =>
      prev.map((s) =>
        s.id === songId
          ? { ...s, cards: s.cards.map((c) => (c.id === card.id ? card : c)) }
          : s,
      ),
    )
    supabase.from('cards').upsert(cardToRow(card, songId, userId)).then(({ error }) => {
      if (error) console.error('updateCard:', error)
    })
  }, [userId])

  const deleteSong = useCallback((songId: string) => {
    setSongs((prev) => prev.filter((s) => s.id !== songId))
    supabase.from('songs').delete().eq('id', songId).then(({ error }) => {
      if (error) console.error('deleteSong:', error)
    })
  }, [])

  const getSong = useCallback(
    (songId: string) => songs.find((s) => s.id === songId) ?? null,
    [songs],
  )

  return { songs, loading, addSong, updateCard, deleteSong, getSong }
}
