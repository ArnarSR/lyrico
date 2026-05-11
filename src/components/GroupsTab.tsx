import { useState } from 'react'
import type { Group } from '../types'

interface GroupsTabProps {
  groups: Group[]
  loading: boolean
  onOpenGroup: (group: Group) => void
  onCreateGroup: (name: string, description?: string) => Promise<void>
  onJoinGroup: (inviteCode: string) => Promise<Group | null>
}

export function GroupsTab({ groups, loading, onOpenGroup, onCreateGroup, onJoinGroup }: GroupsTabProps) {
  const [panel, setPanel] = useState<'none' | 'create' | 'join'>('none')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setError(null)
    try { await onCreateGroup(name, description); setPanel('none'); setName(''); setDescription('') }
    catch { setError('Could not create group.') }
    finally { setBusy(false) }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setBusy(true); setError(null)
    try {
      const group = await onJoinGroup(inviteCode)
      if (!group) { setError('No group found with that code.') }
      else { setPanel('none'); setInviteCode('') }
    } catch { setError('Could not join group.') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => { setPanel(panel === 'join' ? 'none' : 'join'); setError(null) }}
          className="rounded-full border border-border bg-bg-soft px-4 py-2 text-sm text-text-dim hover:text-text"
        >
          Join group
        </button>
        <button
          type="button"
          onClick={() => { setPanel(panel === 'create' ? 'none' : 'create'); setError(null) }}
          className="rounded-full border border-accent bg-accent/15 px-4 py-2 text-sm text-accent hover:bg-accent/25"
        >
          Create group
        </button>
      </div>

      {panel === 'join' && (
        <form onSubmit={handleJoin} className="mb-4 rounded-2xl border border-border bg-bg-soft p-4">
          <p className="mb-3 text-sm text-text-dim">Enter the invite code from your choir director.</p>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="e.g. ABC123"
            maxLength={6}
            className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-center text-lg tracking-widest text-text focus:border-accent"
          />
          {error && <p className="mt-2 text-sm text-wrong">{error}</p>}
          <button
            type="submit"
            disabled={busy || inviteCode.trim().length < 6}
            className="mt-3 w-full rounded-full border border-accent bg-accent py-2.5 text-bg hover:brightness-110 disabled:opacity-50"
          >
            {busy ? '…' : 'Join'}
          </button>
        </form>
      )}

      {panel === 'create' && (
        <form onSubmit={handleCreate} className="mb-4 rounded-2xl border border-border bg-bg-soft p-4 flex flex-col gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name (e.g. Oslo Philharmonic Choir)"
            className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-text focus:border-accent"
            autoFocus
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-text focus:border-accent"
          />
          {error && <p className="text-sm text-wrong">{error}</p>}
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-full border border-accent bg-accent py-2.5 text-bg hover:brightness-110 disabled:opacity-50"
          >
            {busy ? '…' : 'Create'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="mt-6 text-center text-text-dim">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-bg-soft p-8 text-center">
          <p className="text-text">No groups yet</p>
          <p className="mt-2 text-sm text-text-dim">Create a choir group or join one with an invite code.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => onOpenGroup(group)}
                className="w-full rounded-2xl border border-border bg-bg-card p-4 text-left hover:border-accent/50"
              >
                <p className="text-base text-text">{group.name}</p>
                {group.description && <p className="mt-0.5 text-sm text-text-dim">{group.description}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
