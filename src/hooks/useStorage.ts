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
  isPublic?: boolean
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
  is_public: boolean
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
    .filter((c) => !isSectionLabel(c.text))
    .map((c, i) => ({ ...c, lineIndex: i }))
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
    isPublic: songRow.is_public,
    ownerId: songRow.user_id,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStorage(userId: string) {
  const [songs, setSongs] = useState<Song[]>([])
  const [publicSongs, setPublicSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [songsRes, cardsRes, publicRes] = await Promise.all([
        supabase.from('songs').select('*').order('created_at', { ascending: false }),
        supabase.from('cards').select('*'),
        supabase.from('songs').select('id,user_id,title,composer,voice_part,lyrics,audio_url,audio_name,concert_date,created_at,is_public')
          .eq('is_public', true)
          .neq('user_id', userId)
          .order('created_at', { ascending: false }),
      ])
      if (cancelled) return
      if (songsRes.error) { console.error(songsRes.error); setLoading(false); return }

      const songRows = songsRes.data as SongRow[]
      const cardRows = cardsRes.data as CardRow[]
      const ownSongs = songRows.filter((r) => r.user_id === userId)
      setSongs(ownSongs.map((sr) => buildSong(sr, cardRows)))
      setPublicSongs(((publicRes.data ?? []) as SongRow[]).map((sr) => buildSong(sr, [])))
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
      is_public: input.isPublic ?? false,
    }
    const cardRows = cards.map((c) => cardToRow(c, songId, userId))

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

  // Clone a community/practice-list song into the user's personal library.
  const cloneSong = useCallback((source: Song): Song => {
    return addSong({
      title: source.title,
      composer: source.composer,
      voicePart: source.voicePart,
      lyrics: source.lyrics,
      concertDate: source.concertDate,
      isPublic: false,
    })
  }, [addSong])

  const updateCard = useCallback((songId: string, card: Card) => {
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

  return { songs, publicSongs, loading, addSong, cloneSong, updateCard, deleteSong, getSong }
}
