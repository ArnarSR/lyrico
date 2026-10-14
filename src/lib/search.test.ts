import { describe, expect, it } from 'vitest'
import type { Card, Song } from '../types'
import {
  normalizeForSearch,
  sameTitle,
  scoreSong,
  searchSongs,
  searchSongsDetailed,
  searchTerms,
} from './search'

function card(text: string, i: number): Card {
  return {
    id: `c${i}`,
    lineIndex: i,
    text,
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    nextDue: 0,
    lastQuality: null,
    difficulty: 0,
  }
}

function song(partial: Partial<Song> & { title: string }): Song {
  const lines = partial.lyrics?.split('\n').filter((l) => l.trim()) ?? []
  return {
    id: partial.title,
    lyrics: '',
    cards: partial.cards ?? lines.map(card),
    createdAt: 0,
    ...partial,
  }
}

const gamleNorge = song({
  title: 'Gamle Norge',
  composer: 'Bjørnstjerne Bjørnson',
  voicePart: 'Tenor',
  lyrics: 'Ja vi elsker dette landet\nsom det stiger frem',
})

const hymne = song({
  title: "Hymne a l'amour",
  composer: 'Edith Piaf',
  lyrics: 'Le ciel bleu sur nous peut s’effondrer',
})

const ettGlass = song({
  title: 'Ett glass',
  composer: 'Jon Ranes',
  voicePart: 'Tenor',
  lyrics: 'Et glass med rom og vann',
})

const library = [gamleNorge, hymne, ettGlass]

describe('normalizeForSearch', () => {
  it('folds Nordic letters so a plain keyboard still matches', () => {
    expect(normalizeForSearch('Søndag')).toBe(' sondag ')
    expect(normalizeForSearch('Bjørnson')).toBe(' bjornson ')
    expect(normalizeForSearch('Måne')).toBe(' mane ')
    expect(normalizeForSearch('Æsir')).toBe(' aesir ')
  })

  it('strips accents', () => {
    expect(normalizeForSearch('Fauré')).toBe(' faure ')
    expect(normalizeForSearch('Über')).toBe(' uber ')
  })

  it('joins across apostrophes rather than splitting', () => {
    expect(normalizeForSearch("l'amour")).toBe(' lamour ')
    expect(normalizeForSearch('that’ll')).toBe(' thatll ')
  })

  it('collapses punctuation and whitespace to single spaces', () => {
    expect(normalizeForSearch('  Ave,  verum —  corpus! ')).toBe(' ave verum corpus ')
  })

  it('pads so a word-start test is a plain substring test', () => {
    expect(normalizeForSearch('glass').startsWith(' ')).toBe(true)
    expect(normalizeForSearch('glass').endsWith(' ')).toBe(true)
  })
})

describe('searchTerms', () => {
  it('splits a query into normalized terms', () => {
    expect(searchTerms('Gamle  Norge')).toEqual(['gamle', 'norge'])
  })

  it('is empty for a query with nothing to match on', () => {
    expect(searchTerms('   ')).toEqual([])
    expect(searchTerms('—')).toEqual([])
  })
})

describe('searchSongs', () => {
  it('returns the list untouched for an empty query', () => {
    expect(searchSongs(library, '')).toEqual(library)
    expect(searchSongs(library, '  ')).toEqual(library)
  })

  it('finds a song by title', () => {
    expect(searchSongs(library, 'gamle').map((s) => s.title)).toEqual(['Gamle Norge'])
  })

  it('finds a song by composer', () => {
    expect(searchSongs(library, 'piaf').map((s) => s.title)).toEqual(["Hymne a l'amour"])
  })

  it('finds a song by a line the singer half-remembers', () => {
    expect(searchSongs(library, 'elsker dette').map((s) => s.title)).toEqual(['Gamle Norge'])
  })

  it('finds a song by voice part', () => {
    expect(searchSongs(library, 'tenor').map((s) => s.title).sort()).toEqual([
      'Ett glass',
      'Gamle Norge',
    ])
  })

  it('matches terms in any order and across fields', () => {
    expect(searchSongs(library, 'piaf amour').map((s) => s.title)).toEqual(["Hymne a l'amour"])
    expect(searchSongs(library, 'amour piaf').map((s) => s.title)).toEqual(["Hymne a l'amour"])
  })

  it('requires every term to match (AND, not OR)', () => {
    expect(searchSongs(library, 'piaf norge')).toEqual([])
  })

  it('ignores case and Nordic spelling', () => {
    expect(searchSongs(library, 'BJORNSON').map((s) => s.title)).toEqual(['Gamle Norge'])
    expect(searchSongs(library, 'bjørnson').map((s) => s.title)).toEqual(['Gamle Norge'])
  })

  it('ranks a title match above a lyrics match for the same word', () => {
    const titled = song({ title: 'Glass', lyrics: 'nothing relevant here' })
    const inLyrics = song({ title: 'Something else', lyrics: 'a glass of water' })
    expect(searchSongs([inLyrics, titled], 'glass').map((s) => s.title)).toEqual([
      'Glass',
      'Something else',
    ])
  })

  it('ranks a title that starts with the query first', () => {
    const starts = song({ title: 'Ave verum corpus' })
    const contains = song({ title: 'Jesu dulcis ave' })
    expect(searchSongs([contains, starts], 'ave').map((s) => s.title)).toEqual([
      'Ave verum corpus',
      'Jesu dulcis ave',
    ])
  })

  it('matches inside a word, so a partial spelling still finds the song', () => {
    expect(searchSongs(library, 'orge').map((s) => s.title)).toEqual(['Gamle Norge'])
  })

  it('returns nothing when no song matches', () => {
    expect(searchSongs(library, 'zzzz')).toEqual([])
  })

  it('does not match a song with no composer on an empty composer field', () => {
    const noComposer = song({ title: 'Untitled' })
    expect(scoreSong(noComposer, ['anything'])).toBeNull()
  })
})

describe('searchSongsDetailed', () => {
  it('reports which field matched', () => {
    const [hit] = searchSongsDetailed(library, 'elsker')
    expect(hit.song.title).toBe('Gamle Norge')
    expect(hit.matchedIn).toEqual(['lyrics'])
  })

  it('reports several fields when the terms land in different places', () => {
    const [hit] = searchSongsDetailed(library, 'hymne piaf')
    expect(hit.matchedIn).toEqual(['title', 'composer'])
  })
})

describe('sameTitle', () => {
  it('treats spelling and punctuation differences as the same song', () => {
    expect(sameTitle('Gamle Norge', 'gamle  norge')).toBe(true)
    expect(sameTitle("Hymne a l'amour", 'Hymne a lamour')).toBe(true)
    expect(sameTitle('Søndag', 'Sondag')).toBe(true)
  })

  it('keeps different songs apart', () => {
    expect(sameTitle('Gamle Norge', 'Ett glass')).toBe(false)
  })
})
