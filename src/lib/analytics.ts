import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com'

let initialized = false

export function initAnalytics() {
  if (initialized || !POSTHOG_KEY) return
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: true,           // auto-track clicks, inputs, page views
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
    loaded: () => { initialized = true },
  })

  // Global error capture — surface silent crashes in PostHog
  window.addEventListener('error', (ev) => {
    try {
      posthog.capture('$exception', {
        $exception_message: ev.message,
        $exception_source: ev.filename,
        $exception_lineno: ev.lineno,
        $exception_colno: ev.colno,
        $exception_stack_trace_raw: ev.error?.stack,
      })
    } catch { /* ignore */ }
  })
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const reason = ev.reason
      posthog.capture('$exception', {
        $exception_message: reason instanceof Error ? reason.message : String(reason),
        $exception_stack_trace_raw: reason instanceof Error ? reason.stack : undefined,
        $exception_unhandled_rejection: true,
      })
    } catch { /* ignore */ }
  })
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    posthog.capture('$exception', {
      $exception_message: err.message,
      $exception_stack_trace_raw: err.stack,
      ...context,
    })
  } catch { /* ignore */ }
}

// ── Identity ─────────────────────────────────────────────────────────────────

export function identifyUser(userId: string, props?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return
  posthog.identify(userId, props)
}

export function resetUser() {
  if (!POSTHOG_KEY) return
  posthog.reset()
}

// ── Events ───────────────────────────────────────────────────────────────────
// Typed helpers keep event names consistent and easy to find in PostHog.

function track(event: string, props?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return
  posthog.capture(event, props)
}

// Auth
export function trackSignUp(method: string) { track('sign_up', { method }) }
export function trackSignIn(method: string) { track('sign_in', { method }) }
export function trackSignOut() { track('sign_out') }

// Songs
export function trackSongAdded(songId: string, lineCount: number, hasAudio: boolean, isPublic: boolean) {
  track('song_added', { song_id: songId, line_count: lineCount, has_audio: hasAudio, is_public: isPublic })
}
export function trackSongDeleted() { track('song_deleted') }
export function trackLyricsEdited(songId: string, lineCount: number) {
  track('lyrics_edited', { song_id: songId, line_count: lineCount })
}
export function trackLyricsImported() { track('lyrics_imported_from_url') }

// Study sessions
export function trackStudyStarted(songId: string, cardCount: number, source: string) {
  track('study_started', { song_id: songId, card_count: cardCount, source })
}
export function trackStudyCompleted(songId: string, cardsReviewed: number, durationMs: number) {
  track('study_completed', { song_id: songId, cards_reviewed: cardsReviewed, duration_ms: durationMs })
}
export function trackStudyExited(songId: string, cardsReviewed: number, cardsRemaining: number) {
  track('study_exited_early', { song_id: songId, cards_reviewed: cardsReviewed, cards_remaining: cardsRemaining })
}

// Test sessions
export function trackTestStarted(songId: string) { track('test_started', { song_id: songId }) }
export function trackTestCompleted(songId: string, score: number) {
  track('test_completed', { song_id: songId, score })
}

// Groups
export function trackGroupCreated() { track('group_created') }
export function trackGroupJoined() { track('group_joined') }
export function trackGroupLeft() { track('group_left') }

// Practice lists
export function trackPracticeListCreated(listType: string) { track('practice_list_created', { list_type: listType }) }
export function trackPracticeListStudy(listId: string, songId: string) {
  track('practice_list_study', { list_id: listId, song_id: songId })
}

// Navigation
export function trackViewChanged(view: string) { track('$pageview', { view }) }
