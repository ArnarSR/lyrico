import { useCallback, useEffect, useState } from 'react'
import type { Profile } from '../types'
import { supabase } from '../lib/supabase'

interface ProfileRow {
  user_id: string
  display_name: string
  created_at: number
}

function rowToProfile(row: ProfileRow): Profile {
  return { userId: row.user_id, displayName: row.display_name, createdAt: row.created_at }
}

export function useProfile(userId: string) {
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(rowToProfile(data as ProfileRow))
      })
  }, [userId])

  const createProfile = useCallback(async (displayName: string): Promise<Profile> => {
    const now = Date.now()
    const row: ProfileRow = { user_id: userId, display_name: displayName.trim(), created_at: now }
    await supabase.from('profiles').upsert(row)
    const p = rowToProfile(row)
    setProfile(p)
    return p
  }, [userId])

  const updateProfile = useCallback(async (patch: { displayName?: string }): Promise<void> => {
    const dbPatch: Record<string, unknown> = {}
    if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName.trim()
    if (Object.keys(dbPatch).length === 0) return
    const { error } = await supabase.from('profiles').update(dbPatch).eq('user_id', userId)
    if (error) { console.error('updateProfile:', error); throw error }
    setProfile((prev) => prev ? { ...prev, ...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() } : {}) } : prev)
  }, [userId])

  return { profile, createProfile, updateProfile }
}

export async function fetchProfiles(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()
  const { data } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .in('user_id', userIds)
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    map.set(row.user_id as string, row.display_name as string)
  }
  return map
}
