import { useCallback, useEffect, useState } from 'react'
import type { Group, GroupMember, PracticeList, Song, UserListType } from '../types'
import { uid } from '../lib/id'
import { supabase } from '../lib/supabase'
import { fetchProfiles } from './useProfile'
import { trackGroupCreated, trackGroupJoined, trackGroupLeft, trackPracticeListCreated } from '../lib/analytics'

// ── Row types ─────────────────────────────────────────────────────────────────

interface GroupRow {
  id: string; name: string; description: string | null
  created_by: string; invite_code: string; created_at: number
}
interface MemberRow {
  group_id: string; user_id: string; role: string; joined_at: number
}
interface ListRow {
  id: string; group_id: string; name: string; created_by: string; created_at: number
  list_type: string; concert_date: number | null
}
interface SongRow {
  id: string; user_id: string; title: string; composer: string | null
  voice_part: string | null; lyrics: string; audio_url: string | null
  audio_name: string | null; concert_date: number | null; created_at: number
  is_public: boolean
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function rowToGroup(r: GroupRow): Group {
  return { id: r.id, name: r.name, description: r.description ?? undefined, createdBy: r.created_by, inviteCode: r.invite_code, createdAt: r.created_at }
}
function rowToMember(r: MemberRow, names: Map<string, string>): GroupMember {
  return { groupId: r.group_id, userId: r.user_id, role: r.role as 'admin' | 'member', joinedAt: r.joined_at, displayName: names.get(r.user_id) ?? r.user_id.slice(0, 8) }
}
function rowToList(r: ListRow): PracticeList {
  return { id: r.id, groupId: r.group_id, name: r.name, createdBy: r.created_by, createdAt: r.created_at, listType: (r.list_type as UserListType) ?? 'concert', concertDate: r.concert_date ?? undefined }
}
function rowToSong(r: SongRow): Song {
  return { id: r.id, title: r.title, composer: r.composer ?? undefined, lyrics: r.lyrics, cards: [], createdAt: r.created_at, isPublic: r.is_public, ownerId: r.user_id }
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGroups(userId: string) {
  const [myGroups, setMyGroups] = useState<Group[]>([])
  const [allPracticeLists, setAllPracticeLists] = useState<PracticeList[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: memberships, error: memErr } = await supabase
        .from('group_members').select('group_id').eq('user_id', userId)

      if (memErr) console.error('useGroups: group_members query error:', memErr)
      if (!memberships?.length) { setMyGroups([]); setAllPracticeLists([]); setLoading(false); return }

      const groupIds = memberships.map((m: { group_id: string }) => m.group_id)

      const [groupsRes, listsRes] = await Promise.all([
        supabase.from('groups').select('*')
          .in('id', groupIds)
          .order('created_at', { ascending: false }),
        supabase.from('practice_lists').select('*')
          .in('group_id', groupIds)
          .order('created_at'),
      ])

      if (groupsRes.error) console.error('useGroups: groups query error:', groupsRes.error)
      if (listsRes.error) console.error('useGroups: practice_lists query error:', listsRes.error)

      if (!cancelled) {
        setMyGroups((groupsRes.data ?? []).map((r) => rowToGroup(r as GroupRow)))
        setAllPracticeLists((listsRes.data ?? []).map((r) => rowToList(r as ListRow)))
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId])

  const createGroup = useCallback(async (name: string, description?: string): Promise<Group> => {
    const now = Date.now()
    const groupId = uid()
    const row: GroupRow = { id: groupId, name: name.trim(), description: description?.trim() || null, created_by: userId, invite_code: generateInviteCode(), created_at: now }

    const { error: ge } = await supabase.from('groups').insert(row)
    if (ge) { console.error('createGroup (groups):', ge); throw ge }
    const { error: me } = await supabase.from('group_members').insert({ group_id: groupId, user_id: userId, role: 'admin', joined_at: now })
    if (me) { console.error('createGroup (group_members):', me); throw me }

    const group = rowToGroup(row)
    setMyGroups((prev) => [group, ...prev])
    trackGroupCreated()
    return group
  }, [userId])

  const joinGroup = useCallback(async (inviteCode: string): Promise<Group | null> => {
    const { data: rows, error: lookupErr } = await supabase
      .from('groups').select('*').eq('invite_code', inviteCode.trim().toUpperCase()).limit(1)

    if (lookupErr) { console.error('joinGroup lookup error:', lookupErr); throw lookupErr }
    if (!rows?.length) return null
    const group = rowToGroup(rows[0] as GroupRow)

    if (myGroups.some((g) => g.id === group.id)) return group

    const { error } = await supabase.from('group_members').insert({ group_id: group.id, user_id: userId, role: 'member', joined_at: Date.now() })
    if (error) { console.error('joinGroup insert error:', error); throw error }

    setMyGroups((prev) => [group, ...prev])
    trackGroupJoined()
    return group
  }, [userId, myGroups])

  const leaveGroup = useCallback(async (groupId: string) => {
    setMyGroups((prev) => prev.filter((g) => g.id !== groupId))
    trackGroupLeft()
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)
  }, [userId])

  const getGroupDetails = useCallback(async (groupId: string): Promise<{ members: GroupMember[]; practiceLists: PracticeList[] }> => {
    const [membersRes, listsRes] = await Promise.all([
      supabase.from('group_members').select('*').eq('group_id', groupId),
      supabase.from('practice_lists').select('*').eq('group_id', groupId).order('created_at'),
    ])

    const memberRows = (membersRes.data ?? []) as MemberRow[]
    const names = await fetchProfiles(memberRows.map((m) => m.user_id))

    return {
      members: memberRows.map((r) => rowToMember(r, names)),
      practiceLists: (listsRes.data ?? []).map((r) => rowToList(r as ListRow)),
    }
  }, [])

  const createPracticeList = useCallback(async (groupId: string, name: string, listType: UserListType = 'concert', concertDate?: number): Promise<PracticeList> => {
    const row: ListRow = { id: uid(), group_id: groupId, name: name.trim(), created_by: userId, created_at: Date.now(), list_type: listType, concert_date: concertDate ?? null }
    const { error } = await supabase.from('practice_lists').insert(row)
    if (error) throw error
    const list = rowToList(row)
    setAllPracticeLists((prev) => [...prev, list])
    trackPracticeListCreated(listType)
    return list
  }, [userId])

  const updatePracticeList = useCallback(async (listId: string, patch: { name?: string; listType?: UserListType; concertDate?: number | null }) => {
    setAllPracticeLists((prev) => prev.map((l) => {
      if (l.id !== listId) return l
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
    await supabase.from('practice_lists').update(dbPatch).eq('id', listId)
  }, [])

  const deletePracticeList = useCallback(async (listId: string) => {
    await supabase.from('practice_lists').delete().eq('id', listId)
  }, [])

  const getPracticeListSongs = useCallback(async (listId: string): Promise<Song[]> => {
    const { data: plSongs } = await supabase
      .from('practice_list_songs').select('song_id').eq('practice_list_id', listId)

    if (!plSongs?.length) return []

    const { data: songRows } = await supabase
      .from('songs').select('*').in('id', plSongs.map((s: { song_id: string }) => s.song_id))

    return (songRows ?? []).map((r) => rowToSong(r as SongRow))
  }, [])

  const addSongToPracticeList = useCallback(async (listId: string, songId: string) => {
    const { error } = await supabase.from('practice_list_songs').insert({
      practice_list_id: listId, song_id: songId, added_by: userId, added_at: Date.now(),
    })
    if (error && error.code !== '23505') throw error // ignore duplicate
  }, [userId])

  const removeSongFromPracticeList = useCallback(async (listId: string, songId: string) => {
    await supabase.from('practice_list_songs').delete()
      .eq('practice_list_id', listId).eq('song_id', songId)
  }, [])

  return {
    myGroups, allPracticeLists, loading,
    createGroup, joinGroup, leaveGroup,
    getGroupDetails, createPracticeList, updatePracticeList, deletePracticeList,
    getPracticeListSongs, addSongToPracticeList, removeSongFromPracticeList,
  }
}
