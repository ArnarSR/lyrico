import { describe, expect, it } from 'vitest'
import {
  canMoveWordToNext,
  canMoveWordToPrev,
  canSplitAtWord,
  moveWordToNextLine,
  moveWordToPrevLine,
  splitLineAtWord,
  splitWords,
  type EditableLine,
} from './lineEdit'

const rows = (...texts: string[]): EditableLine[] => texts.map((text) => ({ text }))
const texts = (lines: EditableLine[]) => lines.map((l) => l.text)

describe('splitWords', () => {
  it('splits on any run of whitespace', () => {
    expect(splitWords('  Ave   verum\tcorpus ')).toEqual(['Ave', 'verum', 'corpus'])
    expect(splitWords('   ')).toEqual([])
  })
})

describe('moveWordToPrevLine', () => {
  it('appends the word to the end of the row above', () => {
    const result = moveWordToPrevLine(rows('Ave verum', 'corpus natum'), 1, 0)!
    expect(texts(result.lines)).toEqual(['Ave verum corpus', 'natum'])
    expect(result.changed).toEqual([0, 1])
    expect(result.focus).toEqual({ line: 0, word: 2 })
  })

  it('can move a word from the middle of a row', () => {
    const result = moveWordToPrevLine(rows('Ave', 'verum corpus natum'), 1, 1)!
    expect(texts(result.lines)).toEqual(['Ave corpus', 'verum natum'])
  })

  it('removes the row when its last word leaves', () => {
    const result = moveWordToPrevLine(rows('Ave verum', 'corpus', 'natum'), 1, 0)!
    expect(texts(result.lines)).toEqual(['Ave verum corpus', 'natum'])
    expect(result.removed).toBe(1)
    expect(result.inserted).toBeUndefined()
  })

  it('refuses on the first row', () => {
    expect(moveWordToPrevLine(rows('Ave verum', 'corpus'), 0, 0)).toBe(null)
    expect(canMoveWordToPrev(rows('Ave verum', 'corpus'), 0)).toBe(false)
    expect(canMoveWordToPrev(rows('Ave verum', 'corpus'), 1)).toBe(true)
  })

  it('refuses a word index that is not there', () => {
    expect(moveWordToPrevLine(rows('Ave', 'verum'), 1, 3)).toBe(null)
  })

  it('carries a dropped row translation up rather than losing it', () => {
    const lines: EditableLine[] = [
      { text: 'Ave verum', translation: 'hail true' },
      { text: 'corpus', translation: 'body' },
    ]
    const result = moveWordToPrevLine(lines, 1, 0)!
    expect(result.lines).toEqual([{ text: 'Ave verum corpus', translation: 'hail true body' }])
  })

  it('leaves the translation with its row on an ordinary move', () => {
    const lines: EditableLine[] = [
      { text: 'Ave verum', translation: 'hail true' },
      { text: 'corpus natum', translation: 'body born' },
    ]
    const result = moveWordToPrevLine(lines, 1, 0)!
    expect(result.lines).toEqual([
      { text: 'Ave verum corpus', translation: 'hail true' },
      { text: 'natum', translation: 'body born' },
    ])
  })
})

describe('moveWordToNextLine', () => {
  it('prepends the word to the row below', () => {
    const result = moveWordToNextLine(rows('Ave verum corpus', 'natum'), 0, 2)!
    expect(texts(result.lines)).toEqual(['Ave verum', 'corpus natum'])
    expect(result.changed).toEqual([0, 1])
    expect(result.focus).toEqual({ line: 1, word: 0 })
  })

  it('removes the row when its last word leaves', () => {
    const result = moveWordToNextLine(rows('Ave', 'verum corpus'), 0, 0)!
    expect(texts(result.lines)).toEqual(['Ave verum corpus'])
    expect(result.removed).toBe(0)
    expect(result.focus).toEqual({ line: 0, word: 0 })
  })

  it('refuses on the last row', () => {
    expect(moveWordToNextLine(rows('Ave verum', 'corpus'), 1, 0)).toBe(null)
    expect(canMoveWordToNext(rows('Ave verum', 'corpus'), 1)).toBe(false)
    expect(canMoveWordToNext(rows('Ave verum', 'corpus'), 0)).toBe(true)
  })

  it('carries a dropped row translation down', () => {
    const lines: EditableLine[] = [
      { text: 'Ave', translation: 'hail' },
      { text: 'verum corpus' },
    ]
    const result = moveWordToNextLine(lines, 0, 0)!
    expect(result.lines).toEqual([{ text: 'Ave verum corpus', translation: 'hail' }])
  })
})

describe('splitLineAtWord', () => {
  it('starts a new row at the chosen word', () => {
    const result = splitLineAtWord(rows('Ave verum corpus natum de Maria'), 0, 3)!
    expect(texts(result.lines)).toEqual(['Ave verum corpus', 'natum de Maria'])
    expect(result.inserted).toBe(1)
    expect(result.changed).toEqual([0])
    expect(result.focus).toEqual({ line: 1, word: 0 })
  })

  it('keeps the rows around the split in place', () => {
    const result = splitLineAtWord(rows('first', 'one two three', 'last'), 1, 1)!
    expect(texts(result.lines)).toEqual(['first', 'one', 'two three', 'last'])
  })

  it('refuses to split before the first word or past the last', () => {
    expect(splitLineAtWord(rows('one two'), 0, 0)).toBe(null)
    expect(splitLineAtWord(rows('one two'), 0, 2)).toBe(null)
    expect(canSplitAtWord(rows('one two'), 0, 1)).toBe(true)
    expect(canSplitAtWord(rows('one two'), 0, 0)).toBe(false)
  })

  it('leaves the translation on the first half', () => {
    const lines: EditableLine[] = [{ text: 'one two three four', translation: 'en to tre fire' }]
    const result = splitLineAtWord(lines, 0, 2)!
    expect(result.lines).toEqual([
      { text: 'one two', translation: 'en to tre fire' },
      { text: 'three four' },
    ])
  })
})

describe('never loses a word', () => {
  const start = rows('Ave verum corpus', 'natum de Maria Virgine', 'vere passum')
  const allWords = (lines: EditableLine[]) => lines.flatMap((l) => splitWords(l.text)).join(' ')

  it('keeps every word through a sequence of moves and splits', () => {
    const before = allWords(start)
    let lines = start
    lines = moveWordToPrevLine(lines, 1, 0)!.lines
    lines = moveWordToNextLine(lines, 0, 0)!.lines
    lines = splitLineAtWord(lines, 1, 1)!.lines
    lines = moveWordToPrevLine(lines, 2, 0)!.lines
    expect(allWords(lines).split(' ').sort()).toEqual(before.split(' ').sort())
  })
})
