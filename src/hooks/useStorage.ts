import { useCallback, useEffect, useState } from 'react'
import type { Card, Song, UserList, UserListType } from '../types'
import { uid } from '../lib/id'
import { makeCard } from './useSM2'
import { isSectionLabel } from '../lib/stanzas'
import { supabase } from '../lib/supabase'
import { captureException } from '../lib/analytics'

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

interface LibraryRow {
  user_id: string
  song_id: string
  is_known: boolean
  added_at: number
  songs: SongRow
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
  list_type: string
  concert_date: number | null
  source_practice_list_id?: string | null
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

function buildSong(songRow: SongRow, cardRows: CardRow[], isKnown: boolean): Song {
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
    isKnown,
    ownerId: songRow.user_id,
    lastStudied,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStorage(userId: string) {
  const [songs, setSongs] = useState<Song[]>([])
  const [userLists, setUserLists] = useState<UserList[]>([])
  // listId -> Set of songIds in that list
  const [listSongIds, setListSongIds] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [libRes, cardsRes, listsRes] = await Promise.all([
          supabase
            .from('user_song_library')
            .select('is_known, added_at, songs(*)')
            .eq('user_id', userId),
          supabase.from('cards').select('*').eq('user_id', userId),
          supabase.from('user_lists').select('*').eq('user_id', userId).order('created_at'),
        ])
        if (cancelled) return

        if (libRes.error) console.error('useStorage: library query error:', libRes.error)
        if (cardsRes.error) console.error('useStorage: cards query error:', cardsRes.error)
        if (listsRes.error) console.error('useStorage: user_lists query error:', listsRes.error)

        const libRows = (libRes.data ?? []) as LibraryRow[]
        const cardRows = (cardsRes.data ?? []) as CardRow[]

        setSongs(
          libRows
            .filter((lib) => lib.songs != null)
            .map((lib) => buildSong(lib.songs, cardRows, lib.is_known))
        )

        const lists = (listsRes.data ?? []) as UserListRow[]
        setUserLists(lists.map((r) => ({
          id: r.id, userId: r.user_id, name: r.name, createdAt: r.created_at,
          listType: (r.list_type as UserListType) ?? 'standard',
          concertDate: r.concert_date ?? undefined,
          sourcePracticeListId: r.source_practice_list_id ?? undefined,
        })))

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
      } catch (err) {
        console.error('useStorage: unexpected error during load:', err)
        captureException(err, { where: 'useStorage.load' })
      } finally {
        if (!cancelled) setLoading(false)
      }
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
    const song: Song = buildSong(songRow, cardRows, false)

    setSongs((prev) => [song, ...prev])

    supabase.from('songs').insert(songRow).then(({ error }) => {
      if (error) console.error('addSong (songs):', error)
    })
    supabase.from('user_song_library').insert({
      user_id: userId, song_id: songId, is_known: false, added_at: now,
    }).then(({ error }) => {
      if (error) console.error('addSong (library):', error)
    })
    supabase.from('cards').insert(cardRows).then(({ error }) => {
      if (error) console.error('addSong (cards):', error)
    })

    return song
  }, [userId])

  // Add an existing song (owned by someone else) to this user's library with fresh cards.
  const addSongToLibrary = useCallback((source: Song): Song => {
    const now = Date.now()
    const lines = source.lyrics
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !isSectionLabel(l))
    const freshCards: Card[] = lines.map((text, i) => makeCard(uid(), i, text, now))
    const song: Song = { ...source, isKnown: false, cards: freshCards, lastStudied: undefined }

    setSongs((prev) => [...prev, song])

    supabase.from('user_song_library').insert({
      user_id: userId, song_id: source.id, is_known: false, added_at: now,
    }).then(({ error }) => {
      if (error) console.error('addSongToLibrary (library):', error)
    })
    supabase.from('cards').insert(freshCards.map((c) => cardToRow(c, source.id, userId))).then(({ error }) => {
      if (error) console.error('addSongToLibrary (cards):', error)
    })

    return song
  }, [userId])

  const updateSong = useCallback((songId: string, patch: { isPublic?: boolean; isKnown?: boolean }) => {
    setSongs((prev) => prev.map((s) => s.id === songId ? { ...s, ...patch } : s))
    if (patch.isPublic !== undefined) {
      supabase.from('songs').update({ is_public: patch.isPublic }).eq('id', songId).then(({ error }) => {
        if (error) console.error('updateSong (isPublic):', error)
      })
    }
    if (patch.isKnown !== undefined) {
      supabase.from('user_song_library')
        .update({ is_known: patch.isKnown })
        .eq('user_id', userId)
        .eq('song_id', songId)
        .then(({ error }) => {
          if (error) console.error('updateSong (isKnown):', error)
        })
    }
  }, [userId])

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
    const song = songs.find((s) => s.id === songId)
    setSongs((prev) => prev.filter((s) => s.id !== songId))
    if (song?.ownerId === userId) {
      // Owner deletes the song entirely; cascade removes library entries and cards
      supabase.from('songs').delete().eq('id', songId).then(({ error }) => {
        if (error) console.error('deleteSong:', error)
      })
    } else {
      // Non-owner removes from library and deletes own cards only
      supabase.from('user_song_library').delete().eq('user_id', userId).eq('song_id', songId).then(({ error }) => {
        if (error) console.error('deleteSong (library):', error)
      })
      supabase.from('cards').delete().eq('user_id', userId).eq('song_id', songId).then(({ error }) => {
        if (error) console.error('deleteSong (cards):', error)
      })
    }
  }, [songs, userId])

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
      supabase.from('cards').upsert(
        masteredCards.map((c) => cardToRow(c, songId, userId)),
      ).then(({ error }) => { if (error) console.error('masterSong:', error) })
      return { ...s, cards: masteredCards }
    }))
  }, [userId])

  // ── Personal lists ─────────────────────────────────────────────────────────

  const createUserList = useCallback(async (
    name: string,
    listType: UserListType = 'standard',
    concertDate?: number,
    sourcePracticeListId?: string,
  ): Promise<UserList> => {
    const row: UserListRow = {
      id: uid(),
      user_id: userId,
      name: name.trim(),
      created_at: Date.now(),
      list_type: listType,
      concert_date: concertDate ?? null,
      source_practice_list_id: sourcePracticeListId ?? null,
    }
    const { error } = await supabase.from('user_lists').insert(row)
    if (error) { console.error('createUserList:', error); throw error }
    const list: UserList = {
      id: row.id, userId, name: row.name, createdAt: row.created_at,
      listType, concertDate: row.concert_date ?? undefined,
      sourcePracticeListId: sourcePracticeListId ?? undefined,
    }
    setUserLists((prev) => [...prev, list])
    setListSongIds((prev) => new Map(prev).set(list.id, new Set()))
    return list
  }, [userId])

  const updateUserList = useCallback(async (listId: string, patch: { name?: string; listType?: UserListType; concertDate?: number | null }) => {
    let snapshot: UserList | undefined
    setUserLists((prev) => prev.map((l) => {
      if (l.id !== listId) return l
      snapshot = l
      const updated = { ...l }
      if (patch.name !== undefined) updated.name = patch.name
      if (patch.listType !== undefined) updated.listType = patch.listType
      if ('concertDate' in patch) updated.concertDate = patch.concertDate ?? undefined
      return updated
    }))
    const dbPatch: Record<string, unknown> = {}
    if (patch.name !== undefined) dbPatch.name = patch.name.trim()
    if (patch.listType !== undefined) dbPatch.list_type = patch.listType
    if ('concertDate' in patch) dbPatch.concert_date = patch.concertDate ?? null
    const { data, error } = await supabase
      .from('user_lists')
      .update(dbPatch)
      .eq('id', listId)
      .select()
    if (error || !data || data.length === 0) {
      console.error('updateUserList failed:', error ?? 'no rows affected (RLS?)', { listId, dbPatch })
      if (snapshot) {
        const rollback = snapshot
        setUserLists((prev) => prev.map((l) => l.id === listId ? rollback : l))
      }
      if (error) {
        throw new Error(error.message || error.details || error.hint || 'Database error')
      }
      throw new Error('No matching list found — were you logged out?')
    }
  }, [])

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

  /**
   * Replace the lines of a song.
   *
   * Each entry can either reference an existing card (by id) to preserve its
   * SM-2 progress, or omit id to create a brand-new card.
   * Cards whose ids are no longer present are deleted.
   * The song's raw `lyrics` field is regenerated from the new lines.
   * The DB trigger syncs card text for all other users in the library.
   */
  const editSongLines = useCallback(async (
    songId: string,
    newLines: { id?: string; text: string }[],
  ) => {
    const song = songs.find((s) => s.id === songId)
    if (!song) return

    const existingById = new Map(song.cards.map((c) => [c.id, c]))
    const now = Date.now()

    const updatedCards: Card[] = newLines.map((line, i) => {
      if (line.id && existingById.has(line.id)) {
        const existing = existingById.get(line.id)!
        return { ...existing, lineIndex: i, text: line.text }
      }
      return makeCard(uid(), i, line.text, now)
    })

    const keptIds = new Set(updatedCards.map((c) => c.id))
    const deletedIds = song.cards.map((c) => c.id).filter((id) => !keptIds.has(id))
    const newLyrics = newLines.map((l) => l.text).join('\n')

    setSongs((prev) => prev.map((s) =>
      s.id === songId ? { ...s, lyrics: newLyrics, cards: updatedCards } : s,
    ))

    await Promise.all([
      supabase.from('songs').update({ lyrics: newLyrics }).eq('id', songId)
        .then(({ error }) => { if (error) console.error('editSongLines lyrics:', error) }),
      supabase.from('cards').upsert(updatedCards.map((c) => cardToRow(c, songId, userId)))
        .then(({ error }) => { if (error) console.error('editSongLines upsert:', error) }),
      deletedIds.length > 0
        ? supabase.from('cards').delete().in('id', deletedIds)
            .then(({ error }) => { if (error) console.error('editSongLines delete:', error) })
        : Promise.resolve(),
    ])
  }, [songs, userId])

  return {
    songs, userLists, listSongIds, loading,
    addSong, addSongToLibrary, updateSong, updateCard, deleteSong, getSong, masterSong,
    editSongLines,
    createUserList, updateUserList, deleteUserList, addSongToUserList, removeSongFromUserList,
  }
}
