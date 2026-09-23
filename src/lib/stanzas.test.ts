import { describe, expect, it } from 'vitest'
import { getStanzaLineRange, getStanzaStarts, isSectionLabel } from './stanzas'

describe('isSectionLabel', () => {
  it('recognizes common section headers', () => {
    for (const label of ['Verse 1', 'verse', 'Chorus', 'Bridge 2', 'Pre-chorus', 'Prechorus', 'Outro', 'Intro', 'Refreng', 'Strofe 3']) {
      expect(isSectionLabel(label)).toBe(true)
    }
  })

  it('does not flag ordinary lyric lines', () => {
    for (const line of ['Amazing grace, how sweet the sound', 'Verse of the day', 'I sing a chorus of praise']) {
      expect(isSectionLabel(line)).toBe(false)
    }
  })
})

describe('getStanzaStarts', () => {
  it('splits stanzas on blank lines and skips section labels', () => {
    const lyrics = [
      'Verse 1',
      'line a',
      'line b',
      '',
      'Chorus',
      'line c',
      '',
      'line d',
      'line e',
    ].join('\n')
    // lineIndex counts only non-blank, non-section-label lines: a=0, b=1, c=2, d=3, e=4
    expect(getStanzaStarts(lyrics)).toEqual([0, 2, 3])
  })

  it('treats a lyric with no blank lines as a single stanza', () => {
    const lyrics = 'line a\nline b\nline c'
    expect(getStanzaStarts(lyrics)).toEqual([0])
  })
})

describe('getStanzaLineRange', () => {
  it('returns an inclusive range for each stanza, open-ended for the last', () => {
    const lyrics = ['a', 'b', '', 'c', 'd', 'e'].join('\n')
    // starts = [0, 2]
    expect(getStanzaLineRange(lyrics, 0)).toEqual([0, 1])
    expect(getStanzaLineRange(lyrics, 1)).toEqual([2, Number.MAX_SAFE_INTEGER])
  })
})
