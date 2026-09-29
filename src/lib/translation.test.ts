import { describe, expect, it } from 'vitest'
import {
  attachTranslations,
  detectLanguage,
  detectTranslations,
  hasTranslations,
  isTranslationLine,
  languageName,
  parseLyrics,
  stripTranslations,
  swapTranslationDirection,
  translationsByLineIndex,
  translationText,
} from './translation'

const GERMAN_ENGLISH = [
  'Ich habe genug',
  'I have enough for me',
  'mein Jesus ist da',
  'my Jesus is here',
  'und das ist mein Glück',
  'and that is my joy',
  'wenn ich nicht mehr kann',
  'when I can no longer go on',
]

describe('translation markers', () => {
  it('recognizes a marked row with or without a space', () => {
    expect(isTranslationLine('> hail true body')).toBe(true)
    expect(isTranslationLine('>hail true body')).toBe(true)
    expect(isTranslationLine('  > hail true body')).toBe(true)
    expect(isTranslationLine('Ave verum corpus')).toBe(false)
    expect(isTranslationLine('')).toBe(false)
  })

  it('reads the text out of a marked row', () => {
    expect(translationText('>  hail true body ')).toBe('hail true body')
  })

  it('strips translations back to the sung text', () => {
    const raw = 'Ave verum corpus\n> hail true body\nde Maria Virgine\n> of the Virgin Mary'
    expect(stripTranslations(raw)).toBe('Ave verum corpus\nde Maria Virgine')
    expect(hasTranslations(raw)).toBe(true)
    expect(hasTranslations('Ave verum corpus')).toBe(false)
  })
})

describe('parseLyrics', () => {
  it('attaches translations and numbers only the sung rows', () => {
    const raw = ['Verse 1', 'Ave verum corpus', '> hail true body', '', 'de Maria Virgine'].join('\n')
    expect(parseLyrics(raw)).toEqual([
      { kind: 'section', text: 'Verse 1' },
      { kind: 'lyric', text: 'Ave verum corpus', lineIndex: 0, translation: 'hail true body' },
      { kind: 'blank', text: '' },
      { kind: 'lyric', text: 'de Maria Virgine', lineIndex: 1 },
    ])
  })

  it('joins two translation rows under the same line', () => {
    const parsed = parseLyrics('Ave verum corpus\n> hail true body\n> born of Mary')
    expect(parsed[0].translation).toBe('hail true body born of Mary')
  })

  it('drops a marker with nothing above it to translate', () => {
    expect(parseLyrics('> orphan\nAve verum')).toEqual([
      { kind: 'lyric', text: 'Ave verum', lineIndex: 0 },
    ])
  })

  it('indexes translations the way cards are indexed', () => {
    const raw = ['Chorus', 'one', '> en', '', 'two', 'three', '> tre'].join('\n')
    expect(translationsByLineIndex(raw)).toEqual(['en', undefined, 'tre'])
  })
})

describe('attachTranslations', () => {
  it('writes translations back under their line', () => {
    const raw = attachTranslations([
      { text: 'Ave verum corpus', translation: 'hail true body' },
      { text: 'de Maria Virgine' },
      { text: 'vere passum', translation: '  ' },
    ])
    expect(raw).toBe('Ave verum corpus\n> hail true body\nde Maria Virgine\nvere passum')
  })

  it('round-trips through parseLyrics', () => {
    const lines = [
      { text: 'Ich habe genug', translation: 'I have enough' },
      { text: 'mein Jesus ist da', translation: 'my Jesus is here' },
    ]
    const parsed = parseLyrics(attachTranslations(lines))
    expect(parsed.map((l) => ({ text: l.text, translation: l.translation }))).toEqual(lines)
  })
})

describe('detectLanguage', () => {
  it('identifies languages from their function words', () => {
    expect(detectLanguage('und das ist mein Glück wenn ich nicht mehr kann')).toBe('de')
    expect(detectLanguage('and that is my joy when I can no longer go on')).toBe('en')
    expect(detectLanguage('og det er min glede når jeg ikke kan mer')).toBe('no')
  })

  it('returns null rather than guessing on a weak signal', () => {
    expect(detectLanguage('')).toBe(null)
    expect(detectLanguage('Lorem ipsum dolor')).toBe(null)
  })

  it('names languages for display', () => {
    expect(languageName('de')).toBe('German')
    expect(languageName(undefined)).toBe('Unknown')
    expect(languageName('xx')).toBe('xx')
  })
})

describe('detectTranslations — alternating rows', () => {
  it('marks every second row as the translation', () => {
    const result = detectTranslations(GERMAN_ENGLISH.join('\n'))
    expect(result.strategy).toBe('alternating')
    expect(result.marked).toBe(4)
    expect(result.sungLanguage).toBe('de')
    expect(result.translationLanguage).toBe('en')
    expect(stripTranslations(result.lyrics).split('\n')).toEqual([
      'Ich habe genug', 'mein Jesus ist da', 'und das ist mein Glück', 'wenn ich nicht mehr kann',
    ])
    expect(translationsByLineIndex(result.lyrics)).toEqual([
      'I have enough for me', 'my Jesus is here', 'and that is my joy', 'when I can no longer go on',
    ])
  })

  it('leaves a single-language text alone', () => {
    const raw = 'Ich habe genug\nmein Jesus ist da\nund das ist mein Glück\nwenn ich nicht mehr kann'
    const result = detectTranslations(raw)
    expect(result.strategy).toBe('none')
    expect(result.marked).toBe(0)
    expect(result.lyrics).toBe(raw)
    expect(result.sungLanguage).toBe('de')
  })

  it('leaves an odd number of rows alone', () => {
    const result = detectTranslations(GERMAN_ENGLISH.slice(0, 5).join('\n'))
    expect(result.strategy).toBe('none')
  })
})

describe('detectTranslations — bracketed rows', () => {
  it('unwraps a bracketed row into a translation', () => {
    const raw = [
      'Ave verum corpus natum',
      '(Hail, true body, born)',
      'de Maria Virgine',
      '(of the Virgin Mary)',
    ].join('\n')
    const result = detectTranslations(raw)
    expect(result.strategy).toBe('bracketed')
    expect(result.marked).toBe(2)
    expect(result.translationLanguage).toBe('en')
    expect(translationsByLineIndex(result.lyrics)).toEqual([
      'Hail, true body, born', 'of the Virgin Mary',
    ])
  })

  it('needs more than one bracketed row before acting', () => {
    const raw = 'Ave verum corpus natum\n(repeat)'
    expect(detectTranslations(raw).strategy).toBe('none')
  })
})

describe('detectTranslations — stacked blocks', () => {
  it('interleaves a translation printed as its own block', () => {
    const raw = [
      'Ich habe genug',
      'mein Jesus ist da',
      'und das ist mein Glück',
      'wenn ich nicht mehr kann',
      '',
      'I have enough for me',
      'my Jesus is here',
      'and that is my joy',
      'when I can no longer go on',
    ].join('\n')
    const result = detectTranslations(raw)
    expect(result.strategy).toBe('blocks')
    expect(result.marked).toBe(4)
    expect(result.sungLanguage).toBe('de')
    expect(result.translationLanguage).toBe('en')
    expect(translationsByLineIndex(result.lyrics)[0]).toBe('I have enough for me')
  })

  it('leaves two blocks of unequal length alone', () => {
    const raw = 'Ich habe genug\nmein Jesus ist da\n\nI have enough for me'
    expect(detectTranslations(raw).strategy).toBe('none')
  })

  it('leaves two stanzas of the same language alone', () => {
    const raw = 'Ich habe genug\nmein Jesus ist da\n\nund das ist mein Glück\nwenn ich nicht mehr kann'
    expect(detectTranslations(raw).strategy).toBe('none')
  })
})

describe('detectTranslations — already marked', () => {
  it('reports markers that are already there without changing anything', () => {
    const raw = 'Ich habe genug\n> I have enough for me\nmein Jesus ist da\n> my Jesus is here'
    const result = detectTranslations(raw)
    expect(result.strategy).toBe('marked')
    expect(result.marked).toBe(2)
    expect(result.lyrics).toBe(raw)
    expect(result.translationLanguage).toBe('en')
  })
})

describe('swapTranslationDirection', () => {
  it('turns the translation into the sung text and back', () => {
    const raw = 'Ich habe genug\n> I have enough\nmein Jesus ist da\n> my Jesus is here'
    const swapped = swapTranslationDirection(raw)
    expect(swapped).toBe('I have enough\n> Ich habe genug\nmy Jesus is here\n> mein Jesus ist da')
    expect(swapTranslationDirection(swapped)).toBe(raw)
  })

  it('keeps blank rows and section labels in place', () => {
    const raw = 'Verse 1\none\n> en\n\ntwo\n> to'
    expect(swapTranslationDirection(raw)).toBe('Verse 1\nen\n> one\n\nto\n> two')
  })

  it('leaves rows with no translation untouched', () => {
    expect(swapTranslationDirection('one\ntwo')).toBe('one\ntwo')
  })
})
