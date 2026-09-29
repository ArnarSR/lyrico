export const config = { runtime: 'edge' }

const PROMPT = `You are extracting sung lyrics from a sheet music scan.

Every line you output becomes one flashcard that a choir singer drills until they
can reproduce it from memory, so the line breaks matter as much as the words.

WHAT TO OUTPUT
- Only text that is actually sung, plus translations as described below
- Reconstruct hyphenated syllables into complete words (e.g. "Ky- ri- e" → "Kyrie")
- If no lyrics are found, reply with exactly: NO_LYRICS

WHERE TO BREAK LINES
- One sung phrase per line — a phrase is what a singer takes in one breath, and
  it is marked in the score by punctuation, a rest, or a slur ending
- A score breaks a phrase wherever the system ends. Do NOT copy those breaks:
  join the fragments back into the phrase they belong to
- Equally, do not run two phrases onto one line because they share a staff
- Aim for 3 to 10 words per line; punctuation wins over word count
- Separate verses and sections with a blank line
- If a phrase repeats on the same system because of a repeat sign, include it once

TRANSLATIONS
- Many scores print a translation as well as the singing text: a second language
  under the notes, in brackets, or as its own block. It is not sung, and drilling
  it would double the singer's work
- Put the sung text on its own line, and the translation of that line directly
  underneath prefixed with "> ", like this:
      Ave verum corpus natum
      > Hail, true body, born
- Translate nothing yourself. Only copy a translation the score actually prints
- When the score prints several verses of singing text under the same notes,
  those are all sung: output each verse separately, labelled "Vers 1:", "Vers 2:",
  and do not mark any of them as a translation

IGNORE
- Composer, arranger and poet credits, copyright and edition lines
- Tempo and dynamic markings (p, f, mf, cresc., Andante), fermatas, D.C. al fine
- Instrument and voice labels (Sopran:, S.A.T.B.), bar numbers, rehearsal letters,
  page numbers, footnote markers`

// btoa(String.fromCharCode(...bigArray)) overflows the call stack for large files
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors })
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim()
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return json({ error: 'Expected multipart/form-data' }, 400)
  }

  const file = formData.get('file') as File | null
  if (!file) return json({ error: 'No file provided' }, 400)

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
  if (!allowedTypes.includes(file.type)) {
    return json({ error: `Unsupported file type: ${file.type}` }, 400)
  }

  const base64 = arrayBufferToBase64(await file.arrayBuffer())
  const isImage = file.type.startsWith('image/')

  const contentBlock = isImage
    ? { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }

  let result: Response
  try {
    result = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    })
  } catch {
    return json({ error: 'Failed to reach Anthropic API' }, 502)
  }

  if (!result.ok) {
    const body = await result.text()
    // Surface the actual Anthropic error message
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } }
      const msg = parsed?.error?.message ?? body
      return json({ error: msg }, 502)
    } catch {
      return json({ error: body }, 502)
    }
  }

  const data = await result.json() as { content: { type: string; text: string }[] }
  const text = data.content.find((b) => b.type === 'text')?.text?.trim() ?? ''

  if (text === 'NO_LYRICS') return json({ error: 'No lyrics found in this image' }, 422)

  return json({ lyrics: text })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  })
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }
