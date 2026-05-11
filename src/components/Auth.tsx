import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Shell } from './Shell'

export function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      // Create profile with display name
      if (data.user) {
        const name = displayName.trim() || email.split('@')[0]
        await supabase.from('profiles').upsert({
          user_id: data.user.id,
          display_name: name,
          created_at: Date.now(),
        })
      }
      setMessage('Account created! You can now sign in.')
      setMode('signin')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  function switchMode() {
    setMode(mode === 'signin' ? 'signup' : 'signin')
    setError(null)
    setMessage(null)
  }

  return (
    <Shell>
      <div className="flex min-h-full flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="mb-1 text-center font-serif text-3xl text-accent">Lyrico</h1>
          <p className="mb-8 text-center text-sm text-text-dim">Learn your lyrics by heart</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <input
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="rounded-xl border border-border bg-bg-soft px-4 py-3 text-text placeholder:text-text-dim/60 focus:border-accent"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-xl border border-border bg-bg-soft px-4 py-3 text-text placeholder:text-text-dim/60 focus:border-accent"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-xl border border-border bg-bg-soft px-4 py-3 text-text placeholder:text-text-dim/60 focus:border-accent"
            />

            {error && <p className="text-sm text-wrong">{error}</p>}
            {message && <p className="text-sm text-correct">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="rounded-full border border-accent bg-accent py-3 text-bg hover:brightness-110 disabled:opacity-50"
            >
              {loading ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-dim">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button type="button" onClick={switchMode} className="text-accent hover:underline">
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </Shell>
  )
}
