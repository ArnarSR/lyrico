import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { identifyUser, resetUser, trackSignIn, trackSignOut } from '../lib/analytics'

async function ensureProfile(user: User) {
  const name = (user.user_metadata?.display_name as string | undefined)
    ?? user.email?.split('@')[0]
    ?? 'Lyrico user'
  await supabase.from('profiles').upsert(
    { user_id: user.id, display_name: name, created_at: Date.now() },
    { onConflict: 'user_id', ignoreDuplicates: true },
  )
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        ensureProfile(u)
        identifyUser(u.id, { email: u.email })
      }
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        ensureProfile(u)
        identifyUser(u.id, { email: u.email })
        if (event === 'SIGNED_IN') trackSignIn(u.app_metadata?.provider ?? 'email')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => { trackSignOut(); resetUser(); return supabase.auth.signOut() }

  return { user, loading, signOut }
}
