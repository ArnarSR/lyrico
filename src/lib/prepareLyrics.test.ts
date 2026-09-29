import { describe, expect, it } from 'vitest'
import { describePrepare, prepareLyrics } from './prepareLyrics'
import { stripTranslations, translationsByLineIndex } from './translation'

describe('prepareLyrics', () => {
  it('finds the translation before phrasing touches it', () => {
    // Every English row here starts in lower case and every German row ends
    // without punctuation: phrase detection on its own would merge them.
    const raw = [
      'Ich habe genug',
      'and I have enough for me',
      'mein Jesus ist da',
      'my Jesus is here with me',
      'und das ist mein Glück',
      'and that is all my joy',
      'wenn ich nicht mehr kann',
      'when I can go on no more',
    ].join('\n')

    const result = prepareLyrics(raw)
    expect(result.translation.strategy).toBe('alternating')
    expect(stripTranslations(result.lyrics).split('\n')).toEqual([
      'Ich habe genug', 'mein Jesus ist da', 'und das ist mein Glück', 'wenn ich nicht mehr kann',
    ])
    expect(translationsByLineIndex(result.lyrics)[0]).toBe('and I have enough for me')
    expect(result.phrases.merged).toBe(0)
  })

  it('cleans up a scan the way the singer would', () => {
    const raw = [
      'Sopran: Ky- ri- e',
      'e- le- i- son',
      'mf',
      '12',
      'Chri- ste',
      'eleison',
    ].join('\n')

    const result = prepareLyrics(raw)
    expect(result.lyrics.split('\n')).toEqual(['Kyrie eleison', 'Christe eleison'])
    expect(result.changed).toBe(true)
  })

  it('leaves a text that is already right alone', () => {
    const raw = 'Ave verum corpus,\nnatum de Maria Virgine'
    const result = prepareLyrics(raw)
    expect(result.lyrics).toBe(raw)
    expect(result.changed).toBe(false)
    expect(describePrepare(result)).toBe('')
  })

  it('describes what it changed', () => {
    const result = prepareLyrics('Ky- ri- e\neleison\nmf')
    const description = describePrepare(result)
    expect(description).toContain('joined')
    expect(description).toContain('syllables rejoined')
    expect(description).toContain('score markings removed')
  })

  it('mentions translations it set aside', () => {
    const raw = 'Ave verum corpus natum\n(Hail, true body, born)\nde Maria Virgine\n(of the Virgin Mary)'
    expect(describePrepare(prepareLyrics(raw))).toContain('2 translation lines set aside')
  })

  it('does not report already-marked translations as a change', () => {
    const raw = 'Ave verum corpus,\n> hail true body'
    const result = prepareLyrics(raw)
    expect(result.translation.strategy).toBe('marked')
    expect(describePrepare(result)).toBe('')
    expect(result.changed).toBe(false)
  })
})
