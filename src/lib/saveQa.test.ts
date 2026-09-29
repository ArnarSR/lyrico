import { describe, expect, it } from 'vitest'
import { buildSaveQa, flaggedRows, type SaveQaReport } from './saveQa'

const check = (report: SaveQaReport, id: string) => report.checks.find((c) => c.id === id)!

const clean = {
  title: 'Ave Verum Corpus',
  composer: 'Mozart',
  voicePart: 'Tenor',
  concertDate: Date.UTC(2026, 4, 17),
  hasAudio: true,
  lyrics: 'Ave verum corpus,\nnatum de Maria Virgine\n\nvere passum immolatum\nin cruce pro homine',
}

describe('buildSaveQa — a text that is ready', () => {
  const report = buildSaveQa(clean)

  it('counts the cards that will be created', () => {
    expect(report.lineCount).toBe(4)
    expect(check(report, 'line_count').status).toBe('ok')
    expect(check(report, 'line_count').detail).toContain('4 lines')
  })

  it('passes every check and asks for nothing', () => {
    expect(report.needsAttention).toBe(false)
    expect(report.blocked).toBe(false)
    expect(report.checks.every((c) => c.status !== 'warn')).toBe(true)
    expect(flaggedRows(report)).toEqual([])
  })
})

describe('buildSaveQa — lines to look at', () => {
  it('flags a line with nothing to sing', () => {
    const report = buildSaveQa({ ...clean, lyrics: 'Ave verum corpus\n...\nvere passum' })
    expect(check(report, 'every_line_has_text').status).toBe('warn')
    expect(check(report, 'every_line_has_text').lines).toEqual([2])
    expect(report.needsAttention).toBe(true)
  })

  it('flags a row that is more than one phrase', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve'
    const report = buildSaveQa({ ...clean, lyrics: `Ave verum corpus\n${long}` })
    expect(check(report, 'phrase_length').status).toBe('warn')
    expect(check(report, 'phrase_length').lines).toEqual([2])
    expect(check(report, 'phrase_length').detail).toContain('split')
  })

  it('reports repeated lines without treating them as a problem', () => {
    const report = buildSaveQa({ ...clean, lyrics: 'Kyrie eleison\nChriste eleison\nKyrie eleison' })
    expect(check(report, 'duplicates').status).toBe('info')
    expect(check(report, 'duplicates').lines).toEqual([3])
    expect(report.needsAttention).toBe(false)
  })

  it('flags a syllable hyphen a scan left behind', () => {
    const report = buildSaveQa({ ...clean, lyrics: 'Ky- ri- e eleison\nChriste eleison' })
    expect(check(report, 'clean_text').status).toBe('warn')
    expect(check(report, 'clean_text').lines).toEqual([1])
  })

  it('flags mojibake from a bad import', () => {
    const report = buildSaveQa({ ...clean, lyrics: 'Ave verum corpus\nnÃ¥de og fred' })
    expect(check(report, 'clean_text').status).toBe('warn')
    expect(check(report, 'clean_text').lines).toEqual([2])
  })

  it('flags a score marking left inside a line', () => {
    const report = buildSaveQa({ ...clean, lyrics: 'Ave verum corpus cresc.\nvere passum' })
    expect(check(report, 'clean_text').status).toBe('warn')
  })

  it('collects every flagged row for the editor to highlight', () => {
    const report = buildSaveQa({
      ...clean,
      lyrics: 'Ky- ri- e\n...\none two three four five six seven eight nine ten eleven',
    })
    expect(flaggedRows(report)).toEqual([1, 2, 3])
  })
})

describe('buildSaveQa — the second language', () => {
  it('reports the translation as kept, not drilled', () => {
    const report = buildSaveQa({
      ...clean,
      lyrics: 'Ich habe genug\n> I have enough for me\nmein Jesus ist da\n> my Jesus is here',
    })
    expect(report.lineCount).toBe(2)
    expect(report.translationCount).toBe(2)
    const translation = check(report, 'translation')
    expect(translation.status).toBe('info')
    expect(translation.detail).toContain('2 of 2 lines')
    expect(translation.detail).toContain('English')
    expect(translation.detail).toContain('German')
    expect(translation.detail).toContain('after Check')
  })

  it('says nothing about translations when there are none', () => {
    expect(check(buildSaveQa(clean), 'translation')).toBeUndefined()
  })

  it('reports section labels as stanza separators', () => {
    const report = buildSaveQa({ ...clean, lyrics: 'Verse 1\nAve verum corpus\n\nChorus\nvere passum' })
    expect(report.lineCount).toBe(2)
    expect(check(report, 'section_labels').status).toBe('info')
    expect(check(report, 'section_labels').detail).toContain('Verse 1')
  })
})

describe('buildSaveQa — rehearsal fields', () => {
  it('lists the ones that are still empty without making them a problem', () => {
    const report = buildSaveQa({ title: 'Ave Verum', lyrics: 'Ave verum corpus' })
    const fields = check(report, 'rehearsal_fields')
    expect(fields.status).toBe('info')
    expect(fields.detail).toContain('composer')
    expect(fields.detail).toContain('voice part')
    expect(fields.detail).toContain('concert date')
    expect(fields.detail).toContain('audio')
    expect(report.needsAttention).toBe(false)
  })

  it('confirms them when they are all set', () => {
    expect(check(buildSaveQa(clean), 'rehearsal_fields').status).toBe('ok')
  })

  it('leaves them out when editing lyrics, where they are not on screen', () => {
    const report = buildSaveQa({ title: '', lyrics: 'Ave verum corpus', includeMetadata: false })
    expect(check(report, 'rehearsal_fields')).toBeUndefined()
    expect(check(report, 'title')).toBeUndefined()
    expect(report.blocked).toBe(false)
  })
})

describe('buildSaveQa — blocked saves', () => {
  it('blocks a text with no lines', () => {
    const report = buildSaveQa({ ...clean, lyrics: 'Verse 1\n\n' })
    expect(report.lineCount).toBe(0)
    expect(report.blocked).toBe(true)
    expect(check(report, 'line_count').status).toBe('warn')
  })

  it('blocks a missing title', () => {
    const report = buildSaveQa({ ...clean, title: '  ' })
    expect(report.blocked).toBe(true)
    expect(check(report, 'title').status).toBe('warn')
  })
})
