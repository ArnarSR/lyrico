import { useCallback, useEffect, useState } from 'react'
import type { Group, GroupMember, LyricReport, MemberSongProgress, PendingApproval, PracticeList, Song, SongInList, UserListType } from '../types'
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
interface ReportRow {
  id: string; reporter_id: string; song_id: string; line_index: number
  current_text: string; suggested_text: string | null; status: string; created_at: number
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
interface PracticeListSongRow {
  practice_list_id: string; song_id: string; added_by: string; added_at: number; status: string
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function rowToGroup(r: GroupRow): Group {
  return { id: r.id, name: r.name, description: r.description ?? undefined, createdBy: r.created_by, inviteCode: r.invite_code, createdAt: r.created_at }
}
function rowToMember(r: MemberRow, names: Map<string, string>): GroupMember {
  return { groupId: r.group_id, userId: r.user_id, role: r.role as GroupMember['role'], joinedAt: r.joined_at, displayName: names.get(r.user_id) ?? r.user_id.slice(0, 8) }
}
function rowToSongInList(songRow: SongRow, plsRow: PracticeListSongRow): SongInList {
  return { ...rowToSong(songRow), status: plsRow.status as SongInList['status'], addedBy: plsRow.added_by }
}
function rowToList(r: ListRow): PracticeList {
  return { id: r.id, groupId: r.group_id, name: r.name, createdBy: r.created_by, createdAt: r.created_at, listType: (r.list_type as UserListType) ?? 'concert', concertDate: r.concert_date ?? undefined }
}
function rowToSong(r: SongRow): Song {
  return { id: r.id, title: r.title, composer: r.composer ?? undefined, lyrics: r.lyrics, cards: [], createdAt: r.created_at, isPublic: r.is_public, ownerId: r.user_id }
}
function rowToReport(r: ReportRow): LyricReport {
  return { id: r.id, reporterId: r.reporter_id, songId: r.song_id, lineIndex: r.line_index, currentText: r.current_text, suggestedText: r.suggested_text ?? undefined, status: r.status as LyricReport['status'], createdAt: r.created_at }
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGroups(userId: string) {
  const [myGroups, setMyGroups] = useState<Group[]>([])
  const [allPracticeLists, setAllPracticeLists] = useState<PracticeList[]>([])
  const [adminGroupIds, setAdminGroupIds] = useState<Set<string>>(new Set())
  const [approverGroupIds, setApproverGroupIds] = useState<Set<string>>(new Set())
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: memberships, error: memErr } = await supabase
        .from('group_members').select('group_id, role').eq('user_id', userId)

      if (memErr) console.error('useGroups: group_members query error:', memErr)
      if (!memberships?.length) { setMyGroups([]); setAllPracticeLists([]); setLoading(false); return }

      const groupIds = memberships.map((m: { group_id: string }) => m.group_id)
      const membershipArr = memberships as Array<{ group_id: string; role: string }>
      const adminSet = new Set(membershipArr.filter((m) => m.role === 'admin').map((m) => m.group_id))
      const approverSet = new Set(membershipArr.filter((m) => m.role === 'approver').map((m) => m.group_id))
      if (!cancelled) {
        setAdminGroupIds(adminSet)
        setApproverGroupIds(approverSet)
      }

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

      const groups = (groupsRes.data ?? []).map((r) => rowToGroup(r as GroupRow))
      const lists = (listsRes.data ?? []).map((r) => rowToList(r as ListRow))

      // Load pending approvals for groups where user is admin or approver
      const manageableGroupIds = membershipArr
        .filter((m) => m.role === 'admin' || m.role === 'approver')
        .map((m) => m.group_id)
      if (manageableGroupIds.length > 0) {
        const manageableListIds = lists.filter((l) => manageableGroupIds.includes(l.groupId)).map((l) => l.id)
        if (manageableListIds.length > 0) {
          const { data: pendingRows } = await supabase
            .from('practice_list_songs')
            .select('practice_list_id')
            .in('practice_list_id', manageableListIds)
            .eq('status', 'pending')
          const countByList = new Map<string, number>()
          for (const row of (pendingRows ?? []) as Array<{ practice_list_id: string }>) {
            countByList.set(row.practice_list_id, (countByList.get(row.practice_list_id) ?? 0) + 1)
          }
          const groupMap = new Map(groups.map((g) => [g.id, g]))
          const listMap = new Map(lists.map((l) => [l.id, l]))
          const approvals: PendingApproval[] = []
          for (const [listId, count] of countByList) {
            const list = listMap.get(listId)
            const group = list ? groupMap.get(list.groupId) : undefined
            if (list && group) approvals.push({ practiceListId: listId, practiceListName: list.name, groupId: list.groupId, groupName: group.name, count })
          }
          if (!cancelled) setPendingApprovals(approvals)
        }
      }

      if (!cancelled) {
        setMyGroups(groups)
        setAllPracticeLists(lists)
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
    // Snapshot for rollback if the DB write fails or is silently RLS-rejected
    let snapshot: PracticeList | undefined
    setAllPracticeLists((prev) => prev.map((l) => {
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
    // Use .select() so the response contains the affected rows. If RLS blocks
    // the update, data is an empty array (not an error). We treat that as
    // failure and roll back so users don't see a phantom "success".
    const { data, error } = await supabase
      .from('practice_lists')
      .update(dbPatch)
      .eq('id', listId)
      .select()
    if (error || !data || data.length === 0) {
      console.error('updatePracticeList failed:', error ?? 'no rows affected (RLS?)', { listId, dbPatch })
      if (snapshot) {
        const rollback = snapshot
        setAllPracticeLists((prev) => prev.map((l) => l.id === listId ? rollback : l))
      }
      if (error) {
        // Re-throw the Supabase error as a real Error so .message survives
        throw new Error(error.message || error.details || error.hint || 'Database error')
      }
      throw new Error('No matching practice list — likely missing UPDATE policy. Run supabase-practice-lists-update.sql in Supabase.')
    }
  }, [])

  const deletePracticeList = useCallback(async (listId: string) => {
    await supabase.from('practice_lists').delete().eq('id', listId)
  }, [])

  const getPracticeListSongs = useCallback(async (listId: string): Promise<SongInList[]> => {
    const { data: plSongs, error } = await supabase
      .from('practice_list_songs').select('song_id, added_by, status').eq('practice_list_id', listId)

    // Fall back to query without status column if migration hasn't been run yet
    if (error || !plSongs) {
      const { data: fallback } = await supabase
        .from('practice_list_songs').select('song_id, added_by').eq('practice_list_id', listId)
      if (!fallback?.length) return []
      const { data: songRows } = await supabase
        .from('songs').select('*').in('id', fallback.map((s: { song_id: string }) => s.song_id))
      const plsMap = new Map<string, PracticeListSongRow>()
      for (const row of fallback as Array<{ song_id: string; added_by: string }>) {
        plsMap.set(row.song_id, { practice_list_id: listId, song_id: row.song_id, added_by: row.added_by, added_at: 0, status: 'approved' })
      }
      return (songRows ?? []).map((r) => rowToSongInList(r as SongRow, plsMap.get((r as SongRow).id)!))
    }

    if (!plSongs.length) return []

    const plsMap = new Map<string, PracticeListSongRow>()
    for (const row of plSongs as Array<{ song_id: string; added_by: string; status: string }>) {
      plsMap.set(row.song_id, { practice_list_id: listId, song_id: row.song_id, added_by: row.added_by, added_at: 0, status: row.status })
    }

    const { data: songRows } = await supabase
      .from('songs').select('*').in('id', plSongs.map((s: { song_id: string }) => s.song_id))

    return (songRows ?? []).map((r) => rowToSongInList(r as SongRow, plsMap.get((r as SongRow).id)!))
  }, [])

  const addSongToPracticeList = useCallback(async (listId: string, songId: string): Promise<{ status: 'approved' | 'pending' }> => {
    const list = allPracticeLists.find((l) => l.id === listId)
    const groupId = list?.groupId
    const canApprove = groupId ? (adminGroupIds.has(groupId) || approverGroupIds.has(groupId)) : false
    const status: 'approved' | 'pending' = canApprove ? 'approved' : 'pending'
    const { error } = await supabase.from('practice_list_songs').insert({
      practice_list_id: listId, song_id: songId, added_by: userId, added_at: Date.now(), status,
    })
    if (error && error.code !== '23505') throw error
    return { status }
  }, [userId, allPracticeLists, adminGroupIds, approverGroupIds])

  const removeSongFromPracticeList = useCallback(async (listId: string, songId: string) => {
    await supabase.from('practice_list_songs').delete()
      .eq('practice_list_id', listId).eq('song_id', songId)
  }, [])

  const isGroupAdmin = useCallback((groupId: string) => adminGroupIds.has(groupId), [adminGroupIds])
  const isGroupApprover = useCallback((groupId: string) => approverGroupIds.has(groupId), [approverGroupIds])
  const isGroupModerator = useCallback((groupId: string) => adminGroupIds.has(groupId) || approverGroupIds.has(groupId), [adminGroupIds, approverGroupIds])

  const approveSong = useCallback(async (listId: string, songId: string): Promise<void> => {
    const { error } = await supabase
      .from('practice_list_songs').update({ status: 'approved' })
      .eq('practice_list_id', listId).eq('song_id', songId)
    if (error) throw error
    setPendingApprovals((prev) => prev
      .map((pa) => pa.practiceListId !== listId ? pa : pa.count <= 1 ? null : { ...pa, count: pa.count - 1 })
      .filter((pa): pa is PendingApproval => pa !== null))
  }, [])

  const rejectSong = useCallback(async (listId: string, songId: string): Promise<void> => {
    const { error } = await supabase
      .from('practice_list_songs').delete()
      .eq('practice_list_id', listId).eq('song_id', songId)
    if (error) throw error
    setPendingApprovals((prev) => prev
      .map((pa) => pa.practiceListId !== listId ? pa : pa.count <= 1 ? null : { ...pa, count: pa.count - 1 })
      .filter((pa): pa is PendingApproval => pa !== null))
  }, [])

  const updateMemberRole = useCallback(async (groupId: string, targetUserId: string, newRole: 'approver' | 'member'): Promise<void> => {
    const { error } = await supabase
      .from('group_members').update({ role: newRole })
      .eq('group_id', groupId).eq('user_id', targetUserId)
    if (error) throw error
  }, [])

  const getGroupMemberProgress = useCallback(async (groupId: string): Promise<MemberSongProgress[]> => {
    const { data, error } = await supabase.rpc('get_group_member_progress', { p_group_id: groupId })
    if (error) { console.error('getGroupMemberProgress:', error); throw error }
    return ((data ?? []) as Array<{
      member_user_id: string; song_id: string; song_title: string
      in_library: boolean; is_known: boolean; mastery_percent: number; last_active_day: string | null
    }>).map((r) => ({
      userId: r.member_user_id,
      songId: r.song_id,
      songTitle: r.song_title,
      inLibrary: r.in_library,
      isKnown: r.is_known,
      masteryPercent: r.mastery_percent,
      lastActiveDay: r.last_active_day,
    }))
  }, [])

  const removeMember = useCallback(async (groupId: string, targetUserId: string): Promise<void> => {
    const { error } = await supabase
      .from('group_members').delete()
      .eq('group_id', groupId).eq('user_id', targetUserId)
    if (error) throw error
  }, [])

  const submitLyricReport = useCallback(async (
    songId: string, lineIndex: number, currentText: string, suggestedText: string,
  ): Promise<void> => {
    const { error } = await supabase.from('lyric_reports').insert({
      id: uid(), reporter_id: userId, song_id: songId, line_index: lineIndex,
      current_text: currentText, suggested_text: suggestedText || null,
      status: 'pending', created_at: Date.now(),
    })
    if (error) console.error('submitLyricReport:', error)
  }, [userId])

  const getLyricReports = useCallback(async (songId: string): Promise<LyricReport[]> => {
    const { data, error } = await supabase
      .from('lyric_reports').select('*')
      .eq('song_id', songId).eq('status', 'pending').order('created_at')
    if (error) console.error('getLyricReports:', error)
    return ((data ?? []) as ReportRow[]).map(rowToReport)
  }, [])

  const dismissLyricReport = useCallback(async (reportId: string): Promise<void> => {
    const { error } = await supabase.from('lyric_reports').update({ status: 'dismissed' }).eq('id', reportId)
    if (error) console.error('dismissLyricReport:', error)
  }, [])

  return {
    myGroups, allPracticeLists, loading, pendingApprovals,
    createGroup, joinGroup, leaveGroup,
    getGroupDetails, createPracticeList, updatePracticeList, deletePracticeList,
    getPracticeListSongs, addSongToPracticeList, removeSongFromPracticeList,
    approveSong, rejectSong,
    isGroupAdmin, isGroupApprover, isGroupModerator,
    updateMemberRole, removeMember, getGroupMemberProgress,
    submitLyricReport, getLyricReports, dismissLyricReport,
  }
}
