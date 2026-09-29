/**
 * Smoke test for the lyrics quality check against the live Anthropic API.
 *
 * Unit tests cover the client side; this is the only way to see whether the
 * prompt and the schema in api/check-lyrics.ts actually hold up on real text.
 * It calls the edge handler directly, so there is no dev server to start. It
 * runs through vite-node because the endpoints import shared code without a
 * file extension — the only form Vercel's function builder accepts.
 *
 * The key comes from ANTHROPIC_API_KEY, in the environment or in .env (which is
 * gitignored). It is a server-side key: never give it a VITE_ prefix, or Vite
 * would bundle it into the app the browser downloads.
 *
 *   npm run smoke:check-lyrics
 *   npm run smoke:check-lyrics -- --verify        # let it search the web too
 *   npm run smoke:check-lyrics -- --origin=typed
 *   npm run smoke:check-lyrics -- --file=my-lyrics.txt --title="Ave verum"
 *
 * Costs a few cents per run, more with --verify.
 */
import { readFileSync } from 'node:fs'
import handler from '../api/check-lyrics'

/**
 * A scrape of a scanned hymn page, with one of every problem the reviewer is
 * supposed to catch: page furniture, credits, mojibake, unjoined syllables,
 * a repeated line, two sung lines sharing a row, and a section label.
 */
const SAMPLE = [
  'Ave Verum Corpus — Lyrics, Translation and Sheet Music | ChoralNet',
  'Home | Songs | Composers | Sign in',
  '',
  'Vers 1:',
  'Ave verum corpus, natum de Maria Virgine',
  'Ve- re pas- sum, im- mo- la- tum in cruce pro homine',
  'Cujus latus perforatum unda fluxit et sanguine',
  'Cujus latus perforatum unda fluxit et sanguine',
  'Esto nobis prÃ¦gustatum in mortis examine',
  '',
  'Music: W. A. Mozart (KV 618), p. 4, mf cresc.',
  'Lyrics licensed by LyricFind · 1 234 views · 12 comments',
  'Related songs you might like',
].join('\n')

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

const body = {
  title: arg('title') ?? 'Ave Verum Corpus',
  composer: arg('composer') ?? '',
  lyrics: arg('file') ? readFileSync(arg('file')!, 'utf8') : SAMPLE,
  origin: arg('origin') ?? 'url',
  sourceUrl: arg('sourceUrl') ?? 'https://www.choralnet.example/ave-verum-corpus',
  verify: process.argv.includes('--verify'),
}

if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error('ANTHROPIC_API_KEY is not set — this test talks to the real API.')
  console.error('Put it in .env (gitignored) as ANTHROPIC_API_KEY=sk-ant-… or export it in your shell.')
  process.exit(2)
}

console.log(`Checking ${body.lyrics.split('\n').length} lines (origin: ${body.origin}${body.verify ? ', with web search' : ''})…\n`)
const started = Date.now()

const response = await handler(
  new Request('https://lyrico.test/api/check-lyrics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
)

const result = await response.json() as Record<string, unknown>
const seconds = ((Date.now() - started) / 1000).toFixed(1)

if (!response.ok) {
  console.error(`✗ HTTP ${response.status} after ${seconds}s:`, result.error)
  process.exit(1)
}

interface Issue { severity: string; type: string; line: number; quote: string; problem: string; suggestion: string }

console.log(`${result.verdict} · ${result.language} · ${seconds}s`)
console.log(`\n${result.summary}\n`)

for (const i of (result.issues ?? []) as Issue[]) {
  console.log(`  [${i.severity}] ${i.type} · line ${i.line}`)
  if (i.quote) console.log(`    “${i.quote}”`)
  console.log(`    ${i.problem}`)
  if (i.suggestion) console.log(`    → ${i.suggestion}`)
}

if (result.cleanedLyrics) console.log(`\nCleaned:\n${result.cleanedLyrics}`)
for (const s of (result.sources ?? []) as { title: string; url: string }[]) {
  console.log(`\nSource: ${s.title} — ${s.url}`)
}

// What the reviewer is expected to find in SAMPLE. Not an assertion — the model
// phrases things its own way — but a fast read on whether it is doing its job.
if (!arg('file')) {
  const found = new Set(((result.issues ?? []) as Issue[]).map((i) => i.type))
  const expected = ['not_lyrics', 'ocr_artifact', 'duplicate_line', 'encoding', 'section_label', 'line_break']
  const missed = expected.filter((t) => !found.has(t))
  console.log(`\n${missed.length === 0 ? '✓ caught every planted problem' : `⚠ did not flag: ${missed.join(', ')}`}`)
}
