import { useEffect, useState } from 'react'
import type { Group, GroupMember, PracticeList, UserListType } from '../types'
import { Header, Shell } from './Shell'
import { CreateListForm } from './CreateListForm'
import { formatDateInput, parseDateInput } from '../lib/dates'

interface GroupDetailProps {
  group: Group
  userId: string
  onBack: () => void
  onOpenPracticeList: (list: PracticeList) => void
  onGetDetails: (groupId: string) => Promise<{ members: GroupMember[]; practiceLists: PracticeList[] }>
  onCreatePracticeList: (groupId: string, name: string, listType: UserListType, concertDate?: number) => Promise<PracticeList>
  onUpdatePracticeList: (listId: string, patch: { name?: string; listType?: UserListType; concertDate?: number | null }) => void
  onLeaveGroup: (groupId: string) => Promise<void>
  onAddToPractice: (list: PracticeList) => Promise<void>
}

const DAY_MS = 86_400_000
function daysUntil(ts: number) { return Math.ceil((ts - Date.now()) / DAY_MS) }

export function GroupDetail({
  group, userId, onBack, onOpenPracticeList,
  onGetDetails, onCreatePracticeList, onUpdatePracticeList, onLeaveGroup, onAddToPractice,
}: GroupDetailProps) {
  const [members, setMembers] = useState<GroupMember[]>([])
  const [practiceLists, setPracticeLists] = useState<PracticeList[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [editingDateListId, setEditingDateListId] = useState<string | null>(null)
  const [editDateValue, setEditDateValue] = useState('')
  const [addingToPractice, setAddingToPractice] = useState<Set<string>>(new Set())
  const [addedToPractice, setAddedToPractice] = useState<Set<string>>(new Set())

  const isAdmin = members.find((m) => m.userId === userId)?.role === 'admin'

  useEffect(() => {
    onGetDetails(group.id).then(({ members: m, practiceLists: pl }) => {
      setMembers(m)
      setPracticeLists(pl)
      setLoading(false)
    })
  }, [group.id, onGetDetails])

  function startEditDate(list: PracticeList) {
    setEditingDateListId(list.id)
    setEditDateValue(list.concertDate ? formatDateInput(list.concertDate) : '')
  }

  function saveEditDate(listId: string) {
    const d = editDateValue ? parseDateInput(editDateValue) : null
    onUpdatePracticeList(listId, { concertDate: d })
    setPracticeLists((prev) => prev.map((l) => l.id === listId ? { ...l, concertDate: d ?? undefined } : l))
    setEditingDateListId(null)
  }

  function copyCode() {
    navigator.clipboard.writeText(group.inviteCode).then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  const concertLists = practiceLists.filter((l) => l.listType === 'concert')
    .sort((a, b) => (a.concertDate ?? Infinity) - (b.concertDate ?? Infinity))
  const standardLists = practiceLists.filter((l) => l.listType === 'standard')

  async function handleAddToPractice(e: React.MouseEvent, list: PracticeList) {
    e.stopPropagation()
    setAddingToPractice((prev) => new Set(prev).add(list.id))
    try {
      await onAddToPractice(list)
      setAddedToPractice((prev) => new Set(prev).add(list.id))
    } catch (err) {
      console.error('Failed to add to practice:', err)
    } finally {
      setAddingToPractice((prev) => { const s = new Set(prev); s.delete(list.id); return s })
    }
  }

  function renderList(list: PracticeList) {
    const daysLeft = list.listType === 'concert' && list.concertDate ? daysUntil(list.concertDate) : null
    const dColor = daysLeft === null ? '' : daysLeft <= 7 ? 'text-wrong' : daysLeft <= 30 ? 'text-accent' : 'text-text-dim'
    const isEditingDate = editingDateListId === list.id
    const isAdding = addingToPractice.has(list.id)
    const isAdded = addedToPractice.has(list.id)

    return (
      <li key={list.id} className={`overflow-hidden rounded-xl border bg-bg-soft ${list.listType === 'concert' ? 'border-accent/25' : 'border-border'}`}>
        <div
          onClick={() => onOpenPracticeList(list)}
          className="w-full cursor-pointer px-4 py-3 text-left"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm text-text">{list.name}</p>
                <span className="shrink-0 text-xs text-text-dim/60">
                  {list.listType === 'concert' ? '🎭' : '🎵'}
                </span>
              </div>
              {list.listType === 'concert' && (
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
                  {daysLeft !== null ? (
                    <span className={dColor}>
                      🗓 {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Concert today!' : 'Concert passed'}
                    </span>
                  ) : (
                    <span className="text-wrong/70">No concert date set</span>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={isAdding || isAdded}
              onClick={(e) => isAdded ? e.stopPropagation() : handleAddToPractice(e, list)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors ${
                isAdded
                  ? 'border border-correct/30 text-correct'
                  : 'border border-accent bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50'
              }`}
            >
              {isAdding ? 'Adding…' : isAdded ? '✓ Added' : '+ Practice'}
            </button>
          </div>
        </div>

        {/* Inline date editor for admins on concert lists */}
        {isAdmin && list.listType === 'concert' && (
          <div className="border-t border-border/40 px-4 py-2">
            {isEditingDate ? (
              <div className="flex items-center gap-2">
                <label className="shrink-0 text-xs text-text-dim">Concert date</label>
                <input
                  type="date"
                  value={editDateValue}
                  onChange={(e) => setEditDateValue(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text focus:border-accent"
                />
                <button type="button" onClick={() => saveEditDate(list.id)} className="rounded-lg px-3 py-1 text-sm text-accent hover:bg-accent/10">Save</button>
                <button type="button" onClick={() => setEditingDateListId(null)} className="rounded-lg px-3 py-1 text-sm text-text-dim hover:bg-bg-card">Cancel</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startEditDate(list)}
                className="text-xs text-text-dim/50 hover:text-text-dim"
              >
                {list.concertDate
                  ? `🗓 ${new Date(list.concertDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} — edit`
                  : '+ Set concert date'}
              </button>
            )}
          </div>
        )}
      </li>
    )
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
          <span className="font-mono text-2xl tracking-widest text-text">{group.inviteCode}</span>
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
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="text-xs text-accent hover:brightness-110"
            >
              {showCreateForm ? 'Cancel' : '+ New list'}
            </button>
          )}
        </div>

        {/* Create form */}
        {showCreateForm && (
          <div className="mb-4">
            <CreateListForm
              onSave={async (name, listType, concertDate) => {
                const list = await onCreatePracticeList(group.id, name, listType, concertDate)
                setPracticeLists((prev) => [...prev, list])
                setShowCreateForm(false)
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        )}

        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : practiceLists.length === 0 ? (
          <p className="text-sm text-text-dim">No practice lists yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {concertLists.length > 0 && (
              <>
                <p className="text-xs uppercase tracking-[0.15em] text-text-dim">🎭 Concert</p>
                <ul className="flex flex-col gap-2">{concertLists.map(renderList)}</ul>
              </>
            )}
            {standardLists.length > 0 && (
              <>
                <p className={`text-xs uppercase tracking-[0.15em] text-text-dim ${concertLists.length > 0 ? 'mt-2' : ''}`}>🎵 Standard</p>
                <ul className="flex flex-col gap-2">{standardLists.map(renderList)}</ul>
              </>
            )}
          </div>
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
