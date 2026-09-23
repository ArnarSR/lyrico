import { describe, expect, it } from 'vitest'
import { buildPrompt, buildSegments, buildSegmentsForWords, getBlankedWords } from './blanks'

describe('buildPrompt', () => {
  it('blanks all words at full-recall difficulty (2)', () => {
    const prompt = buildPrompt('Amazing grace how sweet', 2)
    expect(prompt).not.toMatch(/[A-Za-z]/)
    expect(prompt).toContain('_')
  })

  it('blanks a smaller share of words at difficulty 0 than at difficulty 1', () => {
    const text = 'the quick brown fox jumps over the lazy dog today now'
    const words0 = getBlankedWords(text, 0).split(' ').filter(Boolean).length
    const words1 = getBlankedWords(text, 1).split(' ').filter(Boolean).length
    const words2 = getBlankedWords(text, 2).split(' ').filter(Boolean).length
    expect(words0).toBeLessThanOrEqual(words1)
    expect(words1).toBeLessThanOrEqual(words2)
    expect(words2).toBe(text.split(' ').length)
  })

  it('always blanks at least one word when there is any content', () => {
    expect(getBlankedWords('hi', 0).length).toBeGreaterThan(0)
  })

  it('returns the text unchanged when there are no words', () => {
    expect(buildPrompt('   ', 2)).toBe('   ')
  })

  it('is deterministic for the same text and difficulty', () => {
    const text = 'Some lyric line with several words in it'
    expect(buildPrompt(text, 1)).toBe(buildPrompt(text, 1))
    expect(getBlankedWords(text, 0)).toBe(getBlankedWords(text, 0))
  })
})

describe('buildSegments', () => {
  it('reconstructs the original text when segments are concatenated', () => {
    const text = 'Amazing grace how sweet the sound'
    for (const difficulty of [0, 1, 2] as const) {
      const segments = buildSegments(text, difficulty)
      const rebuilt = segments.map((s) => (s.type === 'text' ? s.value : s.answer)).join('')
      expect(rebuilt).toBe(text)
    }
  })

  it('marks blanked words with type "blank" and their original answer', () => {
    const segments = buildSegments('one two three four', 2)
    const blanks = segments.filter((s) => s.type === 'blank')
    expect(blanks.length).toBeGreaterThan(0)
    for (const b of blanks) {
      expect('one two three four'.includes(b.answer)).toBe(true)
    }
  })
})

describe('buildSegmentsForWords', () => {
  it('blanks only the requested words, consumed left-to-right', () => {
    const segments = buildSegmentsForWords('grace grace amazing', ['grace'])
    const blanks = segments.filter((s) => s.type === 'blank')
    expect(blanks).toHaveLength(1)
    expect(blanks[0].answer).toBe('grace')
    // The second "grace" should remain as text, not also blanked.
    const rebuilt = segments.map((s) => (s.type === 'text' ? s.value : s.answer)).join('')
    expect(rebuilt).toBe('grace grace amazing')
  })

  it('blanks nothing when the word list is empty', () => {
    const segments = buildSegmentsForWords('hello world', [])
    expect(segments.every((s) => s.type === 'text')).toBe(true)
  })
})
