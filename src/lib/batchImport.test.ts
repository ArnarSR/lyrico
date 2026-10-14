import { describe, expect, it, vi } from 'vitest'
import {
  gradeOutcome,
  jobsFromFiles,
  parseBatchList,
  runBatch,
  runJob,
  stageLabel,
  summarize,
  titleFromFilename,
  type BatchDeps,
  type BatchJob,
} from './batchImport'
import type { LyricsReview } from './lyricsQc'
import { LyricsSourceError, type LyricsSearchResult, type LyricsVersion } from './lyricsSources'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function version(partial: Partial<LyricsVersion> = {}): LyricsVersion {
  return {
    label: 'Standard',
    distinguishedBy: '',
    language: 'la',
    lyrics: 'Ave verum corpus natum,\nde Maria Virgine,\nvere passum immolatum.',
    sourceUrl: 'https://example.org/ave',
    sourceTitle: 'Example',
    confidence: 'high',
    copyrightStatus: 'public_domain',
    ...partial,
  }
}

function searchResult(partial: Partial<LyricsSearchResult> = {}): LyricsSearchResult {
  return {
    status: 'found',
    work: { title: 'Ave verum corpus', composer: 'Mozart', textAuthor: '' },
    versions: [version()],
    conflictSummary: '',
    notes: '',
    needsTranslation: [true],
    ...partial,
  }
}

function review(partial: Partial<LyricsReview> = {}): LyricsReview {
  return {
    verdict: 'clean',
    language: 'la',
    summary: 'Looks fine.',
    issues: [],
    cleanedLyrics: '',
    titleSuggestion: '',
    composerSuggestion: '',
    sources: [],
    verified: false,
    origin: 'url',
    lineCount: 3,
    checkedLyrics: '',
    ...partial,
  }
}

function deps(over: Partial<BatchDeps> = {}): Partial<BatchDeps> {
  return {
    findLyrics: vi.fn(async () => searchResult()),
    extractLyricsFromScan: vi.fn(async () => 'Ky- ri- e\ne- lei- son'),
    checkLyrics: vi.fn(async () => review()),
    ...over,
  }
}

function lookupJob(partial: Partial<BatchJob> = {}): BatchJob {
  return {
    id: 'j1',
    source: 'lookup',
    label: 'Ave verum corpus',
    title: 'Ave verum corpus',
    composer: '',
    stage: 'queued',
    selected: false,
    ...partial,
  }
}

// ── Parsing ───────────────────────────────────────────────────────────────────

describe('parseBatchList', () => {
  it('makes one job per line', () => {
    const jobs = parseBatchList('Gamle Norge\nDeilig er jorden')
    expect(jobs.map((j) => j.title)).toEqual(['Gamle Norge', 'Deilig er jorden'])
    expect(jobs.every((j) => j.source === 'lookup' && j.stage === 'queued')).toBe(true)
  })

  it('splits a composer off the title', () => {
    const jobs = parseBatchList([
      'Ave verum corpus - Mozart',
      'Deilig er jorden – Ingemann',
      'Hymne a l’amour — Edith Piaf',
      'Gamle Norge | Nordraak',
      'Jesu dulcis by Victoria',
      'Sommarpsalm av Waldemar Åhlén',
    ].join('\n'))
    expect(jobs.map((j) => [j.title, j.composer])).toEqual([
      ['Ave verum corpus', 'Mozart'],
      ['Deilig er jorden', 'Ingemann'],
      ['Hymne a l’amour', 'Edith Piaf'],
      ['Gamle Norge', 'Nordraak'],
      ['Jesu dulcis', 'Victoria'],
      ['Sommarpsalm', 'Waldemar Åhlén'],
    ])
  })

  it('skips blanks and comments', () => {
    expect(parseBatchList('\n\n# a note\n  \nGamle Norge\n')).toHaveLength(1)
  })

  it('strips list bullets and numbering', () => {
    const jobs = parseBatchList('- Gamle Norge\n* Ett glass\n1. Ave verum\n2) Deilig er jorden')
    expect(jobs.map((j) => j.title)).toEqual([
      'Gamle Norge',
      'Ett glass',
      'Ave verum',
      'Deilig er jorden',
    ])
  })

  it('looks a repeated title up only once, however it is spelled', () => {
    const jobs = parseBatchList('Gamle Norge\ngamle  norge\nGAMLE NORGE - Nordraak')
    expect(jobs).toHaveLength(1)
  })

  it('gives every job its own id', () => {
    const jobs = parseBatchList('One\nTwo\nThree')
    expect(new Set(jobs.map((j) => j.id)).size).toBe(3)
  })
})

describe('titleFromFilename', () => {
  it('drops the extension and tidies separators', () => {
    expect(titleFromFilename('Ave_verum_corpus.pdf')).toBe('Ave verum corpus')
    expect(titleFromFilename('scan 2.PNG')).toBe('scan 2')
  })
})

describe('jobsFromFiles', () => {
  const file = (name: string) => new File(['x'], name, { type: 'image/png' })

  it('queues a job per accepted file', () => {
    const jobs = jobsFromFiles([file('a.png'), file('b.png')], () => null)
    expect(jobs.map((j) => j.stage)).toEqual(['queued', 'queued'])
    expect(jobs[0].source).toBe('scan')
  })

  it('fails a rejected file up front instead of calling the API', () => {
    const jobs = jobsFromFiles([file('huge.png')], () => 'Too large')
    expect(jobs[0].stage).toBe('failed')
    expect(jobs[0].error).toBe('Too large')
  })
})

// ── Grading ───────────────────────────────────────────────────────────────────

describe('gradeOutcome', () => {
  it('passes a clean, confident, single-version text', () => {
    const q = gradeOutcome({ lineCount: 12, confidence: 'high', copyrightStatus: 'public_domain', alternatives: 0, review: review() })
    expect(q.grade).toBe('ready')
    expect(q.score).toBe(100)
    expect(q.reasons).toEqual(['Clean'])
  })

  it('refuses a text with nothing to drill', () => {
    const q = gradeOutcome({ lineCount: 0, alternatives: 0, review: review() })
    expect(q.grade).toBe('poor')
    expect(q.reasons).toEqual(['No lines to drill'])
  })

  it('sends a blocker to review', () => {
    const q = gradeOutcome({
      lineCount: 10,
      confidence: 'high',
      alternatives: 0,
      review: review({
        verdict: 'needs_work',
        issues: [{ type: 'garbled_text', severity: 'blocker', line: 3, quote: 'x', problem: 'p', suggestion: '' }],
      }),
    })
    expect(q.grade).toBe('review')
    expect(q.reasons).toContain('1 blocker')
  })

  it('stacks several blockers down to unusable', () => {
    const issues = Array.from({ length: 4 }, (_, i) => ({
      type: 'garbled_text' as const, severity: 'blocker' as const, line: i, quote: 'x', problem: 'p', suggestion: '',
    }))
    const q = gradeOutcome({ lineCount: 10, confidence: 'medium', alternatives: 0, review: review({ verdict: 'needs_work', issues }) })
    expect(q.grade).toBe('poor')
  })

  it('flags a work whose sources disagreed', () => {
    const q = gradeOutcome({ lineCount: 10, confidence: 'high', alternatives: 2, review: review() })
    expect(q.reasons).toContain('2 other versions found')
    expect(q.grade).toBe('ready') // still clean, just worth knowing
  })

  it('flags copyrighted text rather than passing it through', () => {
    const q = gradeOutcome({ lineCount: 10, confidence: 'high', copyrightStatus: 'under_copyright', alternatives: 0, review: review() })
    expect(q.grade).toBe('review')
    expect(q.reasons).toContain('Likely still under copyright')
  })

  it('says so when the quality check never ran', () => {
    const q = gradeOutcome({ lineCount: 10, confidence: 'high', alternatives: 0, review: null, reviewFailed: true })
    expect(q.reasons).toContain('Quality check could not run')
    expect(q.grade).toBe('ready')
  })

  it('penalises a text with almost no lines', () => {
    const q = gradeOutcome({ lineCount: 2, confidence: 'low', alternatives: 0, review: review() })
    expect(q.reasons).toContain('Only 2 lines')
    expect(q.reasons).toContain('Low confidence in the source')
    // Thin and poorly sourced, but a singer can still look at two lines.
    expect(q.grade).toBe('review')
  })
})

// ── Running ───────────────────────────────────────────────────────────────────

describe('runJob', () => {
  it('takes a lookup through search, preparation and the check', async () => {
    const d = deps()
    const finished = await runJob(lookupJob(), { deps: d })

    expect(finished.stage).toBe('done')
    expect(finished.outcome?.title).toBe('Ave verum corpus')
    expect(finished.outcome?.composer).toBe('Mozart')
    expect(finished.outcome?.lineCount).toBe(3)
    expect(finished.outcome?.sourceUrl).toBe('https://example.org/ave')
    expect(finished.outcome?.quality.grade).toBe('ready')
    expect(finished.selected).toBe(true)
    expect(d.checkLyrics).toHaveBeenCalledOnce()
  })

  it('reports the stages in order', async () => {
    const stages: string[] = []
    await runJob(lookupJob(), { deps: deps(), onStage: (s) => stages.push(s) })
    expect(stages).toEqual(['fetching', 'checking'])
  })

  it('fails a work that was not found, without checking anything', async () => {
    const d = deps({ findLyrics: vi.fn(async () => searchResult({ status: 'not_found', versions: [], notes: 'Nothing out there' })) })
    const finished = await runJob(lookupJob(), { deps: d })
    expect(finished.stage).toBe('failed')
    expect(finished.error).toBe('Nothing out there')
    expect(d.checkLyrics).not.toHaveBeenCalled()
  })

  it('fails a copyright-restricted work with advice to scan instead', async () => {
    const d = deps({
      findLyrics: vi.fn(async () => searchResult({ status: 'copyright_restricted', versions: [version({ lyrics: '' })], notes: '' })),
    })
    const finished = await runJob(lookupJob(), { deps: d })
    expect(finished.stage).toBe('failed')
    expect(finished.error).toMatch(/copyright/i)
  })

  it('turns an endpoint error into a failed job, not a throw', async () => {
    const d = deps({ findLyrics: vi.fn(async () => { throw new LyricsSourceError('Rate limited') }) })
    const finished = await runJob(lookupJob(), { deps: d })
    expect(finished.stage).toBe('failed')
    expect(finished.error).toBe('Rate limited')
  })

  it('keeps the text when the quality check falls over', async () => {
    const d = deps({ checkLyrics: vi.fn(async () => { throw new Error('check is down') }) })
    const finished = await runJob(lookupJob(), { deps: d })
    expect(finished.stage).toBe('done')
    expect(finished.outcome?.review).toBeNull()
    expect(finished.outcome?.quality.reasons).toContain('Quality check could not run')
  })

  it('runs a scan through OCR and rejoins the split syllables', async () => {
    const file = new File(['x'], 'kyrie.png', { type: 'image/png' })
    const finished = await runJob(
      { ...lookupJob(), source: 'scan', file, title: 'kyrie', label: 'kyrie.png' },
      { deps: deps() },
    )
    expect(finished.stage).toBe('done')
    expect(finished.outcome?.lyrics).not.toMatch(/Ky- ri- e/)
    expect(finished.outcome?.lyrics).toMatch(/Kyrie/)
  })

  it('prefers the title the quality check establishes over a filename', async () => {
    const file = new File(['x'], 'IMG_4821.png', { type: 'image/png' })
    const d = deps({ checkLyrics: vi.fn(async () => review({ titleSuggestion: 'Kyrie eleison', composerSuggestion: 'Palestrina' })) })
    const finished = await runJob(
      { ...lookupJob(), source: 'scan', file, title: 'IMG 4821', label: 'IMG_4821.png' },
      { deps: d },
    )
    expect(finished.outcome?.title).toBe('Kyrie eleison')
    expect(finished.outcome?.composer).toBe('Palestrina')
  })

  it('carries the other versions through so the singer can choose', async () => {
    const d = deps({
      findLyrics: vi.fn(async () => searchResult({
        versions: [version(), version({ label: 'Shorter', distinguishedBy: 'three verses' })],
        conflictSummary: 'One has four verses, the other three.',
      })),
    })
    const finished = await runJob(lookupJob(), { deps: d })
    expect(finished.outcome?.alternatives).toHaveLength(1)
    expect(finished.outcome?.conflictSummary).toMatch(/four verses/)
  })

  it('leaves a poor result unticked', async () => {
    const issues = Array.from({ length: 3 }, (_, i) => ({
      type: 'garbled_text' as const, severity: 'blocker' as const, line: i, quote: 'x', problem: 'p', suggestion: '',
    }))
    const d = deps({
      findLyrics: vi.fn(async () => searchResult({ versions: [version({ confidence: 'low' })] })),
      checkLyrics: vi.fn(async () => review({ verdict: 'needs_work', issues })),
    })
    const finished = await runJob(lookupJob(), { deps: d })
    expect(finished.outcome?.quality.grade).toBe('poor')
    expect(finished.selected).toBe(false)
  })

  it('reports a cancelled run as cancelled, not failed', async () => {
    const controller = new AbortController()
    const d = deps({
      findLyrics: vi.fn(async () => { controller.abort(); throw new Error('aborted') }),
    })
    const finished = await runJob(lookupJob(), { deps: d, signal: controller.signal })
    expect(finished.stage).toBe('cancelled')
  })
})

describe('runBatch', () => {
  it('runs every queued job and leaves the already-failed ones alone', async () => {
    const jobs = [lookupJob({ id: 'a' }), lookupJob({ id: 'b' }), lookupJob({ id: 'c', stage: 'failed', error: 'Too large' })]
    const seen = new Map<string, BatchJob>()
    await runBatch(jobs, { deps: deps(), onUpdate: (j) => seen.set(j.id, j) })

    expect(seen.get('a')?.stage).toBe('done')
    expect(seen.get('b')?.stage).toBe('done')
    expect(seen.has('c')).toBe(false)
  })

  it('never has more than the limit in flight', async () => {
    let inFlight = 0
    let peak = 0
    const d = deps({
      findLyrics: vi.fn(async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight--
        return searchResult()
      }),
    })
    const jobs = Array.from({ length: 7 }, (_, i) => lookupJob({ id: `j${i}` }))
    await runBatch(jobs, { limit: 2, deps: d, onUpdate: () => {} })
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('keeps going when one job fails', async () => {
    let call = 0
    const d = deps({
      findLyrics: vi.fn(async () => {
        if (++call === 1) throw new LyricsSourceError('boom')
        return searchResult()
      }),
    })
    const jobs = Array.from({ length: 3 }, (_, i) => lookupJob({ id: `j${i}` }))
    const done = new Map<string, BatchJob>()
    await runBatch(jobs, { limit: 1, deps: d, onUpdate: (j) => done.set(j.id, j) })

    const stages = [...done.values()].map((j) => j.stage).sort()
    expect(stages).toEqual(['done', 'done', 'failed'])
  })
})

describe('summarize', () => {
  it('counts the run the way the progress line reads it', async () => {
    const d = deps()
    const a = await runJob(lookupJob({ id: 'a' }), { deps: d })
    const failed: BatchJob = { ...lookupJob({ id: 'b' }), stage: 'failed', error: 'x' }
    const running: BatchJob = { ...lookupJob({ id: 'c' }), stage: 'checking' }

    expect(summarize([a, failed, running])).toEqual({
      total: 3, finished: 2, running: 1, ready: 1, review: 0, poor: 0, failed: 1, selected: 1,
    })
  })
})

describe('stageLabel', () => {
  it('names the fetch step after where the text is coming from', () => {
    expect(stageLabel('fetching', 'lookup')).toBe('Searching for the text')
    expect(stageLabel('fetching', 'scan')).toBe('Reading the scan')
  })
})
