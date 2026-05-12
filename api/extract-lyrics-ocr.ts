export const config = { runtime: 'edge' }

const PROMPT = `You are extracting sung lyrics from a sheet music scan.

Rules:
- Output ONLY the lyrics/text that is sung, nothing else
- Reconstruct hyphenated syllables into complete words (e.g. "Ky- ri- e" → "Kyrie")
- One sung phrase per line, in the order they appear in the score
- If a phrase repeats on the same system, include it only once
- Ignore: composer names, tempo markings, dynamic markings (p, f, mf), instrument labels, bar numbers, rehearsal letters, copyright, page numbers
- If there are multiple verses stacked under the same notes, output each verse separately, labelled "Vers 1:", "Vers 2:", etc.
- If no lyrics are found, reply with exactly: NO_LYRICS`

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

  // Convert file to base64
  const buffer = await file.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))

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
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
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
    return json({ error: `Anthropic API error ${result.status}: ${body}` }, 502)
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
