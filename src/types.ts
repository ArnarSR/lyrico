// Core domain types for Lyrica.
// A Song owns a list of Cards (one per lyric line) that are drilled with SM-2.

export type VoicePart =
  | 'Soprano'
  | 'Mezzo-Soprano'
  | 'Alto'
  | 'Tenor'
  | 'Baritone'
  | 'Bass'
  | 'Unison'

export const VOICE_PARTS: VoicePart[] = [
  'Soprano',
  'Mezzo-Soprano',
  'Alto',
  'Tenor',
  'Baritone',
  'Bass',
  'Unison',
]

// Difficulty auto-advances per card as the learner proves mastery:
//   0 → blank 25% of words
//   1 → blank 50% of words
//   2 → full recall (no words shown)
export type Difficulty = 0 | 1 | 2

export interface Card {
  id: string
  lineIndex: number
  text: string
  // SM-2 state
  interval: number // days until next review
  repetitions: number // number of successful consecutive reviews
  easeFactor: number // SM-2 "EF", starts at 2.5, min 1.3
  nextDue: number // epoch ms
  lastQuality: number | null // 0..5, null if never reviewed
  difficulty: Difficulty
}

export interface Song {
  id: string
  title: string
  composer?: string
  voicePart?: VoicePart
  lyrics: string // raw text, one line per card
  audioUrl?: string // object URL for uploaded audio (blob)
  audioName?: string // original filename, useful after reloads
  concertDate?: number // epoch ms
  cards: Card[]
  createdAt: number
  lastStudied?: number
  isPublic?: boolean
  isKnown?: boolean
  ownerId?: string // user_id of the song owner (set on community/practice list songs)
}

export interface Profile {
  userId: string
  displayName: string
  createdAt: number
}

export interface Group {
  id: string
  name: string
  description?: string
  createdBy: string
  inviteCode: string
  createdAt: number
}

export interface GroupMember {
  groupId: string
  userId: string
  role: 'admin' | 'member'
  joinedAt: number
  displayName: string
}

export interface PracticeList {
  id: string
  groupId: string
  name: string
  createdBy: string
  createdAt: number
}

export type UserListType = 'concert' | 'standard'

export interface UserList {
  id: string
  userId: string
  name: string
  createdAt: number
  listType: UserListType
  concertDate?: number // epoch ms — only meaningful for 'concert' lists
}
