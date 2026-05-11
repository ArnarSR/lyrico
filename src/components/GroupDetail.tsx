import { useEffect, useState } from 'react'
import type { Group, GroupMember, PracticeList } from '../types'
import { Header, Shell } from './Shell'

interface GroupDetailProps {
  group: Group
  userId: string
  onBack: () => void
  onOpenPracticeList: (list: PracticeList) => void
  onGetDetails: (groupId: string) => Promise<{ members: GroupMember[]; practiceLists: PracticeList[] }>
  onCreatePracticeList: (groupId: string, name: string) => Promise<PracticeList>
  onLeaveGroup: (groupId: string) => Promise<void>
}

export function GroupDetail({
  group, userId, onBack, onOpenPracticeList,
  onGetDetails, onCreatePracticeList, onLeaveGroup,
}: GroupDetailProps) {
  const [members, setMembers] = useState<GroupMember[]>([])
  const [practiceLists, setPracticeLists] = useState<PracticeList[]>([])
  const [loading, setLoading] = useState(true)
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  const isAdmin = members.find((m) => m.userId === userId)?.role === 'admin'

  useEffect(() => {
    onGetDetails(group.id).then(({ members: m, practiceLists: pl }) => {
      setMembers(m)
      setPracticeLists(pl)
      setLoading(false)
    })
  }, [group.id, onGetDetails])

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault()
    if (!newListName.trim()) return
    setCreating(true)
    try {
      const list = await onCreatePracticeList(group.id, newListName)
      setPracticeLists((prev) => [...prev, list])
      setNewListName('')
      setShowCreateForm(false)
    } finally {
      setCreating(false)
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(group.inviteCode).then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  return (
    <Shell>
      <Header
        title={group.name}
        subtitle={group.description}
        right={
          <button type="button" onClick={onBack} className="text-sm text-text-dim hover:text-text">
            Back
          </button>
        }
      />

      {/* Invite code */}
      <div className="mb-6 rounded-2xl border border-border bg-bg-soft p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.15em] text-text-dim">Invite code</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl tracking-widest text-text font-mono">{group.inviteCode}</span>
          <button
            type="button"
            onClick={copyCode}
            className="rounded-full border border-border px-3 py-1 text-xs text-text-dim hover:text-text"
          >
            {codeCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="mt-1 text-xs text-text-dim/70">Share this code so others can join your group.</p>
      </div>

      {/* Practice lists */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-[0.15em] text-text-dim">Practice lists</h2>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="text-xs text-accent hover:brightness-110"
          >
            + New list
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateList} className="mb-3 flex gap-2">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name"
              autoFocus
              className="flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent"
            />
            <button
              type="submit"
              disabled={creating || !newListName.trim()}
              className="rounded-xl border border-accent bg-accent/15 px-4 py-2 text-sm text-accent hover:bg-accent/25 disabled:opacity-50"
            >
              {creating ? '…' : 'Create'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : practiceLists.length === 0 ? (
          <p className="text-sm text-text-dim">No practice lists yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {practiceLists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => onOpenPracticeList(list)}
                  className="w-full rounded-xl border border-border bg-bg-card px-4 py-3 text-left text-sm text-text hover:border-accent/50"
                >
                  {list.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Members */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm uppercase tracking-[0.15em] text-text-dim">Members</h2>
        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between rounded-xl border border-border bg-bg-soft px-4 py-2.5">
                <span className="text-sm text-text">{m.displayName}</span>
                {m.role === 'admin' && (
                  <span className="text-xs text-accent">Admin</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Leave group */}
      {!isAdmin && (
        <button
          type="button"
          onClick={() => onLeaveGroup(group.id).then(onBack)}
          className="w-full rounded-full border border-wrong/40 py-2.5 text-sm text-wrong/80 hover:bg-wrong/10"
        >
          Leave group
        </button>
      )}
    </Shell>
  )
}
