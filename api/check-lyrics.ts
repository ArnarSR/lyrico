import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { apiKey, cors, errorResponse, json, parseJson, runStructured } from '../lib/claude.ts'

export const config = { runtime: 'edge' }

/** Anything longer than this is not a song — refuse before paying for tokens. */
const MAX_CHARS = 20_000
const MAX_LINES = 600

// ── Schema ───────────────────────────────────────────────────────────────────

const IssueSchema = z.object({
  type: z
    .enum([
      'garbled_text',
      'ocr_artifact',
      'encoding',
      'not_lyrics',
      'section_label',
      'duplicate_line',
      'line_break',
      'wrong_word',
      'missing_text',
      'language_mix',
      'punctuation',
      'metadata',
      'copyright',
      'other',
    ])
    .describe('What kind of problem this is'),
  severity: z
    .enum(['blocker', 'warning', 'nit'])
    .describe('blocker: the singer would memorise something wrong. warning: worth fixing before drilling. nit: cosmetic.'),
  line: z
    .number()
    .int()
    .describe('The numbered line the problem is on, using the numbers in the prompt. 0 when it concerns the text as a whole.'),
  quote: z.string().describe('The exact offending text, copied verbatim. Empty string for whole-text issues.'),
  problem: z.string().describe('One sentence: what is wrong.'),
  suggestion: z.string().describe('One sentence: what it should be instead. Empty string when you cannot tell.'),
})

const ReviewSchema = z.object({
  verdict: z
    .enum(['clean', 'minor', 'needs_work'])
    .describe('clean: ready to drill. minor: only nits. needs_work: at least one blocker or several warnings.'),
  language: z.string().describe('ISO 639-1 code of the lyrics, e.g. "la", "no", "en", "de"'),
  summary: z.string().describe('Two sentences at most, addressed to the singer who pasted this text.'),
  issues: z.array(IssueSchema).describe('Every problem found, worst first. Empty array when the text is clean.'),
  cleanedLyrics: z
    .string()
    .describe('The text with exactly the flagged fixes applied, one sung line per row, no line numbers, stanza blank lines preserved. Empty string when nothing needs changing or when you cannot fix it safely.'),
  titleSuggestion: z.string().describe('A corrected song title, or empty string when the given one is fine.'),
  composerSuggestion: z.string().describe('A corrected or filled-in composer, or empty string when the given one is fine or you cannot establish it.'),
  sources: z
    .array(z.object({ url: z.string(), title: z.string() }))
    .describe('Pages actually retrieved while checking the text. Empty array when you did not search.'),
})

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM = `You are the quality gate for lyrics being added to Lyrico, a spaced-repetition app for choir singers.

Every non-empty line of the text becomes one flashcard, and the singer drills it until they can reproduce it from memory. A garbled line is worse than a missing one: they will memorise the mistake and sing it at the concert. Your job is to catch what a careful choir librarian would catch before the text goes into rehearsal.

WHAT TO FLAG

- garbled_text — words that are not words, mangled word order, text that breaks off mid-sentence.
- ocr_artifact — leftovers from a sheet-music scan: syllable hyphens that were never rejoined ("Ky- ri- e"), dynamics and tempo markings (p, mf, cresc., Andante), bar or page numbers, rehearsal letters, instrument or voice labels, footnotes.
- encoding — mojibake from a bad import: "Ã¦", "â€™", "&nbsp;", stray HTML.
- not_lyrics — lines that are not sung at all. This is the most common problem in pasted text, so be thorough: composer, arranger, poet and translator credits; edition, publisher, catalogue and copyright notices; "Lyrics licensed by…", "Submitted by…", "Print this page", cookie and consent text, menus and breadcrumbs, "Related songs", "You might also like", advertisements, view and comment counts, dates, share buttons, video or audio captions, page titles repeated above the text, and anything that reads like a web page rather than a text to sing.
- section_label — "Vers 1:", "Chorus", "Refreng", "D.C. al fine" and the like. These are structure, not text to memorise; the app keeps stanzas apart with blank lines instead.
- duplicate_line — the same line repeated because a score wrote out a repeat. Flag it only when the repetition is an artifact, never when the text itself genuinely repeats a line.
- line_break — a row holding several sung lines (too much for one flashcard), or a sung line split across two rows mid-phrase.
- wrong_word — a word that looks like a mishearing, a typo or the wrong inflection for this text.
- missing_text — a verse or refrain that plainly belongs to this work and is not here. Say which one; never write it in yourself unless you retrieved it.
- language_mix — a translation interleaved with the original, or two languages mixed in one text. The singer wants only the text they sing.
- punctuation — punctuation or capitalisation so inconsistent that it will trip up recall.
- metadata — the title or composer given does not match the text.
- copyright — the text looks like it is still under copyright. Songs can be shared with other users from this app, so say so plainly.

RULES

1. Report, do not rewrite. You are not improving the poetry, modernising spelling or regularising a historical text. Leave archaic and dialect forms alone — Norwegian nynorsk, gammelnorsk spelling, Latin "u"/"v" conventions and Danish-Norwegian forms are all correct as written. Flag only what is genuinely wrong.

2. Never invent lyrics. Do not add, complete or extend the text from memory. Only text you actually retrieved from a source in this turn may be treated as established, and then you must list the source.

3. cleanedLyrics must contain exactly the fixes you flagged and nothing else — same text, same order, same language, no line numbers, stanza blank lines preserved. If the only issues are ones you cannot fix mechanically (missing_text, copyright, metadata), return an empty string. Removing more than a few lines is a red flag: prefer flagging to deleting.

4. When the text is fine, say so: verdict "clean", empty issues array, empty cleanedLyrics. Do not invent problems to look useful. A plain, correctly typed text with no markings is the normal case.

5. line numbers refer to the numbered lines in the prompt, counting blank lines. Use 0 only for something about the text as a whole.`

/**
 * Where the text came from decides what goes wrong with it, so the reviewer is
 * told. A URL import arrives wrapped in page furniture, a scan arrives with
 * hyphenated syllables and markings, typed text has typos.
 */
const ORIGIN_GUIDANCE: Record<string, string> = {
  url: `

WHERE THIS TEXT CAME FROM

It was scraped from a web page, so assume the page's own furniture came with it. The extractor is a blunt HTML-to-text pass: it keeps navigation, headings, credits, licence lines, cookie banners, "related songs" lists, comment counts and advertising whenever they sit near the text. Work through the text line by line and flag every line that is not sung, even when there are many of them — that is expected here, and removing them is the single most valuable thing you can do. Be equally alert to encoding damage ("Ã¦", "â€™", "&nbsp;", stray tags), to a repeated page title above the first verse, and to a line where the site ran two sung lines together or broke one in half.`,
  ocr: `

WHERE THIS TEXT CAME FROM

It was read off a sheet-music scan, so expect scan artifacts: syllables still split by hyphens, dynamics and tempo markings, bar numbers, rehearsal letters, voice and instrument labels, footnote markers, and lines in the wrong order where the reader crossed a system break. Verse labels such as "Vers 1:" are the extractor's own, not text to sing.`,
  typed: `

WHERE THIS TEXT CAME FROM

It was typed or pasted in by hand, so expect typos, an inconsistent line layout, a heading or title line above the text, and lines that hold more than one sung phrase. Anything pasted from elsewhere may still carry its source's credits and markings — flag those as not lyrics.`,
}

const VERIFY_EXTRA = `

VERIFICATION

Check the text against real sources before you answer. Search for this work, retrieve at least two independent pages where the work plausibly has variants, and compare line by line. Then:

- Only report wrong_word or missing_text when a source you retrieved actually disagrees with the pasted text, and name the source.
- A different-but-attested variant is not an error. Many hymns are sung with 3 of 7 verses, and editions differ in spelling. When the pasted text is one legitimate variant and your sources show another, say so in the summary rather than "correcting" it.
- List every page you retrieved in sources.`

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405)

  const key = apiKey()
  if (!key) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

  let body: {
    title?: string
    composer?: string
    lyrics?: string
    verify?: boolean
    origin?: 'url' | 'ocr' | 'typed'
    sourceUrl?: string
  }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }

  const lyrics = (body.lyrics ?? '').replace(/\r\n/g, '\n').trimEnd()
  if (!lyrics.trim()) return json({ error: 'lyrics is required' }, 400)
  if (lyrics.length > MAX_CHARS) return json({ error: `Lyrics are too long to check (${lyrics.length} of max ${MAX_CHARS} characters)` }, 413)

  const lines = lyrics.split('\n')
  if (lines.length > MAX_LINES) return json({ error: `Too many lines to check (${lines.length} of max ${MAX_LINES})` }, 413)

  const title = body.title?.trim() || ''
  const composer = body.composer?.trim() || ''
  const verify = body.verify === true
  const origin = body.origin && body.origin in ORIGIN_GUIDANCE ? body.origin : null
  const sourceUrl = body.sourceUrl?.trim().slice(0, 500) || ''

  // Numbered so the line field in each issue points at something the client can
  // map back to a row in the textarea.
  const numbered = lines.map((line, i) => `${i + 1}: ${line}`).join('\n')

  const client = new Anthropic({ apiKey: key })

  try {
    const message = await runStructured(client, {
      system: SYSTEM + (origin ? ORIGIN_GUIDANCE[origin] : '') + (verify ? VERIFY_EXTRA : ''),
      search: verify,
      format: zodOutputFormat(ReviewSchema),
      prompt: [
        title ? `Title as entered: ${title}` : 'Title as entered: (none given)',
        composer ? `Composer as entered: ${composer}` : 'Composer as entered: (none given)',
        sourceUrl ? `Imported from: ${sourceUrl}` : '',
        '',
        `Review these ${lines.length} numbered lines. The numbers are not part of the text.`,
        '',
        numbered,
      ].join('\n'),
    })

    const parsed = parseJson(message, ReviewSchema)
    if (!parsed.ok) return json({ error: parsed.error }, 502)

    const review = parsed.value
    return json({
      ...review,
      // Drop a cleaned version that is identical to the input — the client then
      // has nothing to offer the user.
      cleanedLyrics: review.cleanedLyrics.trim() === lyrics.trim() ? '' : review.cleanedLyrics,
      verified: verify,
      origin: origin ?? 'typed',
      lineCount: lines.length,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
