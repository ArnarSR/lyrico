import { describe, expect, it } from 'vitest'
import { detectPhrases, describePhraseStats, wordCount } from './phrases'

const lines = (text: string) => text.split('\n')

describe('detectPhrases — syllables', () => {
  it('rejoins syllables split under the notes', () => {
    const { lyrics, stats } = detectPhrases('Ky- ri- e e- le- i- son')
    expect(lyrics).toBe('Kyrie eleison')
    expect(stats.syllablesRejoined).toBe(5)
  })

  it('rejoins a word broken across a row end', () => {
    const { lyrics } = detectPhrases('Ave verum cor-\npus natum')
    expect(lyrics).toBe('Ave verum corpus natum')
  })

  it('leaves a spaced dash alone', () => {
    const { lyrics, stats } = detectPhrases('Hail — true body born')
    expect(lyrics).toBe('Hail — true body born')
    expect(stats.syllablesRejoined).toBe(0)
  })
})

describe('detectPhrases — score furniture', () => {
  it('drops dynamics, bar numbers and rehearsal letters on their own row', () => {
    const raw = ['Ave verum corpus', 'mf', '12', 'B', 'natum de Maria', 'cresc.', 'Fine'].join('\n')
    const { lyrics, stats } = detectPhrases(raw)
    expect(lines(lyrics)).toEqual(['Ave verum corpus natum de Maria'])
    expect(stats.furnitureRemoved).toBe(5)
  })

  it('strips a voice label from the head of a row', () => {
    const { lyrics } = detectPhrases('Sopran: Gloria in excelsis')
    expect(lyrics).toBe('Gloria in excelsis')
  })

  it('keeps lyric lines that merely contain a short word', () => {
    const { lyrics } = detectPhrases('Do not forget me\nI am here')
    expect(lines(lyrics)).toEqual(['Do not forget me', 'I am here'])
  })
})

describe('detectPhrases — merging system breaks', () => {
  it('joins a row continued in lower case with no end punctuation', () => {
    const { lyrics, stats } = detectPhrases('Ave verum corpus\nnatum de Maria')
    expect(lyrics).toBe('Ave verum corpus natum de Maria')
    expect(stats.merged).toBe(1)
  })

  it('joins a phrase spread over three rows', () => {
    const { lyrics } = detectPhrases('Ave verum\ncorpus\nnatum')
    expect(lyrics).toBe('Ave verum corpus natum')
  })

  it('does not join when the row ends in punctuation', () => {
    const { lyrics } = detectPhrases('Ave verum corpus,\nnatum de Maria')
    expect(lines(lyrics)).toEqual(['Ave verum corpus,', 'natum de Maria'])
  })

  it('does not join when the next row starts a new sentence', () => {
    const { lyrics } = detectPhrases('Ave verum corpus\nNatum de Maria')
    expect(lines(lyrics)).toEqual(['Ave verum corpus', 'Natum de Maria'])
  })

  it('does not join across a blank row', () => {
    const { lyrics } = detectPhrases('Ave verum corpus\n\nnatum de Maria')
    expect(lines(lyrics)).toEqual(['Ave verum corpus', '', 'natum de Maria'])
  })

  it('does not join across a section label', () => {
    const { lyrics } = detectPhrases('Ave verum corpus\nChorus\nnatum de Maria')
    expect(lines(lyrics)).toEqual(['Ave verum corpus', 'Chorus', 'natum de Maria'])
  })

  it('refuses a merge that would not fit one card', () => {
    const a = 'one two three four five six'
    const b = 'seven eight nine ten eleven'
    const { lyrics } = detectPhrases(`${a}\n${b}`)
    expect(lines(lyrics)).toEqual([a, b])
  })

  it('leaves a translation row out of the merge', () => {
    const raw = 'Ave verum corpus\n> hail true body\nnatum de Maria'
    const { lyrics } = detectPhrases(raw)
    expect(lines(lyrics)).toEqual(['Ave verum corpus', '> hail true body', 'natum de Maria'])
  })
})

describe('detectPhrases — splitting crowded rows', () => {
  it('splits a row holding two phrases at the punctuation nearest the middle', () => {
    const raw = 'Ave verum corpus natum de Maria Virgine, vere passum immolatum in cruce pro homine'
    const { lyrics, stats } = detectPhrases(raw)
    expect(lines(lyrics)).toEqual([
      'Ave verum corpus natum de Maria Virgine,',
      'vere passum immolatum in cruce pro homine',
    ])
    expect(stats.split).toBe(1)
  })

  it('prefers a sentence end over a comma', () => {
    const raw = 'one two, three four five six seven. eight nine ten, eleven twelve'
    const { lyrics } = detectPhrases(raw)
    expect(lines(lyrics)).toEqual([
      'one two, three four five six seven.',
      'eight nine ten, eleven twelve',
    ])
  })

  it('leaves a long row with no punctuation alone', () => {
    const raw = 'one two three four five six seven eight nine ten eleven twelve'
    const { lyrics, stats } = detectPhrases(raw)
    expect(lyrics).toBe(raw)
    expect(stats.split).toBe(0)
  })

  it('does not split off a fragment shorter than the minimum', () => {
    const raw = 'one two three four five six seven eight nine ten, eleven'
    const { lyrics } = detectPhrases(raw)
    expect(lyrics).toBe(raw)
  })
})

describe('detectPhrases — housekeeping', () => {
  it('collapses repeated blank rows and trims the ends', () => {
    const { lyrics } = detectPhrases('\n\nAve verum\n\n\n\nO Jesu dulcis\n\n')
    expect(lines(lyrics)).toEqual(['Ave verum', '', 'O Jesu dulcis'])
  })

  it('reports no change for text that is already phrased', () => {
    const raw = 'Ave verum corpus,\nnatum de Maria Virgine'
    const { changed, lyrics } = detectPhrases(raw)
    expect(lyrics).toBe(raw)
    expect(changed).toBe(false)
  })

  it('normalizes non-breaking spaces and CRLF without reporting a change', () => {
    const { lyrics } = detectPhrases('Ave\u00a0verum corpus,\r\nnatum de Maria')
    expect(lines(lyrics)).toEqual(['Ave verum corpus,', 'natum de Maria'])
  })
})

describe('describePhraseStats', () => {
  it('summarises what the pass did', () => {
    const { stats } = detectPhrases('Ky- ri- e\ne- le- i- son\nmf')
    expect(describePhraseStats(stats)).toContain('syllable')
    expect(describePhraseStats(stats)).toContain('score marking')
  })

  it('is empty when nothing happened', () => {
    const { stats } = detectPhrases('Ave verum corpus,\nNatum de Maria')
    expect(describePhraseStats(stats)).toBe('')
  })
})

describe('wordCount', () => {
  it('counts words, not characters', () => {
    expect(wordCount('  Ave   verum corpus ')).toBe(3)
    expect(wordCount('')).toBe(0)
  })
})
