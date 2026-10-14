/**
 * Song search.
 *
 * A choir singer looks for a song in one of three ways: by its title, by the
 * composer whose name is on the score, or — more often than you would think —
 * by a line they can half-remember and nothing else. All three go through the
 * same matcher so "Find a song" means the same thing everywhere it appears: the
 * library, the picker that adds a song to a personal list, and the picker that
 * adds one to a group's practice list.
 *
 * Matching is deliberately forgiving:
 *
 * - diacritics and the Nordic letters fold away, so "gamle norge" finds
 *   "Gamle Norge" and "sondag" finds "Søndag" — a phone keyboard in a hurry
 *   does not reliably produce ø
 * - the query is split into terms and every term has to match somewhere (AND),
 *   so "piaf amour" finds "Hymne a l'amour" by Edith Piaf without the terms
 *   having to be adjacent or in order
 * - a term matches at the start of any word, or anywhere inside the text —
 *   word starts just rank higher
 *
 * Ranking puts the title first, then composer, then voice part, then the lyrics,
 * so typing a word that happens to appear in one song's text never buries the
 * song that is actually called that.
 */
import type { Song } from '../types'

export type SongSearchField = 'title' | 'composer' | 'voicePart' | 'lyrics'

export interface SongMatch {
  song: Song
  score: number
  /** Which fields the query matched — lets the UI say "found in the lyrics". */
  matchedIn: SongSearchField[]
}

/** Title beats composer beats voice part beats a line buried in the text. */
const FIELD_WEIGHT: Record<SongSearchField, number> = {
  title: 100,
  composer: 40,
  voicePart: 25,
  lyrics: 10,
}

/** Letters that NFD leaves alone because they are letters, not accented ones. */
const LETTER_FOLDING: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  å: 'a',
  ð: 'd',
  þ: 'th',
  ß: 'ss',
  œ: 'oe',
  ł: 'l',
  đ: 'd',
}

/**
 * Lower-cased, accent-free, punctuation-free text with single spaces, padded
 * with one leading and trailing space so a word-start test is just a search for
 * `" " + term`.
 */
export function normalizeForSearch(text: string): string {
  const folded = text
    .toLowerCase()
    .replace(/[øæåðþßœłđ]/g, (c) => LETTER_FOLDING[c] ?? c)
    // Strip combining marks left behind by the decomposition (é → e, ü → u).
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
  // Apostrophes join rather than split: "l'amour" should still contain "amour"
  // as a word, and "that'll" should not become the two words "that" and "ll".
  const stripped = folded.replace(/['’`´]/g, '')
  return ` ${stripped.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
}

/** The query's terms, normalized. Empty when the query has nothing to match. */
export function searchTerms(query: string): string[] {
  return normalizeForSearch(query).split(' ').filter((t) => t.length > 0)
}

interface Haystack {
  title: string
  composer: string
  voicePart: string
  lyrics: string
}

function haystack(song: Song): Haystack {
  return {
    title: normalizeForSearch(song.title),
    composer: normalizeForSearch(song.composer ?? ''),
    voicePart: normalizeForSearch(song.voicePart ?? ''),
    // The cards hold the sung lines already split out from the raw text, so
    // translation rows and section labels are not searched — the singer is
    // looking for something they sing.
    lyrics: normalizeForSearch(song.cards.map((c) => c.text).join(' ')),
  }
}

const FIELDS: SongSearchField[] = ['title', 'composer', 'voicePart', 'lyrics']

/**
 * How well one term matches one field: 0 for no match, the field's weight for a
 * match inside a word, double for a match at the start of a word, and a further
 * bonus when the term is the whole field (searching "tenor" and finding the
 * voice part Tenor).
 */
function scoreTerm(term: string, field: SongSearchField, text: string): number {
  if (text.length <= 2) return 0 // just the padding: the field is empty
  const weight = FIELD_WEIGHT[field]
  if (text === ` ${term} `) return weight * 3
  if (text.includes(` ${term}`)) return weight * 2
  if (text.includes(term)) return weight
  return 0
}

/**
 * Scores a song against an already-tokenized query. Returns null when any term
 * matches nothing — every term has to land somewhere for the song to show up.
 */
export function scoreSong(song: Song, terms: string[]): SongMatch | null {
  if (terms.length === 0) return { song, score: 0, matchedIn: [] }

  const hay = haystack(song)
  const matchedIn = new Set<SongSearchField>()
  let score = 0

  for (const term of terms) {
    let best = 0
    let bestField: SongSearchField | null = null
    for (const field of FIELDS) {
      const s = scoreTerm(term, field, hay[field])
      if (s > best) {
        best = s
        bestField = field
      }
    }
    if (best === 0) return null
    score += best
    if (bestField) matchedIn.add(bestField)
  }

  // A song whose title starts with the whole query is what the singer meant.
  const whole = terms.join(' ')
  if (hay.title.startsWith(` ${whole}`)) score += 500

  return { song, score, matchedIn: FIELDS.filter((f) => matchedIn.has(f)) }
}

/**
 * Filters and ranks songs for a query. An empty query returns the list
 * unchanged — the caller's own order (most recent first, say) is the right
 * answer when nothing has been typed.
 */
export function searchSongs<T extends Song>(songs: T[], query: string): T[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return songs

  const matches: { song: T; score: number }[] = []
  for (const song of songs) {
    const match = scoreSong(song, terms)
    if (match) matches.push({ song, score: match.score })
  }

  return matches
    .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title))
    .map((m) => m.song)
}

/** Ranked matches with the fields each one hit, for UIs that show why. */
export function searchSongsDetailed(songs: Song[], query: string): SongMatch[] {
  const terms = searchTerms(query)
  const matches = songs
    .map((song) => scoreSong(song, terms))
    .filter((m): m is SongMatch => m !== null)

  if (terms.length === 0) return matches
  return matches.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title))
}

/**
 * True when two titles are the same song as far as a human is concerned —
 * used to warn about a duplicate before a second copy is saved.
 */
export function sameTitle(a: string, b: string): boolean {
  return normalizeForSearch(a) === normalizeForSearch(b)
}
