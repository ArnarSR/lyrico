import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

export const config = { runtime: 'edge' }

const MODEL = 'claude-opus-5'

// Languages a Norwegian choir singer reads without help. Anything else gets a
// line-by-line translation so they know what they are actually singing.
const UNDERSTOOD_LANGUAGES = ['no', 'nb', 'nn', 'en', 'da', 'sv']

// ── Schemas ──────────────────────────────────────────────────────────────────

const VersionSchema = z.object({
  label: z.string().describe('Short name for this version, e.g. "Mozart KV 618, standard liturgical text"'),
  distinguishedBy: z
    .string()
    .describe('What sets this version apart from the others found — which verses it has, spelling conventions, which edition or arrangement it belongs to. Empty string only when this is the single version found.'),
  language: z.string().describe('ISO 639-1 code of the lyrics themselves, e.g. "la", "no", "en", "de"'),
  lyrics: z.string().describe('The text, one sung line per row, no section labels, no chords, no translations mixed in'),
  sourceUrl: z.string().describe('URL the text was taken from'),
  sourceTitle: z.string().describe('Name of the source site or page'),
  confidence: z.enum(['high', 'medium', 'low']),
  copyrightStatus: z
    .enum(['public_domain', 'likely_public_domain', 'under_copyright', 'unclear'])
    .describe('Best assessment for the text itself (not the musical setting)'),
})

const SearchResultSchema = z.object({
  status: z.enum(['found', 'not_found', 'copyright_restricted']),
  work: z.object({
    title: z.string(),
    composer: z.string().describe('Empty string if not established'),
    textAuthor: z.string().describe('Author of the text if different from the composer, else empty string'),
  }),
  versions: z.array(VersionSchema),
  conflictSummary: z
    .string()
    .describe('When several versions were found: how they differ and which one a choir is most likely rehearsing. Empty string when only one version exists.'),
  notes: z.string().describe('Anything the singer should know — wrong-title matches, missing verses, sources that disagreed. Empty string if nothing to flag.'),
})

const TranslationSchema = z.object({
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  lines: z.array(
    z.object({
      original: z.string(),
      translated: z.string(),
    }),
  ),
  summary: z.string().describe('Two or three sentences on what the text is about and its context, for a singer who does not read the language'),
})

// ── Prompts ──────────────────────────────────────────────────────────────────

const SEARCH_SYSTEM = `You find the sung text of choral works so a singer can memorise it. You are used by Lyrico, a spaced-repetition app for choir singers.

The singer will drill this text word by word, so a wrong line is worse than no line at all.

RULES

1. Never write lyrics from memory. Every line you return must come from a page you actually retrieved in this turn, and you must return the URL you took it from. If searching finds nothing usable, return status "not_found" with an empty versions array.

2. Deconflict actively. Do not stop at the first source. Search until you can tell whether the text is stable across sources or whether versions differ, and consult at least two independent sources whenever the work plausibly has variants. Versions genuinely differ when they:
   - include or omit verses (many hymns are sung with 3 of 7 verses)
   - use different orthography (e.g. modern Norwegian vs. gammelnorsk spelling, "u"/"v" conventions in Latin)
   - belong to different editions, arrangements or musical settings of the same text
   - are a translation rather than the original language
   - are a different work that happens to share a title
   Return one entry per genuinely different version, most likely-to-be-rehearsed first, and fill in distinguishedBy for each. Put the comparison in conflictSummary. Do not merge variants into one composite text, and do not silently pick a winner.

3. Respect copyright. For text that is or may still be under copyright, set status "copyright_restricted" and return the version metadata and source links WITHOUT the lyrics field populated (use an empty string). Most Latin liturgical texts, traditional hymns, folk songs and pre-1930 poetry are public domain; contemporary works usually are not. When unsure, treat it as restricted.

4. Return lyrics clean: one sung line per row, no section labels ("Verse 1", "Chorus"), no chord symbols, no line numbers, no translations interleaved. Reconstruct hyphenated syllables from scores into whole words.`

const TRANSLATE_SYSTEM = `You translate the text of choral works for singers who are about to memorise and perform them.

Translate line by line, keeping each line of the original paired with its own translation, so the singer can see what the words mean at the point they are singing them. Preserve the line breaks of the original exactly — return one entry per input line, in order, even when a line is a fragment that only makes sense together with the next one.

Favour clear, literal meaning over poetic re-rendering: the singer needs to know what they are saying, not to have a singable version. Where a line is liturgically or historically loaded, explain it in the summary rather than padding the line translation.`

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405)

  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim()
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

  let body: { action?: string; title?: string; composer?: string; lyrics?: string; language?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }

  const client = new Anthropic({ apiKey })

  try {
    if (body.action === 'translate') return await translate(client, body)
    return await search(client, body)
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return json({ error: err.message, status: err.status }, 502)
    }
    return json({ error: err instanceof Error ? err.message : 'Request failed' }, 502)
  }
}

async function search(client: Anthropic, body: { title?: string; composer?: string }): Promise<Response> {
  const title = body.title?.trim()
  if (!title) return json({ error: 'title is required' }, 400)
  const composer = body.composer?.trim()

  const message = await runWithSearch(client, {
    system: SEARCH_SYSTEM,
    prompt: composer
      ? `Find the sung text of "${title}" by ${composer}.`
      : `Find the sung text of the choral work "${title}". The composer is unknown — if several different works share this title, return them as separate versions.`,
    format: zodOutputFormat(SearchResultSchema),
  })

  const parsed = parseJson(message, SearchResultSchema)
  if (!parsed.ok) return json({ error: parsed.error }, 502)

  const result = parsed.value
  // Flag which versions the singer will need translated. The client decides
  // whether to spend a second call on it.
  const needsTranslation = result.versions.map((v) => !UNDERSTOOD_LANGUAGES.includes(v.language.toLowerCase()))

  return json({ ...result, needsTranslation })
}

async function translate(
  client: Anthropic,
  body: { lyrics?: string; language?: string },
): Promise<Response> {
  const lyrics = body.lyrics?.trim()
  if (!lyrics) return json({ error: 'lyrics is required for action "translate"' }, 400)

  const target = body.language?.trim() || 'no'
  const lines = lyrics.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)

  const message = await client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: TRANSLATE_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(TranslationSchema) },
    messages: [
      {
        role: 'user',
        content: `Translate these ${lines.length} lines into ${target === 'no' ? 'Norwegian (bokmål)' : target}. Return exactly ${lines.length} line entries, in order.\n\n${lines.join('\n')}`,
      },
    ],
  }).finalMessage()

  const parsed = parseJson(message, TranslationSchema)
  if (!parsed.ok) return json({ error: parsed.error }, 502)

  return json(parsed.value)
}

/**
 * Runs a request with the server-side web search tool.
 *
 * Long search turns can come back with stop_reason "pause_turn" instead of a
 * finished answer; resuming means handing the paused assistant turn straight
 * back. Without this the endpoint would return a silently truncated result.
 */
async function runWithSearch(
  client: Anthropic,
  opts: { system: string; prompt: string; format: NonNullable<Anthropic.OutputConfig['format']> },
): Promise<Anthropic.Message> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: opts.prompt }]

  for (let attempt = 0; attempt < 4; attempt++) {
    const message = await client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: opts.system,
      thinking: { type: 'adaptive' },
      output_config: { format: opts.format },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      messages,
    }).finalMessage()

    if (message.stop_reason !== 'pause_turn') return message
    messages.push({ role: 'assistant', content: message.content })
  }

  throw new Error('Search did not finish — too many paused turns')
}

function parseJson<T extends z.ZodTypeAny>(
  message: Anthropic.Message,
  schema: T,
): { ok: true; value: z.infer<T> } | { ok: false; error: string } {
  if (message.stop_reason === 'refusal') {
    return { ok: false, error: 'The request was declined. This usually means the text is under copyright — scan the sheet music instead.' }
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  if (!text) return { ok: false, error: 'No text returned' }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Response was not valid JSON' }
  }

  const result = schema.safeParse(raw)
  if (!result.success) return { ok: false, error: `Response did not match the expected shape: ${result.error.message}` }
  return { ok: true, value: result.data }
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  })
}
