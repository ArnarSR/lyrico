import { useCallback, useEffect, useState } from 'react'
import type { Card, Song, UserList } from '../types'
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
  is_known: boolean
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

interface UserListRow {
  id: string
  user_id: string
  name: string
  created_at: number
}

interface UserListSongRow {
  list_id: string
  song_id: string
  added_at: number
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

const DAY_MS = 86_400_000

function buildSong(songRow: SongRow, cardRows: CardRow[]): Song {
  const cards = cardRows
    .filter((c) => c.song_id === songRow.id)
    .sort((a, b) => a.line_index - b.line_index)
    .map(rowToCard)
    .filter((c) => !isSectionLabel(c.text))
    .map((c, i) => ({ ...c, lineIndex: i }))

  const lastStudied = cards.reduce<number | undefined>((max, c) => {
    if (c.lastQuality === null) return max
    const studied = c.nextDue - c.interval * DAY_MS
    return max === undefined ? studied : Math.max(max, studied)
  }, undefined)

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
    isKnown: songRow.is_known,
    ownerId: songRow.user_id,
    lastStudied,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStorage(userId: string) {
  const [songs, setSongs] = useState<Song[]>([])
  const [publicSongs, setPublicSongs] = useState<Song[]>([])
  const [userLists, setUserLists] = useState<UserList[]>([])
  // listId -> Set of songIds in that list
  const [listSongIds, setListSongIds] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [songsRes, cardsRes, publicRes, listsRes] = await Promise.all([
        supabase.from('songs').select('*').order('created_at', { ascending: false }),
        supabase.from('cards').select('*'),
        supabase.from('songs').select('id,user_id,title,composer,voice_part,lyrics,audio_url,audio_name,concert_date,created_at,is_public')
          .eq('is_public', true)
          .neq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase.from('user_lists').select('*').eq('user_id', userId).order('created_at'),
      ])
      if (cancelled) return
      if (songsRes.error) { console.error(songsRes.error); setLoading(false); return }

      const songRows = songsRes.data as SongRow[]
      const cardRows = cardsRes.data as CardRow[]
      const ownSongs = songRows.filter((r) => r.user_id === userId)
      setSongs(ownSongs.map((sr) => buildSong(sr, cardRows)))
      setPublicSongs(((publicRes.data ?? []) as SongRow[]).map((sr) => buildSong(sr, [])))

      const lists = (listsRes.data ?? []) as UserListRow[]
      setUserLists(lists.map((r) => ({ id: r.id, userId: r.user_id, name: r.name, createdAt: r.created_at })))

      if (lists.length > 0) {
        const { data: lsRows } = await supabase
          .from('user_list_songs')
          .select('list_id,song_id')
          .in('list_id', lists.map((l) => l.id))
        if (!cancelled) {
          const map = new Map<string, Set<string>>()
          for (const r of (lsRows ?? []) as UserListSongRow[]) {
            if (!map.has(r.list_id)) map.set(r.list_id, new Set())
            map.get(r.list_id)!.add(r.song_id)
          }
          setListSongIds(map)
        }
      }

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
    if (input.isPublic) setPublicSongs((prev) => [song, ...prev])

    supabase.from('songs').insert(songRow).then(({ error }) => {
      if (error) console.error('addSong (songs):', error)
    })
    supabase.from('cards').insert(cardRows).then(({ error }) => {
      if (error) console.error('addSong (cards):', error)
    })

    return song
  }, [userId])

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

  const updateSong = useCallback((songId: string, patch: { isPublic?: boolean; isKnown?: boolean }) => {
    setSongs((prev) => prev.map((s) => s.id === songId ? { ...s, ...patch } : s))
    if (patch.isPublic !== undefined) {
      if (patch.isPublic) {
        setSongs((current) => {
          const song = current.find((s) => s.id === songId)
          if (song) setPublicSongs((prev) => [{ ...song, isPublic: true }, ...prev.filter((s) => s.id !== songId)])
          return current
        })
      } else {
        setPublicSongs((prev) => prev.filter((s) => s.id !== songId))
      }
    }
    const dbPatch: Record<string, unknown> = {}
    if (patch.isPublic !== undefined) dbPatch.is_public = patch.isPublic
    if (patch.isKnown !== undefined) dbPatch.is_known = patch.isKnown
    supabase.from('songs').update(dbPatch).eq('id', songId).then(({ error }) => {
      if (error) console.error('updateSong:', error)
    })
  }, [])

  const updateCard = useCallback((songId: string, card: Card) => {
    const now = Date.now()
    setSongs((prev) =>
      prev.map((s) =>
        s.id === songId
          ? {
              ...s,
              lastStudied: Math.max(s.lastStudied ?? 0, now),
              cards: s.cards.map((c) => (c.id === card.id ? card : c)),
            }
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

  const masterSong = useCallback((songId: string) => {
    const now = Date.now()
    setSongs((prev) => prev.map((s) => {
      if (s.id !== songId) return s
      const masteredCards = s.cards.map((c) => ({
        ...c,
        difficulty: 2 as Card['difficulty'],
        repetitions: 3,
        interval: 21,
        easeFactor: Math.max(c.easeFactor, 2.5),
        nextDue: now + 21 * DAY_MS,
        lastQuality: 5,
      }))
      // Fire-and-forget DB update
      supabase.from('cards').upsert(
        masteredCards.map((c) => cardToRow(c, songId, userId)),
      ).then(({ error }) => { if (error) console.error('masterSong:', error) })
      return { ...s, cards: masteredCards }
    }))
  }, [userId])

  // ── Personal lists ─────────────────────────────────────────────────────────

  const createUserList = useCallback(async (name: string): Promise<UserList> => {
    const row: UserListRow = { id: uid(), user_id: userId, name: name.trim(), created_at: Date.now() }
    const { error } = await supabase.from('user_lists').insert(row)
    if (error) { console.error('createUserList:', error); throw error }
    const list: UserList = { id: row.id, userId, name: row.name, createdAt: row.created_at }
    setUserLists((prev) => [...prev, list])
    setListSongIds((prev) => new Map(prev).set(list.id, new Set()))
    return list
  }, [userId])

  const deleteUserList = useCallback(async (listId: string) => {
    setUserLists((prev) => prev.filter((l) => l.id !== listId))
    setListSongIds((prev) => { const m = new Map(prev); m.delete(listId); return m })
    await supabase.from('user_lists').delete().eq('id', listId)
  }, [])

  const addSongToUserList = useCallback(async (listId: string, songId: string) => {
    setListSongIds((prev) => {
      const m = new Map(prev)
      const s = new Set(m.get(listId) ?? [])
      s.add(songId)
      m.set(listId, s)
      return m
    })
    const { error } = await supabase.from('user_list_songs').insert({ list_id: listId, song_id: songId, added_at: Date.now() })
    if (error && error.code !== '23505') console.error('addSongToUserList:', error)
  }, [])

  const removeSongFromUserList = useCallback(async (listId: string, songId: string) => {
    setListSongIds((prev) => {
      const m = new Map(prev)
      const s = new Set(m.get(listId) ?? [])
      s.delete(songId)
      m.set(listId, s)
      return m
    })
    await supabase.from('user_list_songs').delete().eq('list_id', listId).eq('song_id', songId)
  }, [])

  return {
    songs, publicSongs, userLists, listSongIds, loading,
    addSong, cloneSong, updateSong, updateCard, deleteSong, getSong, masterSong,
    createUserList, deleteUserList, addSongToUserList, removeSongFromUserList,
  }
}
