import { useState } from 'react'

interface OnboardingProps {
  onDone: () => void
}

const STEPS = [
  {
    icon: (
      <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20">
        <circle cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="2" className="text-accent/30" />
        <path d="M24 40c0-8.837 7.163-16 16-16s16 7.163 16 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-accent" />
        <path d="M28 46c2-4 6-6 12-6s10 2 12 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-accent" />
        <circle cx="33" cy="37" r="2" fill="currentColor" className="text-accent" />
        <circle cx="47" cy="37" r="2" fill="currentColor" className="text-accent" />
        <path d="M30 56h20M35 60h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent/50" />
      </svg>
    ),
    title: 'Welcome to Lyrico',
    body: 'Lyrico helps choir singers learn their lyrics by heart using spaced repetition — the same technique used by the world\'s best memorisers.',
  },
  {
    icon: (
      <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20">
        <rect x="16" y="14" width="48" height="52" rx="6" stroke="currentColor" strokeWidth="2" className="text-accent/30" />
        <line x1="26" y1="30" x2="54" y2="30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-accent/50" />
        <line x1="26" y1="38" x2="54" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-accent/50" />
        <line x1="26" y1="46" x2="46" y2="46" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-accent/50" />
        <circle cx="62" cy="62" r="12" fill="currentColor" className="text-accent" />
        <path d="M58 62h8M62 58v8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Add your songs',
    body: 'Paste your lyrics — one line per row. Lyrico splits each line into its own flashcard. You can also import from a URL or scan a sheet music PDF.',
  },
  {
    icon: (
      <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20">
        <rect x="12" y="20" width="56" height="40" rx="8" stroke="currentColor" strokeWidth="2" className="text-accent/30" />
        <text x="40" y="46" textAnchor="middle" fontSize="18" fill="currentColor" className="text-accent/50" fontFamily="serif">Ky-ri-e</text>
        <path d="M22 68h12M46 68h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-wrong/60" />
        <path d="M34 68h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-correct/80" />
        <circle cx="28" cy="72" r="2" fill="currentColor" className="text-wrong/60" />
        <circle cx="40" cy="72" r="2" fill="currentColor" className="text-correct/80" />
        <circle cx="52" cy="72" r="2" fill="currentColor" className="text-wrong/60" />
      </svg>
    ),
    title: 'Study until you know it',
    body: 'Lyrico shows you each line with some words hidden. Rate how well you knew it, and it schedules the next review automatically — showing harder lines more often.',
  },
  {
    icon: (
      <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20">
        <rect x="12" y="12" width="56" height="16" rx="4" stroke="currentColor" strokeWidth="2" className="text-accent/30" />
        <rect x="12" y="34" width="56" height="12" rx="4" fill="currentColor" className="text-accent/20" stroke="currentColor" strokeWidth="2" strokeDasharray="none" style={{stroke: 'rgb(var(--color-accent) / 0.6)'}} />
        <rect x="12" y="52" width="56" height="12" rx="4" stroke="currentColor" strokeWidth="2" className="text-accent/20" strokeDasharray="4 3" />
        <circle cx="62" cy="20" r="8" fill="currentColor" className="text-accent" />
        <path d="M59 20l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Pin your practice list',
    body: 'In "Now Practicing", pin any personal list or group practice list. Only songs you haven\'t mastered yet will show — so you always know exactly what still needs work.',
  },
  {
    icon: (
      <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20">
        <circle cx="40" cy="28" r="10" stroke="currentColor" strokeWidth="2" className="text-accent/50" />
        <circle cx="18" cy="52" r="8" stroke="currentColor" strokeWidth="2" className="text-accent/30" />
        <circle cx="62" cy="52" r="8" stroke="currentColor" strokeWidth="2" className="text-accent/30" />
        <path d="M30 36c-4 4-8 8-4 12M50 36c4 4 8 8 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent/40" />
        <path d="M26 52h28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" className="text-accent/40" />
      </svg>
    ),
    title: 'Join your choir group',
    body: 'Your director can create a group and share an invite code. Join to access shared practice lists — and add your own songs to them so the whole section practises together.',
  },
]

export function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      {/* Skip */}
      <div className="flex justify-end p-4">
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-text-dim hover:text-text"
        >
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="mb-8 text-accent">{current.icon}</div>
        <h1 className="mb-4 text-2xl text-text">{current.title}</h1>
        <p className="max-w-xs text-sm leading-relaxed text-text-dim">{current.body}</p>
      </div>

      {/* Dots + navigation */}
      <div className="flex flex-col items-center gap-6 pb-12">
        <div className="flex gap-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-accent' : 'w-2 bg-border'}`}
            />
          ))}
        </div>

        <div className="flex w-full max-w-xs gap-3 px-4">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 rounded-full border border-border py-3 text-sm text-text-dim hover:text-text"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => isLast ? onDone() : setStep((s) => s + 1)}
            className="flex-[2] rounded-full border border-accent bg-accent py-3 text-sm text-bg hover:brightness-110"
          >
            {isLast ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
