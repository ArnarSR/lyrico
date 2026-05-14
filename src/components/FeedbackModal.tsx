import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { uid } from '../lib/id'

type FeedbackType = 'bug' | 'suggestion' | 'other'

const TYPES: { value: FeedbackType; label: string; icon: string }[] = [
  { value: 'bug', label: 'Bug', icon: '🐛' },
  { value: 'suggestion', label: 'Suggestion', icon: '💡' },
  { value: 'other', label: 'Other', icon: '💬' },
]

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<FeedbackType>('suggestion')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')

  const canSubmit = message.trim().length >= 5

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || status === 'submitting') return
    setStatus('submitting')

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('feedback').insert({
      id: uid(),
      user_id: user?.id ?? null,
      type,
      message: message.trim(),
      user_agent: navigator.userAgent,
      created_at: Date.now(),
    })

    if (error) {
      console.error('feedback:', error)
      setStatus('error')
    } else {
      setStatus('done')
      setTimeout(onClose, 1800)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-t-3xl border border-border bg-bg-soft p-6 sm:rounded-3xl">
        {status === 'done' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-4xl">🙏</p>
            <p className="text-lg text-text">Thanks for the feedback!</p>
            <p className="text-sm text-text-dim">We read every submission.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base text-text">Send feedback</h2>
              <button type="button" onClick={onClose} className="text-sm text-text-dim hover:text-text">
                Cancel
              </button>
            </div>

            {/* Type picker */}
            <div className="flex gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-sm transition-colors ${
                    type === t.value
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-bg text-text-dim hover:text-text'
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              autoFocus
              placeholder={
                type === 'bug'
                  ? 'What happened? What did you expect instead?'
                  : type === 'suggestion'
                    ? 'What would make Lyrico better for you?'
                    : 'What\'s on your mind?'
              }
              className="w-full resize-none rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text placeholder:text-text-dim/60 focus:border-accent focus:outline-none"
            />

            {status === 'error' && (
              <p className="text-xs text-wrong">Something went wrong — please try again.</p>
            )}

            <button
              type="submit"
              disabled={!canSubmit || status === 'submitting'}
              className="rounded-full border border-accent bg-accent/15 py-3 text-sm text-accent hover:bg-accent/25 disabled:opacity-40"
            >
              {status === 'submitting' ? 'Sending…' : 'Send feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
