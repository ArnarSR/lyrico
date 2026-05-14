import { useState } from 'react'
import type { Profile as ProfileType } from '../types'
import { Header, Shell } from './Shell'

interface ProfileProps {
  profile: ProfileType | null
  email: string | undefined
  onBack: () => void
  onUpdate: (patch: { displayName?: string }) => Promise<void>
  onSignOut: () => void
}

export function Profile({ profile, email, onBack, onUpdate, onSignOut }: ProfileProps) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = displayName.trim() !== (profile?.displayName ?? '') && displayName.trim().length > 0

  async function handleSave() {
    if (!dirty) return
    setSaving(true)
    setError(null)
    try {
      await onUpdate({ displayName: displayName.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell>
      <Header
        title="Profile"
        right={
          <button type="button" onClick={onBack} className="text-sm text-text-dim hover:text-text">
            Back
          </button>
        }
      />

      <div className="flex flex-col gap-5">
        {/* Avatar / initial */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-3xl text-accent">
            {(profile?.displayName ?? email ?? '?').slice(0, 1).toUpperCase()}
          </div>
          {email && <p className="text-sm text-text-dim">{email}</p>}
        </div>

        {/* Display name */}
        <Field label="Display name" hint="How others in your groups see you.">
          <input
            type="text"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setSaved(false) }}
            placeholder="Your name"
            className="w-full rounded-xl border border-border bg-bg-soft px-4 py-3 text-base text-text placeholder:text-text-dim/60 focus:border-accent"
          />
        </Field>

        {error && <p className="text-sm text-wrong">{error}</p>}

        <button
          type="button"
          disabled={!dirty || saving}
          onClick={handleSave}
          className="rounded-full border border-accent bg-accent/15 py-3 text-accent hover:bg-accent/25 disabled:opacity-40"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
        </button>

        {/* Account details */}
        <div className="mt-4 rounded-2xl border border-border bg-bg-soft px-4 py-3">
          <p className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Account</p>
          {profile?.createdAt && (
            <p className="text-sm text-text-dim">
              Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
            </p>
          )}
        </div>

        {/* Sign out */}
        <button
          type="button"
          onClick={onSignOut}
          className="mt-2 w-full rounded-full border border-wrong/40 py-2.5 text-sm text-wrong/80 hover:bg-wrong/10"
        >
          Sign out
        </button>
      </div>
    </Shell>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-[0.15em] text-text-dim">{label}</span>
      {children}
      {hint && <span className="text-xs text-text-dim/80">{hint}</span>}
    </label>
  )
}
