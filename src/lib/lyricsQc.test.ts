import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkLyrics,
  isSafeReplacement,
  needsAttention,
  sortIssues,
  type LyricsIssue,
  type LyricsReview,
} from './lyricsQc'

function issue(over: Partial<LyricsIssue> = {}): LyricsIssue {
  return {
    type: 'ocr_artifact',
    severity: 'warning',
    line: 1,
    quote: '',
    problem: '',
    suggestion: '',
    ...over,
  }
}

describe('sortIssues', () => {
  it('puts blockers before warnings before nits', () => {
    const sorted = sortIssues([
      issue({ severity: 'nit', line: 1 }),
      issue({ severity: 'blocker', line: 9 }),
      issue({ severity: 'warning', line: 5 }),
    ])
    expect(sorted.map((i) => i.severity)).toEqual(['blocker', 'warning', 'nit'])
  })

  it('reads top-down within a severity', () => {
    const sorted = sortIssues([
      issue({ severity: 'warning', line: 12 }),
      issue({ severity: 'warning', line: 3 }),
    ])
    expect(sorted.map((i) => i.line)).toEqual([3, 12])
  })

  it('leaves the caller’s array alone', () => {
    const input = [issue({ severity: 'nit' }), issue({ severity: 'blocker' })]
    sortIssues(input)
    expect(input[0].severity).toBe('nit')
  })
})

describe('needsAttention', () => {
  const review = (over: Partial<LyricsReview>): LyricsReview => ({
    verdict: 'clean',
    language: 'la',
    summary: '',
    issues: [],
    cleanedLyrics: '',
    titleSuggestion: '',
    composerSuggestion: '',
    sources: [],
    verified: false,
    origin: 'typed',
    lineCount: 4,
    checkedLyrics: '',
    ...over,
  })

  it('is false for a clean review', () => {
    expect(needsAttention(review({}))).toBe(false)
  })

  it('is false when only nits were found', () => {
    expect(needsAttention(review({ verdict: 'minor', issues: [issue({ severity: 'nit' })] }))).toBe(false)
  })

  it('is true for a blocker even when the verdict is mild', () => {
    expect(needsAttention(review({ verdict: 'minor', issues: [issue({ severity: 'blocker' })] }))).toBe(true)
  })

  it('is true when the verdict says so', () => {
    expect(needsAttention(review({ verdict: 'needs_work' }))).toBe(true)
  })
})

describe('isSafeReplacement', () => {
  const four = 'Ave verum corpus\nnatum de Maria Virgine\nvere passum immolatum\nin cruce pro homine'

  it('accepts a same-size correction', () => {
    expect(isSafeReplacement(four, four.replace('vere', 'Vere'))).toBe(true)
  })

  it('accepts dropping a couple of scan leftovers', () => {
    expect(isSafeReplacement(four, 'Ave verum corpus\nnatum de Maria Virgine\nvere passum immolatum')).toBe(true)
  })

  it('ignores blank lines when comparing', () => {
    expect(isSafeReplacement(four, four.split('\n').join('\n\n'))).toBe(true)
  })

  it('refuses a text that lost most of its lines', () => {
    expect(isSafeReplacement(four, 'Ave verum corpus')).toBe(false)
  })

  it('refuses an empty replacement', () => {
    expect(isSafeReplacement(four, '   \n\n')).toBe(false)
  })

  it('refuses a text that grew by half again — invented verses', () => {
    expect(isSafeReplacement(four, [...four.split('\n'), 'one', 'two', 'three'].join('\n'))).toBe(false)
  })

  it('refuses a same-size text whose lines are mostly new', () => {
    expect(isSafeReplacement(four, 'Panis angelicus\nfit panis hominum\ndat panis coelicus\nfiguris terminum')).toBe(false)
  })

  it('accepts re-punctuating and re-casing a line', () => {
    expect(isSafeReplacement(four, four.replace('in cruce pro homine', 'In cruce pro homine.'))).toBe(true)
  })

  describe('with a URL import', () => {
    // What /api/fetch-lyrics really returns: two sung lines in a page of furniture.
    const scraped = [
      'Ave Verum Corpus — Lyrics',
      'Home | Songs | Composers',
      'Ave verum corpus',
      'natum de Maria Virgine',
      'Lyrics licensed by LyricFind',
      'Related songs you might like',
      '1 234 views · 12 comments',
      'Print this page',
    ].join('\n')

    // What the reviewer actually gets back from a scrape of a scanned page.
    const withScanArtifacts = [
      'Ave Verum Corpus — Lyrics',
      'Home | Songs | Composers',
      'Ave verum corpus, natum de Maria Virgine',
      'Ve- re pas- sum, immolatum in cruce pro homine',
      'Lyrics licensed by LyricFind',
      'Print this page',
    ].join('\n')

    it('accepts stripping the page down to the sung lines', () => {
      expect(isSafeReplacement(scraped, 'Ave verum corpus\nnatum de Maria Virgine', 'url')).toBe(true)
    })

    it('still refuses that cut for text someone typed themselves', () => {
      expect(isSafeReplacement(scraped, 'Ave verum corpus\nnatum de Maria Virgine', 'typed')).toBe(false)
    })

    it('accepts the real shape of a cleanup: junk dropped, rows split, hyphens rejoined', () => {
      const cleaned = [
        'Ave verum corpus',
        'natum de Maria Virgine',
        'Vere passum, immolatum',
        'in cruce pro homine',
      ].join('\n')
      // Every line is new as a line — the split rows and the rejoined "Ve- re"
      // see to that — but the words are the page's own.
      expect(isSafeReplacement(withScanArtifacts, cleaned, 'url')).toBe(true)
    })

    it('refuses a URL import whose lyrics were replaced wholesale', () => {
      expect(isSafeReplacement(scraped, 'Panis angelicus\nfit panis hominum', 'url')).toBe(false)
    })
  })
})

describe('checkLyrics', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('posts the song and returns a sorted, defaulted review', async () => {
    const fetchMock = stubFetch(200, {
      verdict: 'needs_work',
      language: 'la',
      summary: 'Two scan leftovers.',
      issues: [issue({ severity: 'nit', line: 4 }), issue({ severity: 'blocker', line: 2 })],
      lineCount: 4,
    })

    const review = await checkLyrics({ title: 'Ave Verum', composer: 'Mozart', lyrics: 'a\r\nb' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/check-lyrics')
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Ave Verum',
      composer: 'Mozart',
      lyrics: 'a\nb',       // CRLF normalised before it leaves the client
      verify: false,
      origin: 'typed',      // default when the caller does not say
    })
    expect(review.issues.map((i) => i.severity)).toEqual(['blocker', 'nit'])
    expect(review.cleanedLyrics).toBe('')
    expect(review.sources).toEqual([])
    expect(review.checkedLyrics).toBe('a\nb')
  })

  it('tells the reviewer where an imported text came from', async () => {
    const fetchMock = stubFetch(200, { verdict: 'needs_work' })
    const review = await checkLyrics({
      title: 'T',
      lyrics: 'a',
      origin: 'url',
      sourceUrl: 'https://example.com/ave-verum',
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({
      origin: 'url',
      sourceUrl: 'https://example.com/ave-verum',
    })
    // Echoed back for the apply-fixes guard, even when the server omits it.
    expect(review.origin).toBe('url')
  })

  it('passes verify through when a deep check was asked for', async () => {
    const fetchMock = stubFetch(200, { verdict: 'clean' })
    await checkLyrics({ title: 'T', lyrics: 'a', verify: true })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).verify).toBe(true)
  })

  it('throws the server’s own message', async () => {
    stubFetch(502, { error: 'The request was declined.' })
    await expect(checkLyrics({ title: 'T', lyrics: 'a' })).rejects.toThrow('The request was declined.')
  })

  it('throws on a response body it cannot use', async () => {
    stubFetch(200, { notAReview: true })
    await expect(checkLyrics({ title: 'T', lyrics: 'a' })).rejects.toThrow(/unexpected response/)
  })
})
