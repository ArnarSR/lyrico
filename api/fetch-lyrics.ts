export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  const url = new URL(request.url).searchParams.get('url')
  if (!url) {
    return json({ error: 'url parameter required' }, 400)
  }

  let html: string
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!res.ok) return json({ error: `Remote returned ${res.status}` }, 502)
    html = await res.text()
  } catch {
    return json({ error: 'Could not fetch URL' }, 502)
  }

  const lyrics = extractText(html)
  return json({ lyrics })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function extractText(html: string): string {
  // Strip elements that never contain lyrics
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Try to narrow to a lyrics container first
  const narrowed = tryExtractContainer(text)
  if (narrowed) text = narrowed

  // Block-level elements → newlines
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')

  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

  // Normalize whitespace within lines, collapse blank lines
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())

  const result: string[] = []
  let blanks = 0
  for (const line of lines) {
    if (!line) {
      blanks++
      if (blanks === 1) result.push('') // at most one blank line in a row
    } else {
      blanks = 0
      result.push(line)
    }
  }

  return result.join('\n').trim()
}

function tryExtractContainer(html: string): string | null {
  // Patterns commonly used for lyrics on text/sheet-music sites
  const patterns = [
    /class="[^"]*lyric[^"]*"[\s\S]*?>([\s\S]*?)<\/(?:div|section|article)/i,
    /class="[^"]*song[-_]?text[^"]*"[\s\S]*?>([\s\S]*?)<\/(?:div|section|article)/i,
    /class="[^"]*text[-_]?content[^"]*"[\s\S]*?>([\s\S]*?)<\/(?:div|section|article)/i,
    /<article[\s\S]*?>([\s\S]*?)<\/article>/i,
    /<main[\s\S]*?>([\s\S]*?)<\/main>/i,
  ]
  for (const pattern of patterns) {
    const m = html.match(pattern)
    if (m?.[1] && m[1].length > 100) return m[1]
  }
  return null
}
